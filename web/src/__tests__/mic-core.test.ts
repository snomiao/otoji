import { describe, expect, it } from "vitest";
import { createRecognitionQueue, createSpeechGate, rms, SAMPLE_RATE } from "../../mic/core";

const frame = (level: number, samples = 320) => new Float32Array(samples).fill(level);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe("bounded in-memory speech gate", () => {
  it("copies incremental audio only while speech is active and discards it on stop", () => {
    const gate = createSpeechGate();
    expect(gate.snapshot()).toBeNull();
    gate.push(frame(0.1));
    gate.push(frame(0.1));
    const copy = gate.snapshot()!;
    expect(copy.length).toBe(640);
    copy[0] = 99;
    expect(gate.snapshot()![0]).toBeCloseTo(0.1);
    gate.discard();
    expect(gate.snapshot()).toBeNull();
  });
  it("calculates frame energy including empty buffers", () => {
    expect(rms(new Float32Array())).toBe(0);
    expect(rms(new Float32Array([-0.5, 0.5]))).toBeCloseTo(0.5);
  });

  it("never starts or emits utterances for sustained silence", () => {
    const gate = createSpeechGate();
    for (let n = 0; n < 1000; n++) expect(gate.push(frame(0))).toEqual({});
  });

  it("requires two consecutive loud frames rather than isolated spikes", () => {
    const gate = createSpeechGate();
    expect(gate.push(frame(0.08))).toEqual({});
    expect(gate.push(frame(0))).toEqual({});
    expect(gate.push(frame(0.08))).toEqual({});
    expect(gate.push(frame(0.08))).toEqual({ start: true });
  });

  it("emits speech after final silence and can start another utterance", () => {
    const gate = createSpeechGate({ silenceMs: 100 });
    gate.push(frame(0.08));
    expect(gate.push(frame(0.08))).toEqual({ start: true });
    gate.push(frame(0.08));
    gate.push(frame(0.08));
    for (let n = 0; n < 4; n++) expect(gate.push(frame(0))).toEqual({});
    const final = gate.push(frame(0));
    expect(final.segment).toBeInstanceOf(Float32Array);
    expect(final.segment!.length).toBe(9 * 320);
    expect(Array.from(final.segment!.slice(0, 320))).toEqual(Array.from(frame(0.08)));
    expect(gate.push(frame(0.08))).toEqual({});
    expect(gate.push(frame(0.08))).toEqual({ start: true });
  });

  it("rejects a sub-160ms sound and resets silence when speech resumes", () => {
    const short = createSpeechGate({ silenceMs: 20 });
    short.push(frame(0.08));
    short.push(frame(0.08));
    expect(short.push(frame(0)).segment).toBeUndefined();
    const gate = createSpeechGate({ silenceMs: 100 });
    gate.push(frame(0.08));
    gate.push(frame(0.08));
    for (let n = 0; n < 4; n++) gate.push(frame(0));
    expect(gate.push(frame(0.08))).toEqual({});
    expect(gate.push(frame(0))).toEqual({});
  });

  it("cuts continuous speech at the default twelve-second memory cap", () => {
    const gate = createSpeechGate();
    let segment: Float32Array | undefined;
    for (let n = 0; n < 1500; n++) {
      const event = gate.push(frame(0.08, 128));
      if (event.segment) {
        segment = event.segment;
        break;
      }
    }
    expect(segment?.length).toBe(12 * SAMPLE_RATE);
    expect(gate.push(frame(0.08, 128))).toEqual({});
  });

  it("truncates a non-divisible final frame rather than exceeding the twelve-second cap", () => {
    const gate = createSpeechGate();
    let segment: Float32Array | undefined;
    for (let n = 0; n < 400; n++) {
      const event = gate.push(frame(0.08, 511));
      if (event.segment) {
        segment = event.segment;
        break;
      }
    }
    expect(segment?.length).toBe(12 * SAMPLE_RATE);
    expect(segment?.at(-1)).toBeCloseTo(0.08);
  });

  it("discards speech and pre-roll without leaking old audio into a later utterance", () => {
    const gate = createSpeechGate({ silenceMs: 100 });
    gate.push(frame(0.15));
    gate.push(frame(0.15));
    gate.push(frame(0.15));
    gate.discard();
    expect(gate.push(frame(0))).toEqual({});
    expect(gate.push(frame(0.05))).toEqual({});
    expect(gate.push(frame(0.05))).toEqual({ start: true });
    gate.push(frame(0.05));
    let segment: Float32Array | undefined;
    for (let n = 0; n < 5; n++) segment = gate.push(frame(0)).segment ?? segment;
    expect(segment).toBeDefined();
    expect(Math.max(...segment!)).toBeLessThan(0.1);
  });
});

describe("serial bounded recognition queue", () => {
  it("starts operations in order and waits for prior recognition to finish", async () => {
    const queue = createRecognitionQueue();
    const hold = deferred<string>();
    const order: string[] = [];
    const first = queue.run(async () => {
      order.push("first:start");
      const result = await hold.promise;
      order.push("first:end");
      return result;
    });
    const second = queue.run(async () => {
      order.push("second");
      return "two";
    });
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    hold.resolve("one");
    expect(await first).toBe("one");
    expect(await second).toBe("two");
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("applies max-two backpressure without invoking a rejected operation", async () => {
    const queue = createRecognitionQueue();
    const hold = deferred<void>();
    const first = queue.run(() => hold.promise);
    const second = queue.run(async () => "queued");
    let invoked = false;
    await expect(
      queue.run(async () => {
        invoked = true;
      }),
    ).rejects.toThrow(/busy/i);
    expect(invoked).toBe(false);
    hold.resolve();
    await first;
    expect(await second).toBe("queued");
  });

  it("recovers after rejected and synchronously throwing operations", async () => {
    const queue = createRecognitionQueue();
    const first = queue.run(async () => {
      throw new Error("recognizer failed");
    });
    const second = queue.run(async () => "recovered");
    await expect(first).rejects.toThrow("recognizer failed");
    expect(await second).toBe("recovered");
    await expect(
      queue.run(() => {
        throw new Error("synchronous failure");
      }),
    ).rejects.toThrow("synchronous failure");
    expect(await queue.run(async () => "still available")).toBe("still available");
  });

  it("releases a completed slot before an awaiting caller enqueues more recognition", async () => {
    const queue = createRecognitionQueue(1);
    expect(await queue.run(async () => "first")).toBe("first");
    expect(await queue.run(async () => "immediate next")).toBe("immediate next");
    await expect(
      queue.run(async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    expect(await queue.run(async () => "immediate retry")).toBe("immediate retry");
  });

  it("accepts a new operation after the first finishes while the second remains queued", async () => {
    const queue = createRecognitionQueue();
    const holdFirst = deferred<void>();
    const holdSecond = deferred<void>();
    const first = queue.run(() => holdFirst.promise);
    const second = queue.run(() => holdSecond.promise);
    holdFirst.resolve();
    await first;
    const third = queue.run(async () => "third");
    holdSecond.resolve();
    await second;
    expect(await third).toBe("third");
  });
});

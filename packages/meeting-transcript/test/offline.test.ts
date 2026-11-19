import { describe, expect, it, vi } from "vitest";
import { transcribeMeeting, type MeetingWindowResult } from "../src/offline";
import {
  SAMPLE_RATE,
  type AsrSpan,
  type AudioWindow,
  type MeetingLine,
  type PcmFrame,
  type Transcribe,
} from "../src/types";

async function* source(...frames: PcmFrame[]) {
  yield* frames;
}
const audio = (
  seconds: number,
  startSample = 0,
  track: PcmFrame["track"] = "others",
  level = 0.1,
): PcmFrame => ({
  track,
  startSample,
  samples: new Float32Array(seconds * SAMPLE_RATE).fill(level),
});
async function collect(generator: AsyncIterable<MeetingLine>) {
  const result: MeetingLine[] = [];
  for await (const line of generator) result.push(line);
  return result;
}
const speech: Transcribe = async (window) => [
  {
    startMs: 0,
    endMs: Math.min(1000, (window.samples.length * 1000) / SAMPLE_RATE),
    text: `Window ${window.startSample}`,
  },
];

describe("bounded offline meeting transcription", () => {
  it("deduplicates CJK partial overlap without splitting on whitespace", async () => {
    const lines = await collect(
      transcribeMeeting(source(audio(2)), {
        transcribe: async () => [
          { startMs: 0, endMs: 800, text: "你好世界" },
          { startMs: 500, endMs: 1500, text: "世界你好" },
        ],
      }),
    );
    expect(lines.map((line) => line.text).join("")).toBe("你好世界你好");
    expect(lines.at(-1)?.endMs).toBe(1500);
  });
  it("processes an hour from 120s source chunks sequentially with at most 12s provider PCM", async () => {
    let produced = 0,
      active = 0,
      peakActive = 0,
      maximum = 0,
      calls = 0;
    let previous: AudioWindow | undefined;
    async function* hour() {
      for (let n = 0; n < 30; n++) {
        produced++;
        yield audio(120, n * 120 * SAMPLE_RATE);
      }
    }
    const transcribe: Transcribe = async (window) => {
      if (previous) expect(previous.samples.every((sample) => sample === 0)).toBe(true);
      previous = window;
      active++;
      peakActive = Math.max(peakActive, active);
      maximum = Math.max(maximum, window.samples.length);
      calls++;
      expect(produced * 120 * SAMPLE_RATE).toBeGreaterThanOrEqual(
        window.startSample + window.samples.length,
      );
      await Promise.resolve();
      active--;
      return [{ startMs: 0, endMs: 1000, text: `Utterance ${calls}` }];
    };
    const lines = await collect(transcribeMeeting(hour(), { transcribe }));
    expect(lines.length).toBe(calls);
    expect(calls).toBe(328);
    expect(maximum).toBeLessThanOrEqual(12 * SAMPLE_RATE);
    expect(peakActive).toBe(1);
    expect(produced).toBe(30);
    expect(previous!.samples.every((sample) => sample === 0)).toBe(true);
    expect(lines.at(-1)!.endMs).toBeLessThanOrEqual(3600000);
  });

  it("keeps tracks independent, uses integer absolute times, stable ids, and the me label", async () => {
    const transcribe: Transcribe = async () => [
      { startMs: 0.51, endMs: 1500.25, text: "A line", lang: "en" },
    ];
    const frames = [audio(2, 16001, "me"), audio(2, 32000, "others")];
    const lines = await collect(transcribeMeeting(source(...frames), { transcribe }));
    expect(lines).toEqual([
      {
        id: "me:1001",
        track: "me",
        startMs: 1001,
        endMs: 2500,
        speaker: "me",
        text: "A line",
        lang: "en",
      },
      {
        id: "others:2001",
        track: "others",
        startMs: 2001,
        endMs: 3500,
        speaker: "unknown",
        text: "A line",
        lang: "en",
      },
    ]);
  });

  it("flushes around explicit gaps without inventing silence or joining text across missing audio", async () => {
    const gaps = vi.fn();
    const windows: { start: number; length: number }[] = [];
    const transcribe: Transcribe = async (window) => {
      windows.push({ start: window.startSample, length: window.samples.length });
      return [{ startMs: 0, endMs: 1000, text: "repeat" }];
    };
    const lines = await collect(
      transcribeMeeting(source(audio(2), audio(2, 5 * SAMPLE_RATE)), { transcribe, onGap: gaps }),
    );
    expect(windows).toEqual([
      { start: 0, length: 2 * SAMPLE_RATE },
      { start: 5 * SAMPLE_RATE, length: 2 * SAMPLE_RATE },
    ]);
    expect(gaps.mock.calls).toEqual([
      [{ track: "others", startSample: 2 * SAMPLE_RATE, endSample: 5 * SAMPLE_RATE }],
    ]);
    expect(lines.map((line) => line.text)).toEqual(["repeat", "repeat"]);
    expect(lines.map((line) => line.startMs)).toEqual([0, 5000]);
  });

  it.each([0, SAMPLE_RATE, SAMPLE_RATE * 2 - 1])(
    "rejects duplicate/overlapping/out-of-order samples beginning at %s",
    async (start) => {
      const transcribe = vi.fn<Transcribe>().mockImplementation(speech);
      await expect(
        collect(transcribeMeeting(source(audio(2), audio(2, start)), { transcribe })),
      ).rejects.toMatchObject({ code: "timeline" });
      expect(transcribe).not.toHaveBeenCalled();
    },
  );

  it("trims exact repeated overlapping ASR text but preserves a legitimate later repeat", async () => {
    const transcribe: Transcribe = async () => [
      { startMs: 0, endMs: 2000, text: "Hello world" },
      { startMs: 1000, endMs: 3000, text: "world again" },
      { startMs: 5000, endMs: 6000, text: "Hello world" },
    ];
    const lines = await collect(transcribeMeeting(source(audio(8)), { transcribe }));
    expect(lines.map((line) => [line.startMs, line.endMs, line.text])).toEqual([
      [0, 3000, "Hello world again"],
      [5000, 6000, "Hello world"],
    ]);
  });

  it("decodes each owned sample once and skips exact overlapping duplicate spans", async () => {
    const calls: number[][] = [];
    const transcribe = vi.fn<Transcribe>().mockImplementation(async (window) => {
      calls.push([window.startSample, window.samples.length]);
      return [{ startMs: 0, endMs: 1000, text: "text" }];
    });
    await collect(transcribeMeeting(source(audio(12)), { transcribe }));
    expect(calls).toEqual([
      [0, 11 * SAMPLE_RATE],
      [11 * SAMPLE_RATE, SAMPLE_RATE],
    ]);
    const exact: Transcribe = async () => [
      { startMs: 0, endMs: 1000, text: "repeated tail" },
      { startMs: 100, endMs: 1000, text: "Repeated  tail" },
    ];
    expect(await collect(transcribeMeeting(source(audio(2)), { transcribe: exact }))).toHaveLength(
      1,
    );
  });

  it("merges adjacent same-speaker text only for compatible timing and preserves speaker changes", async () => {
    const transcribe: Transcribe = async () => [
      { startMs: 0, endMs: 1000, text: "First" },
      { startMs: 1000, endMs: 1400, text: "second" },
      { startMs: 2000, endMs: 2300, text: "Separate" },
      { startMs: 2600, endMs: 2900, text: "Later" },
    ];
    const lines = await collect(transcribeMeeting(source(audio(3, 0, "me")), { transcribe }));
    expect(lines.map((line) => line.text)).toEqual(["First second", "Separate", "Later"]);
  });

  it("keeps text when embeddings fail and reports sanitized advisory status without retries", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("private provider response token"));
    const transcribe = vi.fn<Transcribe>().mockImplementation(speech);
    const onStatus = vi.fn();
    const lines = await collect(
      transcribeMeeting(source(audio(2)), { transcribe, embed, diarization: { onStatus } }),
    );
    expect(lines[0].text).toBe("Window 0");
    expect(lines[0].speaker).toBe("unknown");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls).toEqual([["embedding-unavailable"]]);
  });

  it("decodes detected turns separately for an honest whole-window-text ASR provider", async () => {
    const embed = async (window: AudioWindow) =>
      window.startSample < SAMPLE_RATE ? new Float32Array([1, 0]) : new Float32Array([0, 1]);
    const transcribe: Transcribe = async (window) => [
      {
        startMs: 0,
        endMs: (window.samples.length * 1000) / SAMPLE_RATE,
        text: window.startSample === 0 ? "First voice" : "Second voice",
      },
    ];
    const lines = await collect(transcribeMeeting(source(audio(4)), { transcribe, embed }));
    expect(lines.map((line) => [line.startMs, line.endMs, line.speaker, line.text])).toEqual([
      [0, 1500, "A", "First voice"],
      [1500, 4000, "B", "Second voice"],
    ]);
  });

  it("aborts even an uncooperative ASR provider and zeroes its owned PCM without changing the caller", async () => {
    const original = audio(2);
    let pending!: AudioWindow;
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const transcribe: Transcribe = (window) => {
      pending = window;
      enter();
      return new Promise(() => {});
    };
    const controller = new AbortController();
    const consuming = collect(
      transcribeMeeting(source(original), { transcribe }, controller.signal),
    );
    await entered;
    controller.abort();
    await expect(consuming).rejects.toMatchObject({
      code: "aborted",
      message: "Meeting transcript aborted.",
    });
    expect(pending.samples.every((sample) => sample === 0)).toBe(true);
    expect(original.samples[0]).toBeCloseTo(0.1);
  });

  it("does not transcribe after early abort and sanitizes failures without fallback/retry", async () => {
    const controller = new AbortController();
    controller.abort();
    const transcribe = vi
      .fn<Transcribe>()
      .mockRejectedValue(new Error("private key raw transcript"));
    await expect(
      collect(transcribeMeeting(source(audio(2)), { transcribe }, controller.signal)),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(transcribe).not.toHaveBeenCalled();
    await expect(
      collect(transcribeMeeting(source(audio(2)), { transcribe })),
    ).rejects.toMatchObject({ code: "provider", message: "Meeting transcript provider." });
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it.each<{ spans: AsrSpan[] }>([
    { spans: [{ startMs: -1, endMs: 500, text: "invalid" }] },
    { spans: [{ startMs: 0, endMs: 3000, text: "invalid" }] },
    { spans: [{ startMs: 0, endMs: 0, text: "invalid" }] },
    {
      spans: [
        { startMs: 100, endMs: 500, text: "first" },
        { startMs: 0, endMs: 500, text: "out of order" },
      ],
    },
  ])("rejects invalid relative ASR timing instead of emitting it", async ({ spans }) => {
    await expect(
      collect(transcribeMeeting(source(audio(2)), { transcribe: async () => spans })),
    ).rejects.toMatchObject({ code: "output" });
  });

  it("rejects oversized source chunks and unsafe window configuration", async () => {
    await expect(
      collect(transcribeMeeting(source(audio(121)), { transcribe: speech })),
    ).rejects.toMatchObject({ code: "audio" });
    await expect(
      collect(transcribeMeeting(source(audio(2)), { transcribe: speech, windowMs: 12001 })),
    ).rejects.toMatchObject({ code: "config" });
  });

  it("awaits non-overlapping owned-window batches including silent final ranges", async () => {
    const batches: MeetingWindowResult[] = [];
    const transcribe: Transcribe = async (window) =>
      window.startSample >= 22 * SAMPLE_RATE
        ? []
        : [
            {
              startMs: 0,
              endMs: (window.samples.length * 1000) / SAMPLE_RATE,
              text: "whole owned turn",
            },
          ];
    const lines = await collect(
      transcribeMeeting(source(audio(24)), {
        transcribe,
        onWindow: async (batch) => {
          await Promise.resolve();
          batches.push(batch);
        },
      }),
    );
    expect(batches.map((batch) => [batch.startMs, batch.endMs])).toEqual([
      [0, 11000],
      [11000, 22000],
      [22000, 24000],
    ]);
    expect(batches[2].lines).toEqual([]);
    expect(batches.flatMap((batch) => batch.lines)).toEqual(lines);
    for (const batch of batches)
      for (const line of batch.lines) {
        expect(line.startMs).toBeGreaterThanOrEqual(batch.startMs);
        expect(line.endMs).toBeLessThanOrEqual(batch.endMs);
      }
  });

  it("skips ASR on silent me and others tracks but awaits both empty ownership batches", async () => {
    const transcribe = vi
      .fn<Transcribe>()
      .mockResolvedValue([{ startMs: 0, endMs: 2000, text: "Hallucinated silence" }]);
    const embed = vi.fn().mockResolvedValue(new Float32Array([1, 0]));
    const batches: MeetingWindowResult[] = [];
    const lines = await collect(
      transcribeMeeting(source(audio(2, 0, "me", 0), audio(2, 0, "others", 0)), {
        transcribe,
        embed,
        onWindow: async (batch) => {
          await Promise.resolve();
          batches.push(batch);
        },
      }),
    );
    expect(lines).toEqual([]);
    expect(transcribe).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(batches).toEqual([
      { track: "me", startMs: 0, endMs: 2000, lines: [] },
      { track: "others", startMs: 0, endMs: 2000, lines: [] },
    ]);
  });

  it("gates quiet owned PCM using the configured threshold and preserves audible unknown speech", async () => {
    const transcribe = vi.fn<Transcribe>().mockImplementation(speech);
    expect(
      await collect(transcribeMeeting(source(audio(2, 0, "others", 0.002)), { transcribe })),
    ).toEqual([]);
    expect(transcribe).not.toHaveBeenCalled();
    const lines = await collect(
      transcribeMeeting(source(audio(2, 0, "others", 0.005)), {
        transcribe,
        embed: async () => null,
      }),
    );
    expect(lines[0].speaker).toBe("unknown");
    expect(lines[0].text).toBe("Window 0");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(
      await collect(
        transcribeMeeting(source(audio(2, 0, "me", 0.1)), { transcribe, silenceRms: 0.2 }),
      ),
    ).toEqual([]);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(
      await collect(transcribeMeeting(source(audio(2, 0, "me", 0)), { transcribe, silenceRms: 0 })),
    ).toHaveLength(1);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it.each([-0.001, 1.001, NaN, Infinity])(
    "rejects an invalid silence threshold %s before calling ASR",
    async (silenceRms) => {
      const transcribe = vi.fn<Transcribe>();
      await expect(
        collect(transcribeMeeting(source(audio(2)), { transcribe, silenceRms })),
      ).rejects.toMatchObject({ code: "config" });
      expect(transcribe).not.toHaveBeenCalled();
    },
  );

  it("applies onWindow persistence backpressure before consuming another source chunk", async () => {
    let produced = 0,
      release!: () => void,
      enter!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    async function* frames() {
      produced++;
      yield audio(12);
      produced++;
      yield audio(2, 12 * SAMPLE_RATE);
    }
    const callback = vi.fn(async () => {
      if (callback.mock.calls.length === 1) {
        enter();
        await blocked;
      }
    });
    const consuming = collect(
      transcribeMeeting(frames(), { transcribe: speech, onWindow: callback }),
    );
    await entered;
    expect(produced).toBe(1);
    release();
    await consuming;
    expect(produced).toBe(2);
  });

  it("never invokes a replacement callback for a failed or aborted window", async () => {
    const onWindow = vi.fn();
    await expect(
      collect(
        transcribeMeeting(source(audio(2)), {
          transcribe: async () => {
            throw new Error("private");
          },
          onWindow,
        }),
      ),
    ).rejects.toMatchObject({ code: "provider" });
    expect(onWindow).not.toHaveBeenCalled();
    const controller = new AbortController();
    await expect(
      collect(
        transcribeMeeting(
          source(audio(2)),
          {
            transcribe: async () => {
              controller.abort();
              return [];
            },
            onWindow,
          },
          controller.signal,
        ),
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(onWindow).not.toHaveBeenCalled();
  });

  it("aborts promptly while the next source chunk is stalled and closes the iterator without later callbacks", async () => {
    let waiting!: () => void;
    const entered = new Promise<void>((resolve) => {
      waiting = resolve;
    });
    const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    let calls = 0;
    const frames: AsyncIterable<PcmFrame> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (calls++ === 0) return Promise.resolve({ done: false as const, value: audio(2) });
            waiting();
            return new Promise<IteratorResult<PcmFrame>>(() => {});
          },
          return: returned,
        };
      },
    };
    const onWindow = vi.fn(),
      transcribe = vi.fn<Transcribe>().mockImplementation(speech);
    const controller = new AbortController();
    const consuming = collect(
      transcribeMeeting(frames, { transcribe, onWindow }, controller.signal),
    );
    await entered;
    controller.abort();
    await expect(consuming).rejects.toMatchObject({ code: "aborted" });
    expect(returned).toHaveBeenCalledTimes(1);
    expect(onWindow).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });
});

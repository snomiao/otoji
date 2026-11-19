import { describe, expect, it, vi } from "vitest";
import { createDiarizer } from "../src/diarization";
import { SAMPLE_RATE, TranscriptError, type AudioWindow, type Embed } from "../src/types";

const signal = () => new AbortController().signal;
const audio = (seconds: number, level = 0.1, startSample = 0): AudioWindow => ({
  track: "others",
  startSample,
  samples: new Float32Array(seconds * SAMPLE_RATE).fill(level),
});
const vector = (a: number, b: number) => new Float32Array([a, b]);

describe("meeting-local advisory diarization", () => {
  it("uses bounded 2s windows with 1s hops, merges adjacent labels, and clears provider PCM", async () => {
    const windows: AudioWindow[] = [];
    const embed: Embed = async (window) => {
      windows.push(window);
      return vector(1, 0);
    };
    const original = audio(6, 0.1, SAMPLE_RATE * 4);
    const diarizer = createDiarizer(embed);
    expect(await diarizer.analyze(original, signal())).toEqual([
      { startSample: SAMPLE_RATE * 4, endSample: SAMPLE_RATE * 10, speaker: "A" },
    ]);
    expect(windows).toHaveLength(5);
    expect(windows.map((window) => window.startSample)).toEqual(
      [4, 5, 6, 7, 8].map((second) => second * SAMPLE_RATE),
    );
    expect(
      windows.every(
        (window) =>
          window.samples.length === 2 * SAMPLE_RATE &&
          window.samples.every((sample) => sample === 0),
      ),
    ).toBe(true);
    expect(original.samples[0]).toBeCloseTo(0.1);
  });

  it("keeps rapid changes distinct and marks ambiguous transition windows unknown", async () => {
    const embed: Embed = async (window) =>
      window.startSample === 0
        ? vector(1, 0)
        : window.startSample === 2 * SAMPLE_RATE
          ? vector(0, 1)
          : vector(0.79, Math.sqrt(1 - 0.79 ** 2));
    const turns = await createDiarizer(embed).analyze(audio(4), signal());
    expect(turns).toEqual([
      { startSample: 0, endSample: SAMPLE_RATE * 1.5, speaker: "A" },
      { startSample: SAMPLE_RATE * 1.5, endSample: SAMPLE_RATE * 2.5, speaker: "unknown" },
      { startSample: SAMPLE_RATE * 2.5, endSample: SAMPLE_RATE * 4, speaker: "B" },
    ]);
    expect(turns.some((turn) => turn.speaker === "mixed")).toBe(false);
  });

  it("treats competing close clusters as unknown rather than claiming simultaneous speakers", async () => {
    const embeddings = [
      vector(1, 0),
      vector(0.7, Math.sqrt(1 - 0.7 ** 2)),
      vector(Math.sqrt(0.85), Math.sqrt(0.15)),
    ];
    const embed = vi.fn<Embed>().mockImplementation(async () => embeddings.shift()!);
    const diarizer = createDiarizer(embed, { similarityThreshold: 0.8, ambiguityMargin: 0.08 });
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("A");
    expect((await diarizer.analyze(audio(2, 0.1, 2 * SAMPLE_RATE), signal()))[0].speaker).toBe("B");
    expect((await diarizer.analyze(audio(2, 0.1, 4 * SAMPLE_RATE), signal()))[0].speaker).toBe(
      "unknown",
    );
  });

  it("bounds clusters and never compares against another meeting", async () => {
    const embed = vi
      .fn<Embed>()
      .mockResolvedValueOnce(vector(1, 0))
      .mockResolvedValueOnce(vector(0, 1))
      .mockResolvedValueOnce(vector(0, 1));
    const first = createDiarizer(embed, { maxClusters: 1 });
    expect((await first.analyze(audio(2), signal()))[0].speaker).toBe("A");
    expect((await first.analyze(audio(2, 0.1, 2 * SAMPLE_RATE), signal()))[0].speaker).toBe(
      "unknown",
    );
    const second = createDiarizer(embed);
    expect((await second.analyze(audio(2), signal()))[0].speaker).toBe("A");
  });

  it("does not create a third person for an ambiguous midpoint between established speakers", async () => {
    const outputs = [vector(1, 0), vector(0, 1), vector(1, 1)];
    const diarizer = createDiarizer(async () => outputs.shift()!);
    const labels: string[] = [];
    for (let n = 0; n < 3; n++)
      labels.push((await diarizer.analyze(audio(2), signal()))[0].speaker);
    expect(labels).toEqual(["A", "B", "unknown"]);
  });

  it("avoids provider calls for silence, short snippets, and the me track", async () => {
    const embed = vi.fn<Embed>();
    const diarizer = createDiarizer(embed);
    expect(await diarizer.analyze(audio(4, 0), signal())).toEqual([
      { startSample: 0, endSample: 4 * SAMPLE_RATE, speaker: "unknown" },
    ]);
    expect((await diarizer.analyze(audio(1), signal()))[0].speaker).toBe("unknown");
    expect((await diarizer.analyze({ ...audio(2), track: "me" }, signal()))[0].speaker).toBe("me");
    expect(embed).not.toHaveBeenCalled();
  });

  it("uses unknown for zero, nonfinite, inconsistent, or missing embeddings without mutating provider vectors", async () => {
    const valid = vector(2, 0);
    const outputs = [valid, vector(0, 0), vector(NaN, 1), new Float32Array([1, 0, 0]), null];
    const embed: Embed = async () => outputs.shift()!;
    const status = vi.fn();
    const diarizer = createDiarizer(embed, { onStatus: status });
    const labels: string[] = [];
    for (let n = 0; n < 5; n++)
      labels.push(
        (await diarizer.analyze(audio(2, 0.1, n * 2 * SAMPLE_RATE), signal()))[0].speaker,
      );
    expect(labels).toEqual(["A", "unknown", "unknown", "unknown", "unknown"]);
    expect(Array.from(valid)).toEqual([2, 0]);
    expect(status).toHaveBeenCalledWith("embedding-invalid");
  });

  it("reports only a generic status for embedding failure and preserves later transcription eligibility", async () => {
    const status = vi.fn();
    const embed = vi
      .fn<Embed>()
      .mockRejectedValueOnce(new Error("private key and spoken text"))
      .mockRejectedValueOnce(new TranscriptError("aborted"))
      .mockResolvedValue(vector(1, 0));
    const diarizer = createDiarizer(embed, { onStatus: status });
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("unknown");
    expect(status.mock.calls).toEqual([["embedding-unavailable"]]);
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("unknown");
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("A");
    expect(embed).toHaveBeenCalledTimes(3);
  });

  it("aborts an ignored provider promptly and clears the owned pending embedding window", async () => {
    let pending!: AudioWindow;
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const embed: Embed = (window) => {
      pending = window;
      enter();
      return new Promise(() => {});
    };
    const original = audio(2);
    const controller = new AbortController();
    const analyzing = createDiarizer(embed).analyze(original, controller.signal);
    await entered;
    controller.abort();
    await expect(analyzing).rejects.toMatchObject({
      code: "aborted",
      message: "Meeting transcript aborted.",
    });
    expect(pending.samples.every((sample) => sample === 0)).toBe(true);
    expect(original.samples[0]).toBeCloseTo(0.1);
  });

  it("reset starts labels from A again and rejects unsafe window/cluster configuration", async () => {
    const outputs = [vector(1, 0), vector(0, 1)];
    const diarizer = createDiarizer(async () => outputs.shift()!);
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("A");
    diarizer.reset();
    expect((await diarizer.analyze(audio(2), signal()))[0].speaker).toBe("A");
    for (const options of [
      { windowMs: 1499 },
      { windowMs: 2501 },
      { hopMs: 0 },
      { maxClusters: 65 },
      { similarityThreshold: NaN },
    ])
      expect(() => createDiarizer(async () => null, options)).toThrow("Meeting transcript config.");
  });
});

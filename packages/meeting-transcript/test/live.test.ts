import { describe, expect, it, vi } from "vitest";
import { createLiveTranscriber } from "../src/live";
import { trimTranscriptOverlap } from "../src/overlap";
import type { MeetingLine, PcmFrame, Transcribe } from "../src/types";
const frame = (startSec: number, durationSec = 1, track: PcmFrame["track"] = "me"): PcmFrame => ({
  track,
  startSample: Math.round(startSec * 16000),
  samples: new Float32Array(Math.round(durationSec * 16000)).fill(0.1),
});
const completeWindow: Transcribe = async (w) => {
  const start = w.startSample / 16000,
    end = start + w.samples.length / 16000;
  return [
    {
      startMs: 0,
      endMs: w.samples.length / 16,
      text: Array.from(
        { length: Math.floor(end) - Math.ceil(start) },
        (_, i) => `word${Math.ceil(start) + i}`,
      ).join(" "),
      lang: "en",
    },
  ];
};
describe("continuous meeting captions", () => {
  it("preserves a timed first-word offset after leading silence", async () => {
    const lines: MeetingLine[] = [];
    const live = createLiveTranscriber({
      transcribe: async () => [{ startMs: 750, endMs: 1000, text: "speech" }],
      onDraft: () => {},
      onStable: (rows) => lines.push(...rows),
    });
    await live.push(frame(0, 2));
    await live.flush();
    expect(lines[0].startMs).toBe(750);
    expect(lines[0].id).toBe("me:750");
    live.close();
  });
  it("keeps 70 minutes continuous without a meeting-wide cutoff, bounded PCM and duplicate overlap", async () => {
    const lines: MeetingLine[] = [];
    let largest = 0,
      calls = 0;
    const live = createLiveTranscriber({
      transcribe: async (w, s) => {
        calls++;
        largest = Math.max(largest, w.samples.length);
        return completeWindow(w, s);
      },
      onDraft: () => {},
      onStable: (x) => lines.push(...x),
    });
    for (let sec = 0; sec < 4200; sec++) {
      await live.push(frame(sec));
      expect(live.bufferedSamples()).toBeLessThanOrEqual(192000);
    }
    await live.flush();
    expect(largest).toBeLessThanOrEqual(192000);
    expect(calls).toBeLessThan(2200);
    const words = lines.flatMap((l) => l.text.split(" "));
    expect(words).toEqual(Array.from({ length: 4200 }, (_, i) => `word${i}`));
    expect(lines[0].startMs).toBe(0);
    expect(lines.at(-1)?.endMs).toBe(4200000);
    expect(live.bufferedSamples()).toBe(0);
    for (let i = 1; i < lines.length; i++) expect(lines[i].startMs).toBe(lines[i - 1].endMs);
    live.close();
  }, 15000);
  it("preserves time-local legitimate repeats with timed ASR spans", async () => {
    const lines: MeetingLine[] = [];
    const live = createLiveTranscriber({
      windowMs: 4000,
      stepMs: 1000,
      overlapMs: 2000,
      transcribe: async (w) =>
        Array.from({ length: w.samples.length / 16000 }, (_, i) => ({
          startMs: i * 1000,
          endMs: (i + 1) * 1000,
          text: "yes yes",
        })),
      onDraft: () => {},
      onStable: (l) => lines.push(...l),
    });
    for (let sec = 0; sec < 8; sec++) await live.push(frame(sec));
    await live.flush();
    expect(lines.flatMap((l) => l.text.split(" "))).toHaveLength(16);
    live.close();
  });
  it("flushes before an explicit timeline gap and keeps track state separate", async () => {
    const lines: MeetingLine[] = [],
      gaps: unknown[] = [];
    const live = createLiveTranscriber({
      transcribe: completeWindow,
      onDraft: () => {},
      onStable: (l) => lines.push(...l),
      onGap: (g) => gaps.push(g),
    });
    await live.push(frame(0));
    await live.push(frame(5));
    await live.push(frame(1, 1, "others"));
    await live.flush();
    expect(gaps).toEqual([{ track: "me", startSample: 16000, endSample: 80000 }]);
    expect(lines.map((l) => [l.track, l.startMs, l.endMs, l.speaker])).toEqual([
      ["me", 0, 1000, "me"],
      ["me", 5000, 6000, "me"],
      ["others", 1000, 2000, "unknown"],
    ]);
    live.close();
  });
  it("rejects overlap, invalid samples and concurrent push without taking ownership of caller PCM", async () => {
    let resolve!: () => void;
    const waiting = new Promise<void>((r) => (resolve = r));
    const live = createLiveTranscriber({
      transcribe: async (w, s) => {
        await waiting;
        return completeWindow(w, s);
      },
      onDraft: () => {},
      onStable: () => {},
    });
    const input = frame(0, 2),
      saved = input.samples.slice(),
      pending = live.push(input);
    await expect(live.push(frame(2))).rejects.toMatchObject({ code: "busy" });
    resolve();
    await pending;
    await expect(live.push(frame(1))).rejects.toMatchObject({ code: "timeline" });
    await expect(
      live.push({ ...frame(2), samples: new Float32Array([NaN]) }),
    ).rejects.toMatchObject({ code: "audio" });
    expect(input.samples).toEqual(saved);
    live.close();
  });
  it("clears owned audio and suppresses late callbacks when closed during a decoder call", async () => {
    let resolve!: (v: any) => void;
    let owned: Float32Array | undefined;
    const pendingAsr = new Promise<any>((r) => (resolve = r)),
      draft = vi.fn(),
      stable = vi.fn();
    const live = createLiveTranscriber({
      transcribe: async (w) => {
        owned = w.samples;
        return pendingAsr;
      },
      onDraft: draft,
      onStable: stable,
    });
    const pending = live.push(frame(0, 2));
    await Promise.resolve();
    await Promise.resolve();
    live.close();
    resolve([{ startMs: 0, endMs: 2000, text: "late text" }]);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(draft).not.toHaveBeenCalled();
    expect(stable).not.toHaveBeenCalled();
    expect(owned?.every((n) => n === 0)).toBe(true);
    expect(live.bufferedSamples()).toBe(0);
  });
  it("does not decode silence or empty overlap left after a committed window", async () => {
    const transcribe = vi.fn(completeWindow),
      stable = vi.fn();
    const live = createLiveTranscriber({ transcribe, onDraft: () => {}, onStable: stable });
    await live.push({ ...frame(0, 12), samples: new Float32Array(192000) });
    await live.flush();
    expect(transcribe).not.toHaveBeenCalled();
    expect(stable).not.toHaveBeenCalled();
    live.close();
  });
  it("retains a substantially fuller draft instead of replacing it with a truncated decode", async () => {
    let calls = 0;
    const drafts: (MeetingLine | null)[] = [],
      status = vi.fn();
    const live = createLiveTranscriber({
      transcribe: async (w) => [
        {
          startMs: 0,
          endMs: w.samples.length / 16,
          text: ++calls === 1 ? "one two three four five six" : "one",
        },
      ],
      onDraft: (l) => drafts.push(l),
      onStable: () => {},
      onStatus: status,
    });
    await live.push(frame(0, 2));
    await live.push(frame(2, 2));
    expect(drafts.at(-1)?.text).toBe("one two three four five six");
    expect(status).toHaveBeenCalledWith({
      kind: "draft-regressed",
      track: "me",
      startMs: 0,
      endMs: 4000,
    });
    live.close();
  });
  it("validates decoder timings and sanitizes provider failures", async () => {
    const live = createLiveTranscriber({
      transcribe: async () => {
        throw new Error("credential and transcript");
      },
      onDraft: () => {},
      onStable: () => {},
    });
    await expect(live.push(frame(0, 2))).rejects.toThrow(/^Meeting transcript provider\.$/);
    live.close();
    const invalid = createLiveTranscriber({
      transcribe: async () => [{ startMs: 0, endMs: 999999, text: "bad" }],
      onDraft: () => {},
      onStable: () => {},
    });
    await expect(invalid.push(frame(0, 2))).rejects.toMatchObject({ code: "output" });
    invalid.close();
    expect(() =>
      createLiveTranscriber({
        windowMs: 13000,
        transcribe: completeWindow,
        onDraft: () => {},
        onStable: () => {},
      }),
    ).toThrow();
  });
  it("reserves both tracks before an asynchronous flush starts", async () => {
    let resolve!: (v: any) => void;
    const wait = new Promise<any>((r) => (resolve = r));
    const live = createLiveTranscriber({
      transcribe: async () => wait,
      onDraft: () => {},
      onStable: () => {},
    });
    await live.push(frame(0));
    await live.push(frame(0, 1, "others"));
    const flushing = live.flush();
    await expect(live.push(frame(1, 1, "others"))).rejects.toMatchObject({ code: "busy" });
    resolve([{ startMs: 0, endMs: 1000, text: "hello" }]);
    await flushing;
    live.close();
  });
  it("emits no callback after a stable subscriber closes the session", async () => {
    const draft = vi.fn();
    const live = createLiveTranscriber({
      transcribe: completeWindow,
      onDraft: draft,
      onStable: () => live.close(),
    });
    await live.push(frame(0));
    await expect(live.flush()).rejects.toMatchObject({ code: "closed" });
    expect(draft).toHaveBeenCalledTimes(1);
    expect(live.bufferedSamples()).toBe(0);
  });
});
describe("overlap text handling", () => {
  const line = (startMs: number, endMs: number, text: string): MeetingLine => ({
    id: `me:${startMs}`,
    track: "me",
    startMs,
    endMs,
    speaker: "me",
    text,
  });
  it("trims only matching units in temporally overlapping audio, including mixed CJK/Latin", () => {
    expect(
      trimTranscriptOverlap(
        line(0, 12000, "previous hello 你好"),
        line(10000, 22000, "hello你好 新しい words"),
      )?.text,
    ).toBe("新しい words");
    expect(trimTranscriptOverlap(line(0, 1000, "yes yes"), line(1000, 2000, "yes yes"))?.text).toBe(
      "yes yes",
    );
    expect(
      trimTranscriptOverlap(
        line(0, 12000, "previous sentence"),
        line(10000, 22000, "a different reading"),
      )?.text,
    ).toBe("a different reading");
    expect(trimTranscriptOverlap(line(0, 12000, "hello"), line(10000, 14000, "hello"))).toBeNull();
    expect(trimTranscriptOverlap(line(0, 12000, "hello"), line(12000, 14000, "hello"))?.text).toBe(
      "hello",
    );
    expect(
      trimTranscriptOverlap(line(0, 12000, "one two"), line(10000, 11000, "one two three")),
    ).toEqual(line(10000, 11000, "one two three"));
  });
});

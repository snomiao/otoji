import { describe, it, expect } from "vitest";
import { buildSrt } from "../lib/srt";
import { fileKindForMetadata, fileKindForName } from "../graph/file-store";
import { segmentSamples, MIC_VAD_SR } from "../lib/mic-vad";

describe("buildSrt", () => {
  it("numbers cues and renders sequential timestamps, skipping empties", () => {
    const srt = buildSrt([
      { text: "hello", durationMs: 1000 },
      { text: "  ", durationMs: 500 }, // skipped
      { text: "world", durationMs: 1000 },
    ]);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,000\nhello");
    // second cue's clock advances past the skipped one (1000+500)
    expect(srt).toContain("2\n00:00:01,500 --> 00:00:02,500\nworld");
  });

  it("uses absolute CTC start/end times when present (real timeline with gaps)", () => {
    const srt = buildSrt([
      { text: "hello", durationMs: 800, startMs: 1200, endMs: 2000 },
      { text: "world", durationMs: 900, startMs: 5000, endMs: 5900 },
    ]);
    expect(srt).toContain("1\n00:00:01,200 --> 00:00:02,000\nhello");
    expect(srt).toContain("2\n00:00:05,000 --> 00:00:05,900\nworld");
  });
});

describe("fileKindForName", () => {
  it("maps extensions to audio/text/null", () => {
    expect(fileKindForName("a.mp3")).toBe("audio");
    expect(fileKindForName("a.WAV")).toBe("audio");
    expect(fileKindForName("frame.png")).toBe("image");
    expect(fileKindForName("clip.mp4")).toBe("video");
    expect(fileKindForName("notes.md")).toBe("text");
    expect(fileKindForName("subs.srt")).toBe("text");
    expect(fileKindForName("archive.zip")).toBeNull();
  });
});

describe("fileKindForMetadata", () => {
  it("prefers MIME metadata and falls back to extension", () => {
    expect(fileKindForMetadata("clipboard", "image/png")).toBe("image");
    expect(fileKindForMetadata("recording", "audio/webm")).toBe("audio");
    expect(fileKindForMetadata("clip.bin", "video/mp4")).toBe("video");
    expect(fileKindForMetadata("payload", "application/json")).toBe("text");
    expect(fileKindForMetadata("notes.md", "")).toBe("text");
    expect(fileKindForMetadata("archive.zip", "application/zip")).toBeNull();
  });
});

describe("segmentSamples (offline VAD)", () => {
  it("emits a segment for a loud region and none for silence", () => {
    const sr = MIC_VAD_SR;
    const loud = new Float32Array(sr); // 1s tone
    for (let i = 0; i < loud.length; i++) loud[i] = Math.sin((2 * Math.PI * 300 * i) / sr) * 0.3;
    const silence = new Float32Array(sr); // 1s silence to close the utterance
    const buf = new Float32Array(loud.length + silence.length);
    buf.set(loud, 0);
    buf.set(silence, loud.length);

    const segs: number[] = [];
    segmentSamples(buf, (s) => segs.push(s.length));
    expect(segs.length).toBe(1);

    const quiet: number[] = [];
    segmentSamples(new Float32Array(sr), (s) => quiet.push(s.length));
    expect(quiet.length).toBe(0);
  });
});

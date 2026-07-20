import { describe, expect, it } from "vitest";
import { acceptsPartialInput } from "../graph/model";
import { buildSegmentFrame, buildTranscriptFrame, frameToMessage } from "../graph/frames";
import type { TranscriptMsg } from "../graph/runtime";

const audio = { samples: new Float32Array([0.1, -0.1]), sampleRate: 16000, durationMs: 0.125 };

describe("transcript revision protocol (M6.0)", () => {
  it("round-trips segmentId/revision/status/replacesRevision over the wire", () => {
    const tr: TranscriptMsg = {
      text: "hello wor",
      audio,
      segmentId: 3,
      revision: 7,
      status: "partial",
      replacesRevision: 6,
    };
    const back = frameToMessage(buildTranscriptFrame("node", "in", tr));
    expect(back.text).toBe("hello wor");
    expect(back.segmentId).toBe(3);
    expect(back.revision).toBe(7);
    expect(back.status).toBe("partial");
    expect(back.replacesRevision).toBe(6);
  });

  it("leaves the fields absent for plain finals (back-compat)", () => {
    const back = frameToMessage(buildTranscriptFrame("node", "in", { text: "done", audio }));
    expect(back.segmentId).toBeUndefined();
    expect(back.revision).toBeUndefined();
    expect(back.status).toBeUndefined();
    expect(back.replacesRevision).toBeUndefined();
  });

  it("segment frames carry two-pass identity over the wire", () => {
    const seg = { samples: new Float32Array([0.5]), sampleRate: 16000, durationMs: 0.0625, segmentId: 4, revision: 9 };
    const back = frameToMessage(buildSegmentFrame("node", "in", seg));
    expect(back.segmentId).toBe(4);
    expect(back.revision).toBe(9);
    const plain = frameToMessage(buildSegmentFrame("node", "in", { samples: new Float32Array(1), sampleRate: 16000, durationMs: 0.06 }));
    expect(plain.segmentId).toBeUndefined();
  });

  it("only opted-in ports accept partials", () => {
    expect(acceptsPartialInput("sink", "in")).toBe(true);
    // final-only consumers must never see partial revisions
    expect(acceptsPartialInput("text-diff", "in")).toBe(false);
    expect(acceptsPartialInput("llm-agent", "in")).toBe(false);
    expect(acceptsPartialInput("tts", "in")).toBe(false);
    expect(acceptsPartialInput("srt-out", "in")).toBe(false);
  });
});

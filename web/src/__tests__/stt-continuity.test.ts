import { describe, expect, it } from "vitest";
import { isContinuationSegment, type SegmentMsg } from "../graph/runtime";

function segment(durationMs: number, offsetMs?: number): SegmentMsg {
  return { samples: new Float32Array(1), sampleRate: 16_000, durationMs, offsetMs };
}

describe("isContinuationSegment", () => {
  it("accepts contiguous short frames within the timestamp tolerance", () => {
    expect(isContinuationSegment(segment(250, 1_000), segment(250, 1_250))).toBe(true);
    expect(isContinuationSegment(segment(200, 1_000), segment(200, 1_249))).toBe(true);
  });

  it("rejects VAD utterances, gaps, and missing offsets", () => {
    expect(isContinuationSegment(segment(800, 0), segment(200, 800))).toBe(false);
    expect(isContinuationSegment(segment(200, 0), segment(400, 200))).toBe(false);
    expect(isContinuationSegment(segment(200, 0), segment(200, 251))).toBe(false);
    expect(isContinuationSegment(segment(200), segment(200, 200))).toBe(false);
  });
});

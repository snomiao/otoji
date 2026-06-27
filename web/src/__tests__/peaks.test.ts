import { describe, it, expect } from "vitest";
import { computePeaks, samplesToWavBlob, packPeaks, unpackPeaks } from "../lib/peaks";

describe("computePeaks", () => {
  it("returns min/max per bucket", () => {
    const s = new Float32Array([0, 1, -1, 0.5, -0.5, 0]);
    const peaks = computePeaks(s, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toEqual({ min: -1, max: 1 }); // first 3 samples
    expect(peaks[1]).toEqual({ min: -0.5, max: 0.5 }); // last 3 samples
  });

  it("handles empty / zero buckets", () => {
    expect(computePeaks(new Float32Array(), 10)).toEqual([]);
    expect(computePeaks(new Float32Array([1, 2]), 0)).toEqual([]);
  });

  it("more buckets than samples yields zero-width buckets as 0", () => {
    const peaks = computePeaks(new Float32Array([0.5, -0.5]), 4);
    expect(peaks).toHaveLength(4);
    expect(peaks.every((p) => p.min <= p.max)).toBe(true);
  });
});

describe("pack/unpack peaks", () => {
  it("round-trips within int16 precision", () => {
    const peaks = computePeaks(new Float32Array([0, 1, -1, 0.5, -0.25, 0.1]), 3);
    const back = unpackPeaks(packPeaks(peaks));
    expect(back).toHaveLength(peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      expect(back[i].min).toBeCloseTo(peaks[i].min, 3);
      expect(back[i].max).toBeCloseTo(peaks[i].max, 3);
    }
  });
});

describe("samplesToWavBlob", () => {
  it("produces a 44-byte-header WAV of the right size", () => {
    const blob = samplesToWavBlob(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 4 * 2); // header + 4 int16 samples
  });
});

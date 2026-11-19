import { describe, expect, it } from "vitest";
import { speakerFeatures } from "../src/features";
import golden from "./fixtures/campp-synthetic.json";

describe("native speaker frontend parity", () => {
  it("matches native sherpa features on generated tones/noise, including reflected edges", () => {
    let seed = 123456;
    const pcm = Float32Array.from({ length: golden.samples }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (
        0.13 * Math.sin((i * 2 * Math.PI * 173) / 16000) +
        0.07 * Math.sin((i * 2 * Math.PI * 531) / 16000) +
        (seed / 4294967296 - 0.5) * 0.03
      );
    });
    const result = speakerFeatures(pcm);
    expect(result.frames).toBe(golden.frames);
    expect(result.data.length).toBe(golden.frames * 80);
    for (const [row, expected] of Object.entries(golden.rows)) {
      for (let bin = 0; bin < 80; bin++)
        expect(Math.abs(result.data[Number(row) * 80 + bin] - expected[bin])).toBeLessThan(0.0001);
    }
  });
  it("has zero per-bin mean and bounded silence output", () => {
    const result = speakerFeatures(new Float32Array(16000));
    expect(result.frames).toBe(100);
    expect(result.data.every((n) => n === 0)).toBe(true);
    expect(speakerFeatures(new Float32Array()).frames).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { appendMicFrames } from "../lib/mic-vad";

describe("appendMicFrames", () => {
  it("chunks random-sized pushes without losing samples", () => {
    const frameSize = 320;
    const input = Float32Array.from({ length: 10_123 }, (_, i) => i);
    const frames: Float32Array[] = [];
    const offsets: number[] = [];
    let carry: Float32Array = new Float32Array(0);
    let cursor = 0;
    let inputOffset = 0;
    let seed = 0x12345678;

    while (inputOffset < input.length) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const pushSize = Math.min(1 + (seed % 701), input.length - inputOffset);
      const result = appendMicFrames(carry, input.slice(inputOffset, inputOffset + pushSize), frameSize, cursor);
      frames.push(...result.frames.map((frame) => frame.samples));
      offsets.push(...result.frames.map((frame) => frame.offsetSamples));
      carry = result.carry;
      cursor = result.cursor;
      inputOffset += pushSize;
    }

    expect(frames.every((frame) => frame.length === frameSize)).toBe(true);
    expect(carry.length).toBeLessThan(frameSize);
    expect(offsets).toEqual(offsets.map((_, i) => i * frameSize));
    expect(offsets.every((offset, i) => i === 0 || offset > offsets[i - 1])).toBe(true);

    const reconstructed = Float32Array.from([...frames.flatMap((frame) => [...frame]), ...carry]);
    expect(reconstructed).toEqual(input);
  });
});

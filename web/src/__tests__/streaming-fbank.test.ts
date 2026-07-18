import { describe, expect, it } from "vitest";
import { computeFbank, createStreamingFbank, SENSEVOICE_FBANK } from "../lib/fbank";

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeSignal(length: number, seed: number): Float32Array {
  const random = randomSource(seed);
  return Float32Array.from({ length }, () => random() * 2 - 1);
}

function streamInRandomChunks(samples: Float32Array, seed: number): Float32Array {
  const random = randomSource(seed);
  const streaming = createStreamingFbank(SENSEVOICE_FBANK);
  const chunks: Float32Array[] = [];
  let totalLength = 0;
  let offset = 0;
  let chunkIndex = 0;

  while (offset < samples.length) {
    // Alternate tiny chunks with chunks that can be larger than one frame.
    const requested = chunkIndex % 3 === 0
      ? 1 + Math.floor(random() * 7)
      : 1 + Math.floor(random() * 1200);
    const end = Math.min(offset + requested, samples.length);
    const result = streaming.push(samples.subarray(offset, end));
    expect(result.feats.length).toBe(result.numFrames * result.numBins);
    chunks.push(result.feats);
    totalLength += result.feats.length;
    offset = end;
    chunkIndex++;
  }

  const combined = new Float32Array(totalLength);
  let outputOffset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }
  return combined;
}

describe("streaming fbank", () => {
  it.each([
    [16000, 1],
    [27391, 2],
    [48000, 3],
  ])("matches batch output exactly for %i samples", (length, seed) => {
    const samples = makeSignal(length, seed);
    const batch = computeFbank(samples, SENSEVOICE_FBANK);
    const streamed = streamInRandomChunks(samples, seed + 100);

    expect(streamed).toEqual(batch.feats);
  });

  it("discards buffered waveform on reset", () => {
    const samples = makeSignal(2000, 10);
    const streaming = createStreamingFbank(SENSEVOICE_FBANK);
    streaming.push(samples.subarray(0, 399));
    streaming.reset();

    const result = streaming.push(samples);
    expect(result.feats).toEqual(computeFbank(samples, SENSEVOICE_FBANK).feats);
  });
});

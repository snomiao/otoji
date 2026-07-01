import { describe, it, expect } from "vitest";
import { softClip, clusterSegments, mixCluster, type TimedSegment } from "../lib/audio-mix";

const SR = 16000;
const seg = (ts: number, durMs: number, fill = 0.5): TimedSegment => ({
  ts,
  sampleRate: SR,
  samples: new Float32Array(Math.round((durMs / 1000) * SR)).fill(fill),
});

describe("softClip", () => {
  it("passes values within the knee unchanged", () => {
    expect(softClip(0)).toBe(0);
    expect(softClip(0.5)).toBeCloseTo(0.5, 6);
    expect(softClip(-0.8)).toBeCloseTo(-0.8, 6);
  });
  it("compresses sums past the knee, never exceeding ±1", () => {
    expect(Math.abs(softClip(2))).toBeLessThanOrEqual(1);
    expect(Math.abs(softClip(10))).toBeLessThanOrEqual(1);
    expect(softClip(2)).toBeGreaterThan(0.9);
    expect(softClip(-2)).toBeLessThan(-0.9);
  });
});

describe("clusterSegments", () => {
  it("groups overlapping segments and separates disjoint ones", () => {
    const a = seg(1000, 500); // 1000–1500
    const b = seg(1200, 500); // 1200–1700 (overlaps a)
    const c = seg(3000, 500); // 3000–3500 (disjoint)
    const clusters = clusterSegments([c, a, b]); // order-independent
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBe(2); // a + b
    expect(clusters[1].length).toBe(1); // c
  });
  it("bridges near-adjacent segments within bridgeMs", () => {
    const a = seg(1000, 500); // ends 1500
    const b = seg(1600, 500); // starts 100ms after a ends
    expect(clusterSegments([a, b], 0).length).toBe(2);
    expect(clusterSegments([a, b], 200).length).toBe(1);
  });
});

describe("mixCluster", () => {
  it("returns a lone segment unchanged", () => {
    const a = seg(1000, 100, 0.3);
    const { samples, ts } = mixCluster([a]);
    expect(ts).toBe(1000);
    expect(samples).toBe(a.samples);
  });
  it("sums overlapping samples on a shared timeline", () => {
    // Two fully-overlapping 100ms tones at 0.3 → 0.6 in the overlap (< knee, no clip).
    const a = seg(1000, 100, 0.3);
    const b = seg(1000, 100, 0.3);
    const { samples, ts } = mixCluster([a, b]);
    expect(ts).toBe(1000);
    expect(samples.length).toBe(Math.round(0.1 * SR));
    expect(samples[0]).toBeCloseTo(0.6, 5);
  });
  it("aligns by ts: offset segment lands at the right sample", () => {
    const a = seg(1000, 100, 0.4); // 0–100ms
    const b = seg(1050, 100, 0.4); // 50–150ms → total span 150ms
    const { samples } = mixCluster([a, b]);
    expect(samples.length).toBe(Math.round(0.15 * SR));
    // first 50ms: only a (0.4); middle 50ms: a+b (0.8); last 50ms: only b (0.4)
    const q = Math.round(0.05 * SR);
    expect(samples[0]).toBeCloseTo(0.4, 5);
    expect(samples[q + 10]).toBeCloseTo(0.8, 5);
    expect(samples[2 * q + 10]).toBeCloseTo(0.4, 5);
  });
  it("soft-clips summed peaks above the knee", () => {
    const a = seg(1000, 50, 0.8);
    const b = seg(1000, 50, 0.8); // sum 1.6 → clipped below 1
    const { samples } = mixCluster([a, b]);
    expect(samples[0]).toBeGreaterThan(0.9);
    expect(samples[0]).toBeLessThan(1);
  });
});

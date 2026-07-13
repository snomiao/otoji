// matchGray operates on plain Float32Array luma grids, so the NCC core is
// testable without canvas/ImageBitmap (jsdom has neither).
import { describe, expect, it } from "vitest";
import { matchGray, formatMatchJson, formatMatchLabels, type Gray } from "../providers/vision/match";

function gray(w: number, h: number, fill = 0): Gray {
  return { data: new Float32Array(w * h).fill(fill), w, h };
}

/** Stamp `pat` into `dst` at (x, y). */
function stamp(dst: Gray, pat: Gray, x: number, y: number): void {
  for (let py = 0; py < pat.h; py++)
    for (let px = 0; px < pat.w; px++) dst.data[(y + py) * dst.w + (x + px)] = pat.data[py * pat.w + px];
}

/** A deterministic textured pattern (checker + gradient — non-uniform). */
function texture(w: number, h: number): Gray {
  const g = gray(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) g.data[y * w + x] = ((x + y) % 2) * 180 + x * 3 + y * 2;
  return g;
}

describe("matchGray", () => {
  it("finds every stamped occurrence at its exact position", () => {
    const pat = texture(8, 8);
    const hay = gray(64, 48, 30);
    stamp(hay, pat, 5, 7);
    stamp(hay, pat, 40, 30);
    stamp(hay, pat, 20, 12);
    const m = matchGray(hay, pat, { threshold: 0.9 });
    expect(m).toHaveLength(3);
    const at = m.map(({ x, y }) => `${x},${y}`).sort();
    expect(at).toEqual(["20,12", "40,30", "5,7"]);
    for (const { score, w, h } of m) {
      expect(score).toBeGreaterThan(0.99);
      expect(w).toBe(8);
      expect(h).toBe(8);
    }
  });

  it("returns nothing when the pattern is absent", () => {
    const hay = texture(64, 48);
    const pat = gray(8, 8);
    for (let i = 0; i < 64; i++) pat.data[i] = (i * 37) % 251; // unrelated noise
    expect(matchGray(hay, pat, { threshold: 0.85 })).toHaveLength(0);
  });

  it("refuses a uniform pattern (would match everything)", () => {
    const hay = texture(32, 32);
    expect(matchGray(hay, gray(6, 6, 128), { threshold: 0.5 })).toHaveLength(0);
  });

  it("caps results at maxMatches, best scores first", () => {
    const pat = texture(6, 6);
    const hay = gray(80, 20, 10);
    for (let i = 0; i < 6; i++) stamp(hay, pat, i * 12, 4);
    const m = matchGray(hay, pat, { threshold: 0.9, maxMatches: 4 });
    expect(m).toHaveLength(4);
  });

  it("suppresses near-duplicate peaks around one occurrence", () => {
    // LCG noise, not the periodic checker: off-position correlation stays low,
    // so surviving extra peaks could only come from NMS failing on neighbors.
    const pat = gray(10, 10);
    let seed = 42;
    for (let i = 0; i < 100; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      pat.data[i] = seed % 256;
    }
    const hay = gray(60, 40, 25);
    stamp(hay, pat, 24, 14);
    // slack threshold → offsets overlapping the stamp also score; NMS keeps one
    const m = matchGray(hay, pat, { threshold: 0.5 });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ x: 24, y: 14 });
  });

  it("handles a pattern larger than the haystack", () => {
    expect(matchGray(gray(8, 8), texture(16, 16))).toHaveLength(0);
  });
});

describe("format helpers", () => {
  it("formats labels and JSONL", () => {
    expect(formatMatchLabels([])).toBe("no match");
    const m = [{ x: 1, y: 2, w: 3, h: 4, score: 0.9876 }];
    expect(formatMatchLabels(m)).toBe("1 match");
    const lines = formatMatchJson(m).split("\n");
    expect(JSON.parse(lines[0])).toEqual({ count: 1 });
    expect(JSON.parse(lines[1])).toEqual({ i: 0, x: 1, y: 2, w: 3, h: 4, score: 0.988 });
  });
});

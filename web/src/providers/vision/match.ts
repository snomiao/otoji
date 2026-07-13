// Image (template) matching: find every occurrence of a small pattern image
// inside a larger frame, returning count + pixel positions. Pure canvas +
// TypedArray normalized cross-correlation (TM_CCOEFF_NORMED) — no model
// download, runs anywhere. Coarse-to-fine: candidates are found on a
// downscaled pyramid level, then each is re-scored at full resolution, so a
// 1080p frame stays interactive. Exact-scale matching (same-DPI screenshots);
// not rotation- or scale-invariant.

export interface Gray {
  data: Float32Array; // luma 0..255, row-major
  w: number;
  h: number;
}

export interface Match {
  x: number; // top-left, px in the searched image
  y: number;
  w: number;
  h: number;
  score: number; // NCC in [-1, 1]; 1 = pixel-perfect
}

export interface MatchOptions {
  threshold?: number; // min NCC score to accept (default 0.8)
  maxMatches?: number; // cap on returned matches (default 16)
}

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_MAX = 16;
const COARSE_PATTERN_PX = 24; // aim: pattern's short side ≈ this at coarse level
const COARSE_HAY_MAX = 800; // cap coarse search image's long side
const FULL_CAP = 2048; // cap "full-res" level (memory/refine cost bound)
const REFINE_SAMPLES = 4096; // strided sampling budget for full-res re-score

export function grayFromBitmap(src: ImageBitmap, scale = 1): Gray {
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("match: no 2d canvas context");
  ctx.drawImage(src, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { data: out, w, h };
}

/** Greedy non-max suppression: keep the best-scoring match, drop others whose
 *  center falls within half a pattern of an accepted one. */
function nms(cands: Match[], max: number): Match[] {
  cands.sort((a, b) => b.score - a.score);
  const kept: Match[] = [];
  for (const c of cands) {
    if (kept.length >= max) break;
    const hit = kept.some(
      (k) => Math.abs(k.x - c.x) < c.w * 0.5 && Math.abs(k.y - c.y) < c.h * 0.5,
    );
    if (!hit) kept.push(c);
  }
  return kept;
}

/** Zero-mean normalized template stats: template minus mean, plus its norm. */
function templateStats(pat: Gray): { tn: Float32Array; tnorm: number } | null {
  const N = pat.w * pat.h;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += pat.data[i];
  const mean = sum / N;
  const tn = new Float32Array(N);
  let varT = 0;
  for (let i = 0; i < N; i++) {
    const v = pat.data[i] - mean;
    tn[i] = v;
    varT += v * v;
  }
  if (varT < 1e-4) return null; // uniform pattern matches everything — refuse
  return { tn, tnorm: Math.sqrt(varT) };
}

/** Exhaustive NCC over every position (used at the coarse pyramid level, and
 *  directly when the images are already small). Exported for tests. */
export function matchGray(hay: Gray, pat: Gray, opts: MatchOptions = {}): Match[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const max = opts.maxMatches ?? DEFAULT_MAX;
  const { w: HW, h: HH } = hay;
  const { w: PW, h: PH } = pat;
  if (PW < 2 || PH < 2 || PW > HW || PH > HH) return [];
  const stats = templateStats(pat);
  if (!stats) return [];
  const { tn, tnorm } = stats;
  const N = PW * PH;

  // Integral images give each window's sum / sum-of-squares in O(1).
  const iw = HW + 1;
  const S = new Float64Array(iw * (HH + 1));
  const S2 = new Float64Array(iw * (HH + 1));
  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      const v = hay.data[y * HW + x];
      const i = (y + 1) * iw + (x + 1);
      S[i] = v + S[i - 1] + S[i - iw] - S[i - iw - 1];
      S2[i] = v * v + S2[i - 1] + S2[i - iw] - S2[i - iw - 1];
    }
  }

  const cands: Match[] = [];
  for (let y = 0; y <= HH - PH; y++) {
    for (let x = 0; x <= HW - PW; x++) {
      const a = y * iw + x;
      const b = y * iw + (x + PW);
      const c = (y + PH) * iw + x;
      const d = (y + PH) * iw + (x + PW);
      const sumI = S[d] - S[b] - S[c] + S[a];
      const sumI2 = S2[d] - S2[b] - S2[c] + S2[a];
      const varI = sumI2 - (sumI * sumI) / N;
      if (varI < 1e-4) continue; // flat window can't correlate
      let numer = 0; // Σ I·tn (tn is zero-mean, so I's mean cancels)
      for (let py = 0; py < PH; py++) {
        let hi = (y + py) * HW + x;
        let ti = py * PW;
        for (let px = 0; px < PW; px++) numer += hay.data[hi++] * tn[ti++];
      }
      const score = numer / (Math.sqrt(varI) * tnorm);
      if (score >= threshold) cands.push({ x, y, w: PW, h: PH, score });
    }
  }
  return nms(cands, max);
}

/** NCC score of the pattern placed at (x, y), sampled on a stride-s grid —
 *  bounds the cost of full-res re-scoring for large patterns. */
function nccAt(hay: Gray, pat: Gray, tn: Float32Array, x: number, y: number, s: number): number {
  const { w: HW } = hay;
  const { w: PW, h: PH } = pat;
  let n = 0;
  let sumI = 0;
  let sumI2 = 0;
  let sumIT = 0;
  let sumT = 0;
  let sumT2 = 0;
  for (let py = 0; py < PH; py += s) {
    for (let px = 0; px < PW; px += s) {
      const I = hay.data[(y + py) * HW + (x + px)];
      const T = tn[py * PW + px]; // zero-mean over the FULL grid, not this one
      n++;
      sumI += I;
      sumI2 += I * I;
      sumIT += I * T;
      sumT += T;
      sumT2 += T * T;
    }
  }
  const varI = sumI2 - (sumI * sumI) / n;
  const varT = sumT2 - (sumT * sumT) / n;
  if (varI < 1e-4 || varT < 1e-4) return 0;
  const cov = sumIT - (sumI * sumT) / n;
  return cov / Math.sqrt(varI * varT);
}

/** Find every occurrence of `pattern` inside `frame`. Coordinates are in
 *  `frame`'s own pixel space. */
export function matchTemplate(frame: ImageBitmap, pattern: ImageBitmap, opts: MatchOptions = {}): Match[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const max = opts.maxMatches ?? DEFAULT_MAX;
  if (pattern.width > frame.width || pattern.height > frame.height) return [];

  // "Full" level: original size, capped so refine cost/memory stays bounded.
  const fullScale = Math.min(1, FULL_CAP / Math.max(frame.width, frame.height));
  const hay = grayFromBitmap(frame, fullScale);
  const pat = grayFromBitmap(pattern, fullScale);
  if (pat.w < 2 || pat.h < 2) return [];
  const stats = templateStats(pat);
  if (!stats) return [];

  // Coarse level: shrink until the pattern's short side ≈ COARSE_PATTERN_PX and
  // the frame's long side ≤ COARSE_HAY_MAX (but never below a 5px pattern).
  let f = Math.min(
    1,
    COARSE_PATTERN_PX / Math.min(pat.w, pat.h),
    COARSE_HAY_MAX / Math.max(hay.w, hay.h),
  );
  f = Math.max(f, 5 / Math.min(pat.w, pat.h));

  let matches: Match[];
  if (f >= 1) {
    matches = matchGray(hay, pat, { threshold, maxMatches: max });
  } else {
    const cHay = grayFromBitmap(frame, fullScale * f);
    const cPat = grayFromBitmap(pattern, fullScale * f);
    // Downscale blur softens peaks — search with a slacker threshold, then let
    // the full-res re-score enforce the real one.
    const coarse = matchGray(cHay, cPat, {
      threshold: Math.max(0.35, threshold - 0.15),
      maxMatches: max * 2,
    });
    const r = Math.ceil(1 / f) + 2; // one coarse pixel of slack, either side
    const stride = Math.max(1, Math.round(Math.sqrt((pat.w * pat.h) / REFINE_SAMPLES)));
    const refined: Match[] = [];
    for (const m of coarse) {
      const cx = Math.round(m.x / f);
      const cy = Math.round(m.y / f);
      let best = -2;
      let bx = cx;
      let by = cy;
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy;
        if (y < 0 || y > hay.h - pat.h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          if (x < 0 || x > hay.w - pat.w) continue;
          const s = nccAt(hay, pat, stats.tn, x, y, stride);
          if (s > best) {
            best = s;
            bx = x;
            by = y;
          }
        }
      }
      if (best >= threshold) refined.push({ x: bx, y: by, w: pat.w, h: pat.h, score: best });
    }
    matches = nms(refined, max);
  }

  // Map back to the frame's original pixel space.
  const inv = 1 / fullScale;
  return matches.map((m) => ({
    x: Math.round(m.x * inv),
    y: Math.round(m.y * inv),
    w: Math.round(pattern.width),
    h: Math.round(pattern.height),
    score: m.score,
  }));
}

/** Draw match boxes + scores over the frame; returns a new ImageBitmap. */
export async function drawMatches(frame: ImageBitmap, matches: Match[]): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(frame, 0, 0);
  ctx.lineWidth = Math.max(2, Math.round(canvas.width / 480));
  ctx.font = `${Math.max(12, Math.round(canvas.width / 48))}px sans-serif`;
  ctx.textBaseline = "top";
  matches.forEach((m, i) => {
    ctx.strokeStyle = "#38a169";
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    const tag = `#${i + 1} ${Math.round(m.score * 100)}%`;
    const tw = ctx.measureText(tag).width + 6;
    const th = parseInt(ctx.font) + 4;
    ctx.fillStyle = "#38a169";
    ctx.fillRect(m.x, Math.max(0, m.y - th), tw, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(tag, m.x + 3, Math.max(0, m.y - th) + 2);
  });
  return createImageBitmap(canvas);
}

export function formatMatchLabels(matches: Match[]): string {
  return matches.length ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "no match";
}

/** One JSON line per match (positions in frame pixels), count first. */
export function formatMatchJson(matches: Match[]): string {
  const lines = matches.map((m, i) =>
    JSON.stringify({ i, x: m.x, y: m.y, w: m.w, h: m.h, score: Math.round(m.score * 1000) / 1000 }),
  );
  return [JSON.stringify({ count: matches.length }), ...lines].join("\n");
}

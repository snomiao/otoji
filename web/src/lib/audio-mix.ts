// Time-aligned additive audio mixing for the Mix node. Inputs are VAD segments
// from one or more sources (multiple mics, possibly across devices), each tagged
// with a wall-clock start `ts`. We group segments whose spans overlap on the
// shared timeline into a cluster, sum the overlapping samples sample-accurately,
// and soft-clip the result so summed peaks don't distort.
//
// Pure + deterministic so the mixing math is unit-tested directly; the streaming
// jitter buffer that decides *when* a cluster is settled lives in the runtime.

export interface TimedSegment {
  samples: Float32Array;
  ts: number; // wall-clock epoch (ms) of the first sample
  sampleRate: number; // expected 16 kHz across otoji
}

/**
 * Soft limiter: linear within ±knee, then a smooth tanh saturation toward ±1.
 * A single source (peaks below the knee) passes through untouched; only summed
 * overlaps that exceed the knee get compressed — "additive with clip prevention".
 */
export function softClip(x: number, knee = 0.9): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  return Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
}

/** End of a segment on the shared timeline, in epoch ms. */
function endTs(s: TimedSegment): number {
  return s.ts + (s.samples.length / s.sampleRate) * 1000;
}

/**
 * Group segments into clusters by overlap on the wall-clock timeline. Segments
 * within `bridgeMs` of the running cluster end join it (a small bridge merges
 * near-adjacent utterances into one output segment). Input order independent.
 */
export function clusterSegments(segs: TimedSegment[], bridgeMs = 0): TimedSegment[][] {
  const sorted = [...segs].sort((a, b) => a.ts - b.ts);
  const clusters: TimedSegment[][] = [];
  let cur: TimedSegment[] = [];
  let curEnd = -Infinity;
  for (const s of sorted) {
    if (cur.length && s.ts <= curEnd + bridgeMs) {
      cur.push(s);
      curEnd = Math.max(curEnd, endTs(s));
    } else {
      if (cur.length) clusters.push(cur);
      cur = [s];
      curEnd = endTs(s);
    }
  }
  if (cur.length) clusters.push(cur);
  return clusters;
}

/**
 * Mix a cluster of time-aligned segments into one buffer. Samples are placed at
 * their wall-clock offset from the cluster start and summed, then soft-clipped.
 * Returns the mixed samples and the cluster's start `ts`.
 */
export function mixCluster(segs: TimedSegment[], sampleRate = 16000): { samples: Float32Array; ts: number } {
  if (segs.length === 1) return { samples: segs[0].samples, ts: segs[0].ts };
  const start = Math.min(...segs.map((s) => s.ts));
  const end = Math.max(...segs.map(endTs));
  const len = Math.max(0, Math.round(((end - start) / 1000) * sampleRate));
  const buf = new Float32Array(len);
  for (const s of segs) {
    const off = Math.round(((s.ts - start) / 1000) * sampleRate);
    const n = s.samples.length;
    for (let i = 0; i < n; i++) {
      const j = off + i;
      if (j >= 0 && j < len) buf[j] += s.samples[i];
    }
  }
  for (let i = 0; i < len; i++) buf[i] = softClip(buf[i]);
  return { samples: buf, ts: start };
}

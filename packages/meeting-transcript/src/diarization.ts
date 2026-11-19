import {
  SAMPLE_RATE,
  TranscriptError,
  abortable,
  checkAbort,
  validateFrame,
  type AudioWindow,
  type Embed,
} from "./types";

export interface SpeakerTurn {
  startSample: number;
  endSample: number;
  speaker: string;
}
export interface DiarizerOptions {
  windowMs?: number;
  hopMs?: number;
  similarityThreshold?: number;
  ambiguityMargin?: number;
  maxClusters?: number;
  silenceRms?: number;
  onStatus?: (status: "embedding-unavailable" | "embedding-invalid") => void;
}
export interface MeetingDiarizer {
  analyze(window: AudioWindow, signal: AbortSignal): Promise<SpeakerTurn[]>;
  reset(): void;
}

function normalized(vector: Float32Array | null): Float32Array | null {
  if (!(vector instanceof Float32Array) || !vector.length || vector.length > 4096) return null;
  let norm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return null;
    norm += value * value;
  }
  if (!Number.isFinite(norm) || norm < 1e-12) return null;
  const result = new Float32Array(vector.length);
  const scale = Math.sqrt(norm);
  for (let n = 0; n < vector.length; n++) result[n] = vector[n] / scale;
  return result;
}
function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -2;
  let result = 0;
  for (let n = 0; n < a.length; n++) result += a[n] * b[n];
  return Math.max(-1, Math.min(1, result));
}
function speakerName(index: number): string {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

/** Advisory labels are local to this instance/meeting. No account or identity matching. */
export function createDiarizer(embed: Embed, options: DiarizerOptions = {}): MeetingDiarizer {
  const windowMs = options.windowMs ?? 2000,
    hopMs = options.hopMs ?? 1000;
  const threshold = options.similarityThreshold ?? 0.82,
    margin = options.ambiguityMargin ?? 0.08;
  const maximum = options.maxClusters ?? 16,
    silence = options.silenceRms ?? 0.01;
  if (
    !Number.isFinite(windowMs) ||
    windowMs < 1500 ||
    windowMs > 2500 ||
    !Number.isFinite(hopMs) ||
    hopMs < 250 ||
    hopMs > windowMs ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 1 ||
    !Number.isFinite(margin) ||
    margin < 0 ||
    margin >= threshold ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 64 ||
    !Number.isFinite(silence) ||
    silence < 0 ||
    silence > 1
  )
    throw new TranscriptError("config");
  const windowSamples = Math.round((windowMs * SAMPLE_RATE) / 1000),
    hopSamples = Math.round((hopMs * SAMPLE_RATE) / 1000);
  const clusters: { vector: Float32Array; count: number }[] = [];
  let busy = false;

  function identify(vector: Float32Array): string {
    if (clusters.length && clusters[0].vector.length !== vector.length) return "unknown";
    const scores = clusters
      .map((cluster, index) => ({ index, score: similarity(cluster.vector, vector) }))
      .sort((a, b) => b.score - a.score);
    const best = scores[0];
    // A vector between established speakers is uncertain even below the match threshold.
    if (
      best &&
      scores[1] &&
      best.score > 0.5 &&
      scores[1].score > 0.5 &&
      best.score - scores[1].score <= margin
    )
      return "unknown";
    if (best && best.score >= threshold) {
      if (scores[1] && best.score - scores[1].score <= margin) return "unknown";
      const cluster = clusters[best.index];
      const weight = Math.min(cluster.count, 32);
      const averaged = new Float32Array(vector.length);
      for (let n = 0; n < vector.length; n++)
        averaged[n] = (cluster.vector[n] * weight + vector[n]) / (weight + 1);
      const next = normalized(averaged)!;
      averaged.fill(0);
      cluster.vector.fill(0);
      cluster.vector = next;
      cluster.count = Math.min(32, cluster.count + 1);
      return speakerName(best.index);
    }
    // Near matches and an exhausted cluster budget are uncertainty, not new people.
    if ((best && best.score > threshold - margin) || clusters.length >= maximum) return "unknown";
    clusters.push({ vector: vector.slice(), count: 1 });
    return speakerName(clusters.length - 1);
  }

  return {
    async analyze(window, signal) {
      checkAbort(signal);
      validateFrame(window, 12000);
      if (busy) throw new TranscriptError("busy");
      if (window.track === "me")
        return [
          {
            startSample: window.startSample,
            endSample: window.startSample + window.samples.length,
            speaker: "me",
          },
        ];
      if (window.samples.length < windowSamples)
        return [
          {
            startSample: window.startSample,
            endSample: window.startSample + window.samples.length,
            speaker: "unknown",
          },
        ];
      busy = true;
      try {
        const starts: number[] = [];
        for (let n = 0; n + windowSamples <= window.samples.length; n += hopSamples) starts.push(n);
        const last = window.samples.length - windowSamples;
        if (starts.at(-1) !== last) starts.push(last);
        const classified: { center: number; speaker: string }[] = [];
        for (const start of starts) {
          checkAbort(signal);
          const samples = window.samples.slice(start, start + windowSamples);
          let energy = 0;
          for (const value of samples) energy += value * value;
          let speaker = "unknown";
          try {
            if (Math.sqrt(energy / samples.length) > silence) {
              let embedding: Float32Array | null;
              try {
                embedding = await abortable(
                  () =>
                    embed(
                      { track: "others", startSample: window.startSample + start, samples },
                      signal,
                    ),
                  signal,
                );
              } catch {
                checkAbort(signal);
                options.onStatus?.("embedding-unavailable");
                embedding = null;
              }
              checkAbort(signal);
              const vector = normalized(embedding);
              if (vector) {
                try {
                  speaker = identify(vector);
                } finally {
                  vector.fill(0);
                }
              } else if (embedding !== null) options.onStatus?.("embedding-invalid");
            }
          } finally {
            samples.fill(0);
          }
          classified.push({ center: start + windowSamples / 2, speaker });
        }
        const turns: SpeakerTurn[] = [];
        for (let n = 0; n < classified.length; n++) {
          const start =
            n === 0 ? 0 : Math.round((classified[n - 1].center + classified[n].center) / 2);
          const end =
            n === classified.length - 1
              ? window.samples.length
              : Math.round((classified[n].center + classified[n + 1].center) / 2);
          const turn = {
            startSample: window.startSample + start,
            endSample: window.startSample + end,
            speaker: classified[n].speaker,
          };
          const previous = turns.at(-1);
          if (previous?.speaker === turn.speaker && previous.endSample === turn.startSample)
            previous.endSample = turn.endSample;
          else turns.push(turn);
        }
        return turns;
      } finally {
        busy = false;
      }
    },
    reset() {
      for (const cluster of clusters) cluster.vector.fill(0);
      clusters.length = 0;
    },
  };
}

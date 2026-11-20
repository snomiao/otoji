/** Framework-independent microphone primitives adapted from Lianki's MIT mic core.
 * Source: https://github.com/snolab/lianki/tree/main/packages/debug-chat/src
 * Audio lives in bounded memory only; no recorder, persistence or playback.
 */
export const SAMPLE_RATE = 16_000;
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (const value of frame) sum += value * value;
  return Math.sqrt(sum / (frame.length || 1));
}

export function createSpeechGate(
  options: { on?: number; off?: number; silenceMs?: number; maxMs?: number } = {},
) {
  const high = options.on ?? 0.02;
  const low = options.off ?? 0.01;
  const silence = ((options.silenceMs ?? 700) * SAMPLE_RATE) / 1000;
  const max = ((options.maxMs ?? 12_000) * SAMPLE_RATE) / 1000;
  let loud = 0,
    quiet = 0,
    length = 0;
  let speaking = false;
  let pre: Float32Array[] = [],
    frames: Float32Array[] = [];
  function cut(): Float32Array | null {
    const result = new Float32Array(length);
    let at = 0;
    for (const frame of frames) {
      result.set(frame, at);
      at += frame.length;
    }
    loud = quiet = length = 0;
    frames = [];
    speaking = false;
    return result.length >= SAMPLE_RATE * 0.16 ? result : null;
  }
  return {
    /** A bounded copy for local incremental decoding; never retained after its request. */
    snapshot(): Float32Array | null {
      if (!speaking || !length) return null;
      const result = new Float32Array(length);
      let at = 0;
      for (const frame of frames) {
        result.set(frame, at);
        at += frame.length;
      }
      return result;
    },
    push(frame: Float32Array): { start?: true; segment?: Float32Array } {
      const level = rms(frame);
      if (!speaking) {
        pre = [...pre.slice(-3), frame];
        loud = level > high ? loud + 1 : 0;
        if (loud < 2) return {};
        speaking = true;
        frames = pre;
        pre = [];
        length = frames.reduce((n, f) => n + f.length, 0);
        return { start: true };
      }
      const remaining = frame.subarray(0, Math.max(0, max - length));
      frames.push(remaining);
      length += remaining.length;
      quiet = level < low ? quiet + frame.length : 0;
      if (quiet >= silence || length >= max) return { segment: cut() ?? undefined };
      return {};
    },
    discard() {
      loud = quiet = length = 0;
      speaking = false;
      frames = [];
      pre = [];
    },
  };
}

/** Serial, bounded recognition avoids out-of-order writes and unbounded audio retention. */
export function createRecognitionQueue(limit = 2) {
  let queued = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (queued >= limit)
        return Promise.reject(new Error("Recognition is busy. Pause before the next sentence."));
      queued++;
      const result = tail.then(operation).finally(() => {
        queued--;
      });
      tail = result.catch(() => {});
      return result;
    },
  };
}

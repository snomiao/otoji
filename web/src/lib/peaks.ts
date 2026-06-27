// Downsample a waveform to per-bucket [min, max] peaks for rendering. Drawing
// every sample is wasteful and aliased; peaks give an accurate envelope at any
// target width.

export interface Peak {
  min: number;
  max: number;
}

/** Compute `buckets` min/max peaks across `samples`. */
export function computePeaks(samples: Float32Array, buckets: number): Peak[] {
  const out: Peak[] = [];
  if (buckets <= 0 || samples.length === 0) return out;
  const step = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(samples.length, Math.floor((b + 1) * step));
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (end <= start) {
      min = 0;
      max = 0;
    }
    out.push({ min, max });
  }
  return out;
}

/** Encode mono float samples in [-1,1] to a 16-bit PCM WAV Blob (for download). */
export function samplesToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i];
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    view.setInt16(off, s * 32767, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

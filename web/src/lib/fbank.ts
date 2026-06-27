// Kaldi-compatible log-mel filterbank, tuned to match sherpa-onnx's SenseVoice
// feature config exactly:
//   window_type = "hamming", high_freq = 0 (-> Nyquist), low_freq = 20,
//   snip_edges = true, dither = 0, remove_dc_offset = true, preemph = 0.97,
//   frame_length = 25ms, frame_shift = 10ms, num_mel_bins = 80, use_power = true.
// (see sherpa-onnx/csrc/offline-recognizer-sense-voice-impl.h)

export interface FbankOptions {
  sampleRate: number;
  frameLengthMs: number;
  frameShiftMs: number;
  numBins: number;
  lowFreq: number;
  highFreq: number; // <= 0 means Nyquist + highFreq
  preemph: number;
  removeDcOffset: boolean;
}

export const SENSEVOICE_FBANK: FbankOptions = {
  sampleRate: 16000,
  frameLengthMs: 25,
  frameShiftMs: 10,
  numBins: 80,
  lowFreq: 20,
  highFreq: 0,
  preemph: 0.97,
  removeDcOffset: true,
};

const melScale = (freqHz: number) => 1127.0 * Math.log(1.0 + freqHz / 700.0);

/** Next power of two >= n (kaldi pads the analysis frame to a power of 2). */
function roundUpToPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Hamming window of length n (kaldi: 0.54 - 0.46 cos(2πi/(n-1))). */
function hammingWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  const a = (2 * Math.PI) / (n - 1);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos(a * i);
  return w;
}

/** Precomputed triangular mel filterbank over the rfft bins. */
interface MelBank {
  // For each mel bin: start fft-bin index and the per-bin weights.
  starts: Int32Array;
  weights: Float32Array[];
}

function buildMelBank(opts: FbankOptions, fftSize: number): MelBank {
  const nyquist = opts.sampleRate / 2;
  const highFreq = opts.highFreq <= 0 ? nyquist + opts.highFreq : opts.highFreq;
  const numFftBins = fftSize / 2; // kaldi uses fftSize/2 usable bins
  const fftBinWidth = opts.sampleRate / fftSize;

  const melLow = melScale(opts.lowFreq);
  const melHigh = melScale(highFreq);
  const melDelta = (melHigh - melLow) / (opts.numBins + 1);

  const starts = new Int32Array(opts.numBins);
  const weights: Float32Array[] = [];

  for (let m = 0; m < opts.numBins; m++) {
    const leftMel = melLow + m * melDelta;
    const centerMel = melLow + (m + 1) * melDelta;
    const rightMel = melLow + (m + 2) * melDelta;

    let start = -1;
    const w: number[] = [];
    for (let k = 0; k < numFftBins; k++) {
      const mel = melScale(k * fftBinWidth);
      if (mel <= leftMel || mel >= rightMel) continue;
      let weight: number;
      if (mel <= centerMel) weight = (mel - leftMel) / (centerMel - leftMel);
      else weight = (rightMel - mel) / (rightMel - centerMel);
      if (start < 0) start = k;
      w[k - start] = weight;
    }
    starts[m] = start < 0 ? 0 : start;
    weights.push(new Float32Array(w.map((x) => x || 0)));
  }
  return { starts, weights };
}

/** In-place iterative radix-2 Cooley-Tukey FFT (re/im arrays, length = pow2). */
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

const LOG_FLOOR = Math.log(1.1920928955078125e-7); // log(FLT_EPSILON), kaldi floor

/**
 * Compute a [numFrames, numBins] log-mel fbank from 16k mono float samples
 * in [-1, 1]. Returns a flat Float32Array (row-major).
 */
export function computeFbank(
  samples: Float32Array,
  opts: FbankOptions = SENSEVOICE_FBANK,
): { feats: Float32Array; numFrames: number; numBins: number } {
  const frameLength = Math.round((opts.frameLengthMs * opts.sampleRate) / 1000); // 400
  const frameShift = Math.round((opts.frameShiftMs * opts.sampleRate) / 1000); // 160
  const fftSize = roundUpToPow2(frameLength); // 512
  const window = hammingWindow(frameLength);
  const melBank = buildMelBank(opts, fftSize);

  // snip_edges = true: only full frames.
  const numFrames =
    samples.length < frameLength ? 0 : 1 + Math.floor((samples.length - frameLength) / frameShift);
  const feats = new Float32Array(numFrames * opts.numBins);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const frame = new Float32Array(frameLength);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * frameShift;
    for (let i = 0; i < frameLength; i++) frame[i] = samples[offset + i];

    if (opts.removeDcOffset) {
      let mean = 0;
      for (let i = 0; i < frameLength; i++) mean += frame[i];
      mean /= frameLength;
      for (let i = 0; i < frameLength; i++) frame[i] -= mean;
    }

    if (opts.preemph > 0) {
      for (let i = frameLength - 1; i > 0; i--) frame[i] -= opts.preemph * frame[i - 1];
      frame[0] -= opts.preemph * frame[0];
    }

    for (let i = 0; i < frameLength; i++) re[i] = frame[i] * window[i];
    for (let i = frameLength; i < fftSize; i++) re[i] = 0;
    im.fill(0);

    fftInPlace(re, im);

    const base = f * opts.numBins;
    for (let m = 0; m < opts.numBins; m++) {
      const start = melBank.starts[m];
      const w = melBank.weights[m];
      let energy = 0;
      for (let k = 0; k < w.length; k++) {
        const bin = start + k;
        const power = re[bin] * re[bin] + im[bin] * im[bin];
        energy += power * w[k];
      }
      feats[base + m] = energy > 0 ? Math.log(energy) : LOG_FLOOR;
    }
  }

  return { feats, numFrames, numBins: opts.numBins };
}

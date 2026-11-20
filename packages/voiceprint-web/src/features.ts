import { computeFbank, type FbankOptions } from "./fbank";

const OPTIONS: FbankOptions = {
  sampleRate: 16000,
  frameLengthMs: 25,
  frameShiftMs: 10,
  numBins: 80,
  lowFreq: 20,
  highFreq: -400,
  preemph: 0.97,
  removeDcOffset: true,
  window: "povey",
};

/** CAM++ uses reflected edges and per-bin utterance mean subtraction.
 * This deliberately differs from SenseVoice's hamming/snip-edges frontend. */
export function speakerFeatures(samples: Float32Array): { data: Float32Array; frames: number } {
  const frames = Math.floor((samples.length + 80) / 160);
  if (!frames || !samples.length) return { data: new Float32Array(), frames: 0 };
  const padded = new Float32Array((frames - 1) * 160 + 400);
  for (let i = 0; i < padded.length; i++) {
    let at = i - 120;
    while (at < 0 || at >= samples.length) {
      at = at < 0 ? -at - 1 : 2 * samples.length - 1 - at;
    }
    padded[i] = samples[at];
  }
  const { feats } = computeFbank(padded, OPTIONS);
  padded.fill(0);
  const floor = Math.log(1.1920928955078125e-7);
  for (let i = 0; i < feats.length; i++) feats[i] = Math.max(feats[i], floor);
  for (let bin = 0; bin < 80; bin++) {
    let sum = 0;
    for (let frame = 0; frame < frames; frame++) sum += feats[frame * 80 + bin];
    const mean = sum / frames;
    for (let frame = 0; frame < frames; frame++) feats[frame * 80 + bin] -= mean;
  }
  return { data: feats, frames };
}

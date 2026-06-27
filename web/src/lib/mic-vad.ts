// Reusable mic capture + energy VAD. Emits 16 kHz mono float segments on each
// detected utterance. Shared by the SenseVoice STT provider and the graph
// runtime's Mic+VAD node.

import type { SttLevel } from "../providers/types";

export const MIC_VAD_SR = 16000;

const VAD_WIN = 480; // 30 ms @ 16k
const SILENCE_WINS = 20; // ~600 ms trailing silence closes an utterance
const PREROLL = MIC_VAD_SR * 0.3; // keep 300 ms before speech onset
const MAX_UTTER = MIC_VAD_SR * 20; // 20 s hard cap
const RMS_THRESHOLD = 0.012;

export interface MicVadOptions {
  onSegment: (samples: Float32Array, durationMs: number) => void;
  onLevel?: (level: SttLevel) => void;
  onSpeechStart?: () => void;
}

export interface MicVadHandle {
  stop: () => Promise<void>;
}

function downsample(buffer: Float32Array, srcRate: number): Float32Array {
  if (srcRate === MIC_VAD_SR) return buffer;
  const ratio = srcRate / MIC_VAD_SR;
  const out = new Float32Array(Math.round(buffer.length / ratio));
  let oi = 0;
  let bi = 0;
  while (oi < out.length) {
    const next = Math.round((oi + 1) * ratio);
    let acc = 0;
    let cnt = 0;
    for (let i = bi; i < next && i < buffer.length; i++) {
      acc += buffer[i];
      cnt++;
    }
    out[oi++] = cnt ? acc / cnt : 0;
    bi = next;
  }
  return out;
}

export async function startMicVad(opts: MicVadOptions): Promise<MicVadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtor({ sampleRate: MIC_VAD_SR });
  const srcRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(stream);
  const proc = audioCtx.createScriptProcessor(4096, 1, 1);

  let inSpeech = false;
  let silence = 0;
  let voiced = 0;
  let segment: number[] = [];
  let preroll: number[] = [];
  let carry: number[] = [];

  const flush = () => {
    if (segment.length < VAD_WIN) {
      segment = [];
      return;
    }
    const samples = Float32Array.from(segment);
    segment = [];
    opts.onSegment(samples, (samples.length / MIC_VAD_SR) * 1000);
  };

  proc.onaudioprocess = (e) => {
    const ds = downsample(new Float32Array(e.inputBuffer.getChannelData(0)), srcRate);
    for (let i = 0; i < ds.length; i++) carry.push(ds[i]);

    while (carry.length >= VAD_WIN) {
      const win = carry.splice(0, VAD_WIN);
      let sum = 0;
      for (let i = 0; i < VAD_WIN; i++) sum += win[i] * win[i];
      const rms = Math.sqrt(sum / VAD_WIN);
      const active = rms > RMS_THRESHOLD;
      opts.onLevel?.({ rms, active: inSpeech || active });

      if (!inSpeech) {
        for (const s of win) preroll.push(s);
        if (preroll.length > PREROLL) preroll.splice(0, preroll.length - PREROLL);
        if (active) {
          if (++voiced >= 2) {
            inSpeech = true;
            segment = preroll.slice();
            preroll = [];
            silence = 0;
            opts.onSpeechStart?.();
          }
        } else {
          voiced = 0;
        }
      } else {
        for (const s of win) segment.push(s);
        if (active) {
          silence = 0;
        } else if (++silence >= SILENCE_WINS) {
          inSpeech = false;
          voiced = 0;
          flush();
        }
        if (segment.length >= MAX_UTTER) {
          inSpeech = false;
          voiced = 0;
          silence = 0;
          flush();
        }
      }
    }
  };

  source.connect(proc);
  proc.connect(audioCtx.destination);

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (inSpeech) {
        inSpeech = false;
        flush();
      }
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await audioCtx.close().catch(() => {});
    },
  };
}

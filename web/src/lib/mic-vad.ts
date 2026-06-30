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
  onSegment: (samples: Float32Array, durationMs: number, offsetMs: number) => void;
  onLevel?: (level: SttLevel) => void;
  onSpeechStart?: () => void;
  deviceId?: string; // hardware INPUT device to capture from (default mic if unset)
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

/**
 * Offline VAD: run the same energy-VAD over a complete 16kHz mono buffer (e.g. a
 * decoded audio file), emitting one segment per detected utterance. Shares the
 * thresholds with the live mic path.
 */
export function segmentSamples(
  samples: Float32Array,
  onSegment: (s: Float32Array, durationMs: number, offsetMs: number) => void,
): void {
  let inSpeech = false;
  let silence = 0;
  let voiced = 0;
  let segment: number[] = [];
  let preroll: number[] = [];
  let segStart = 0; // absolute sample index of the current segment's first sample

  const flush = () => {
    if (segment.length >= VAD_WIN) {
      const s = Float32Array.from(segment);
      onSegment(s, (s.length / MIC_VAD_SR) * 1000, (Math.max(0, segStart) / MIC_VAD_SR) * 1000);
    }
    segment = [];
  };

  for (let off = 0; off + VAD_WIN <= samples.length; off += VAD_WIN) {
    const win = samples.subarray(off, off + VAD_WIN);
    let sum = 0;
    for (let i = 0; i < VAD_WIN; i++) sum += win[i] * win[i];
    const active = Math.sqrt(sum / VAD_WIN) > RMS_THRESHOLD;

    if (!inSpeech) {
      for (let i = 0; i < win.length; i++) preroll.push(win[i]);
      if (preroll.length > PREROLL) preroll.splice(0, preroll.length - PREROLL);
      if (active) {
        if (++voiced >= 2) {
          inSpeech = true;
          // preroll currently ends at sample off+VAD_WIN (current window included).
          segStart = off + VAD_WIN - preroll.length;
          segment = preroll.slice();
          preroll = [];
          silence = 0;
        }
      } else {
        voiced = 0;
      }
    } else {
      for (let i = 0; i < win.length; i++) segment.push(win[i]);
      if (active) silence = 0;
      else if (++silence >= SILENCE_WINS) {
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
  if (inSpeech) flush();
}

export interface MicRawOptions {
  onFrame: (samples: Float32Array, offsetMs: number) => void;
  onLevel?: (level: SttLevel) => void;
  deviceId?: string;
  frameMs?: number; // emitted chunk size (default 250ms)
}

/**
 * Raw mic capture WITHOUT VAD: emit fixed-size 16 kHz mono frames continuously
 * (for streaming consumers that do their own endpointing). No segmentation.
 */
export async function startMicRaw(opts: MicRawOptions): Promise<MicVadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
  });
  const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtor({ sampleRate: MIC_VAD_SR });
  const srcRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(stream);
  const proc = audioCtx.createScriptProcessor(4096, 1, 1);
  const FRAME = Math.max(VAD_WIN, Math.round((MIC_VAD_SR * (opts.frameMs ?? 250)) / 1000));
  let carry: number[] = [];
  let cursor = 0; // absolute samples emitted since start

  proc.onaudioprocess = (e) => {
    const ds = downsample(new Float32Array(e.inputBuffer.getChannelData(0)), srcRate);
    let sum = 0;
    for (let i = 0; i < ds.length; i++) { carry.push(ds[i]); sum += ds[i] * ds[i]; }
    opts.onLevel?.({ rms: Math.sqrt(sum / Math.max(1, ds.length)), active: true });
    while (carry.length >= FRAME) {
      const chunk = Float32Array.from(carry.splice(0, FRAME));
      opts.onFrame(chunk, (cursor / MIC_VAD_SR) * 1000);
      cursor += FRAME;
    }
  };

  source.connect(proc);
  proc.connect(audioCtx.destination);
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      proc.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await audioCtx.close().catch(() => {});
    },
  };
}

export async function startMicVad(opts: MicVadOptions): Promise<MicVadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
  });
  return vadFromStream(stream, opts);
}

/**
 * Run VAD segmentation over an existing audio MediaStream (e.g. the audio track
 * of a screen share). Same endpointing as startMicVad; owns its AudioContext and
 * stops the stream's tracks on stop().
 */
export function vadFromStream(stream: MediaStream, opts: MicVadOptions): MicVadHandle {
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
  let cursor = 0; // absolute sample index consumed since mic start
  let segStart = 0; // absolute sample index of the current segment's first sample

  const flush = () => {
    if (segment.length < VAD_WIN) {
      segment = [];
      return;
    }
    const samples = Float32Array.from(segment);
    segment = [];
    opts.onSegment(samples, (samples.length / MIC_VAD_SR) * 1000, (Math.max(0, segStart) / MIC_VAD_SR) * 1000);
  };

  proc.onaudioprocess = (e) => {
    const ds = downsample(new Float32Array(e.inputBuffer.getChannelData(0)), srcRate);
    for (let i = 0; i < ds.length; i++) carry.push(ds[i]);

    while (carry.length >= VAD_WIN) {
      const win = carry.splice(0, VAD_WIN);
      const winStart = cursor; // absolute index of this window's first sample
      cursor += VAD_WIN;
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
            // preroll ends at this window's last sample (winStart+VAD_WIN).
            segStart = winStart + VAD_WIN - preroll.length;
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
  // Auto-run starts without a click; resume in case the context is suspended.
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

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

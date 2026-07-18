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
  aec?: boolean; // browser echo cancellation + noise suppression + AGC (default on)
}

/**
 * getUserMedia audio constraints. echoCancellation/noiseSuppression/autoGainControl
 * are Chrome-on-by-default; we set them explicitly so the Mic node can turn the
 * cleanup OFF for raw capture. AEC references the device's own playback, so it
 * cancels a same-device speaker/TTS loop (residual leakage is normal).
 */
function audioConstraints(deviceId?: string, aec = true): MediaStreamConstraints["audio"] {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: aec,
    noiseSuppression: aec,
    autoGainControl: aec,
  };
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
  aec?: boolean; // browser echo cancellation + noise suppression + AGC (default on)
}

export interface MicFrameChunkResult {
  frames: { samples: Float32Array; offsetSamples: number }[];
  carry: Float32Array;
  cursor: number;
}

/** Append samples, emit fixed-size frames, and retain the trailing remainder. */
export function appendMicFrames(
  carry: Float32Array,
  samples: Float32Array,
  frameSize: number,
  cursor: number,
): MicFrameChunkResult {
  if (!Number.isInteger(frameSize) || frameSize <= 0) throw new RangeError("frameSize must be a positive integer");
  const combined = new Float32Array(carry.length + samples.length);
  combined.set(carry);
  combined.set(samples, carry.length);

  const frames: MicFrameChunkResult["frames"] = [];
  let offset = 0;
  while (offset + frameSize <= combined.length) {
    frames.push({ samples: combined.slice(offset, offset + frameSize), offsetSamples: cursor });
    offset += frameSize;
    cursor += frameSize;
  }
  return { frames, carry: combined.slice(offset), cursor };
}

const MIC_CAPTURE_WORKLET = `
class MicCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      const samples = channel.slice();
      this.port.postMessage(samples, [samples.buffer]);
    }
    return true;
  }
}
registerProcessor("mic-capture-processor", MicCaptureProcessor);
`;

/**
 * Raw mic capture WITHOUT VAD: emit fixed-size 16 kHz mono frames continuously
 * (for streaming consumers that do their own endpointing). No segmentation.
 */
export async function startMicRaw(opts: MicRawOptions): Promise<MicVadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints(opts.deviceId, opts.aec),
  });
  const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtor({ sampleRate: MIC_VAD_SR });
  const srcRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(stream);
  const FRAME = Math.round((MIC_VAD_SR * Math.max(20, opts.frameMs ?? 250)) / 1000);
  let carry: Float32Array = new Float32Array(0);
  let cursor = 0; // absolute samples emitted since start

  // Worklet quanta arrive ~125×/s (128 samples); level consumers feed the live
  // store and cross-device preview sync, so aggregate RMS to ~10 Hz like the
  // old 4096-sample ScriptProcessor cadence instead of spamming per quantum.
  let levelSum = 0;
  let levelCount = 0;
  let lastLevelAt = 0;
  const ingest = (input: Float32Array) => {
    const ds = downsample(input, srcRate);
    for (let i = 0; i < ds.length; i++) levelSum += ds[i] * ds[i];
    levelCount += ds.length;
    const now = performance.now();
    if (levelCount > 0 && now - lastLevelAt >= 100) {
      opts.onLevel?.({ rms: Math.sqrt(levelSum / levelCount), active: true });
      levelSum = 0;
      levelCount = 0;
      lastLevelAt = now;
    }
    const chunked = appendMicFrames(carry, ds, FRAME, cursor);
    carry = chunked.carry;
    cursor = chunked.cursor;
    for (const frame of chunked.frames) {
      opts.onFrame(frame.samples, (frame.offsetSamples / MIC_VAD_SR) * 1000);
    }
  };

  let captureNode: AudioWorkletNode | ScriptProcessorNode;
  let workletNode: AudioWorkletNode | null = null;
  if (audioCtx.audioWorklet) {
    const url = URL.createObjectURL(new Blob([MIC_CAPTURE_WORKLET], { type: "text/javascript" }));
    try {
      await audioCtx.audioWorklet.addModule(url);
      const worklet = new AudioWorkletNode(audioCtx, "mic-capture-processor");
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => ingest(event.data);
      workletNode = worklet;
      captureNode = worklet;
    } catch {
      console.warn("AudioWorklet mic capture unavailable; using ScriptProcessor fallback.");
      const proc = audioCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => ingest(new Float32Array(e.inputBuffer.getChannelData(0)));
      captureNode = proc;
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const proc = audioCtx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => ingest(new Float32Array(e.inputBuffer.getChannelData(0)));
    captureNode = proc;
  }

  source.connect(captureNode);
  captureNode.connect(audioCtx.destination);
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (workletNode) workletNode.port.onmessage = null;
      captureNode.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await audioCtx.close().catch(() => {});
    },
  };
}

export async function startMicVad(opts: MicVadOptions): Promise<MicVadHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints(opts.deviceId, opts.aec),
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

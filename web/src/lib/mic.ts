/**
 * Microphone capture → 16 kHz mono s16le PCM frames.
 *
 * The local otoji SenseVoice server (and the iFlytek / OpenAI providers)
 * expect 16 kHz mono signed-16-bit little-endian PCM. WebAudio gives us
 * float32 at the device sample rate (usually 44.1/48 kHz), so we downsample
 * with simple linear interpolation and quantize to Int16.
 *
 * Uses ScriptProcessorNode: deprecated in spec but fully supported in the
 * macOS WKWebView that Tauri embeds, and far simpler than shipping an
 * AudioWorklet module file.
 */
export interface MicPump {
  stop(): void;
}

const TARGET_RATE = 16000;

/** Linear-resample one float32 buffer from `inRate` to 16 kHz. */
export function downsampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_RATE) return input;
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Convert float32 samples in [-1, 1] to Int16 PCM. */
export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Start capturing the default microphone and invoke `onFrame` with 16 kHz mono
 * Int16 PCM frames until the returned pump is stopped.
 */
export async function startMicPump(onFrame: (frame: Int16Array) => void): Promise<MicPump> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  // ScriptProcessorNode only fires while connected to a destination.
  processor.connect(ctx.destination);
  processor.onaudioprocess = (ev) => {
    const ch0 = ev.inputBuffer.getChannelData(0);
    const ds = downsampleTo16k(ch0, ctx.sampleRate);
    onFrame(floatToInt16(ds));
  };
  return {
    stop() {
      try { processor.disconnect(); } catch { /* ignore */ }
      try { source.disconnect(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
      for (const t of stream.getTracks()) t.stop();
    },
  };
}

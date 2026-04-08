import type { SttProvider, SttSegment, SttSession } from "../types";

/**
 * Lazy-loaded transformers.js Whisper-tiny fallback.
 * Not a streaming model: we buffer audio and transcribe on stop().
 */
export class TransformersWhisperProvider implements SttProvider {
  readonly id = "transformers_whisper";
  readonly name = "WASM Whisper (transformers.js)";
  private enabled: boolean;
  constructor(opts: { enabled?: boolean } = {}) {
    this.enabled = opts.enabled ?? false;
  }
  isAvailable(): boolean { return this.enabled; }

  async start(onSegment: (s: SttSegment) => void, onError?: (e: Error) => void): Promise<SttSession> {
    const modName = "@xenova/transformers";
    const mod = await (new Function("m", "return import(m)")(modName) as Promise<any>).catch((e: any) => {
      onError?.(new Error("transformers.js not installed: " + e.message));
      throw e;
    });
    const pipeline = (mod as any).pipeline;
    const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
    const buf: number[] = [];
    return {
      sendAudio(frame: Int16Array) {
        for (let i = 0; i < frame.length; i++) buf.push(frame[i] / 32768);
      },
      async stop() {
        const f32 = new Float32Array(buf);
        try {
          const out = await asr(f32, { sampling_rate: 16000 });
          onSegment({ text: (out as any).text ?? "", final: true });
        } catch (e: any) {
          onError?.(e);
        }
      },
    };
  }
}

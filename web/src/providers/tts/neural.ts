import { DEFAULT_NEURAL_TTS_MODEL } from "./tts-config";
import { disposeMemo } from "../dispose-util";

// On-device neural TTS via transformers.js (https://github.com/huggingface/transformers.js).
// Runs an MMS-TTS (VITS) model entirely in WASM — no WebGPU, no network at synth
// time after the weights are cached, and (unlike browser SpeechSynthesis) it
// returns raw PCM, so the result can be routed to a device-targetable speaker.
// The library is fetched lazily from the CDN (esm.run) only when a node uses it.

export interface NeuralTtsProgress {
  progress?: number; // 0..1
  text?: string;
}

export interface NeuralTtsAudio {
  samples: Float32Array;
  sampleRate: number;
}

// Hide the URL from Vite's bundler so it stays a runtime dynamic import (same
// trick the WebLLM + transformers.js STT paths use).
const TFJS_URL = "https://esm.sh/@huggingface/transformers";
const importTfjs = () => new Function("u", "return import(u)")(TFJS_URL) as Promise<any>;

/** One synthesis pipeline per model id; creation is heavy, so cache + dedupe. */
const synths = new Map<string, Promise<any>>();

async function getSynth(modelId: string, onProgress?: (p: NeuralTtsProgress) => void): Promise<any> {
  let p = synths.get(modelId);
  if (!p) {
    p = (async () => {
      const tf = await importTfjs();
      tf.env.allowLocalModels = false; // always fetch from the hub/CDN
      tf.env.useBrowserCache = true; // cache weights in the browser (Cache API)
      return tf.pipeline("text-to-speech", modelId, {
        progress_callback: (r: { status?: string; progress?: number }) =>
          onProgress?.({ progress: r.progress !== undefined ? r.progress / 100 : undefined, text: r.status }),
      });
    })().catch((e) => {
      synths.delete(modelId); // don't cache a failed load — allow retry
      throw e;
    });
    synths.set(modelId, p);
  }
  return p;
}

export class NeuralTtsProvider {
  readonly id = "neural";
  readonly name = "Neural TTS (on-device)";

  isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  /** Preload (download + init) a model so the first synth isn't blocked on it. */
  async warm(modelId = DEFAULT_NEURAL_TTS_MODEL, onProgress?: (p: NeuralTtsProgress) => void): Promise<void> {
    await getSynth(modelId, onProgress);
  }

  async synthesize(text: string, modelId = DEFAULT_NEURAL_TTS_MODEL): Promise<NeuralTtsAudio> {
    const synth = await getSynth(modelId);
    const out = await synth(text);
    // transformers.js TTS returns { audio: Float32Array, sampling_rate: number }.
    return { samples: out.audio as Float32Array, sampleRate: out.sampling_rate as number };
  }
}

export const neuralTts = new NeuralTtsProvider();

/** Free all neural-TTS synthesis pipelines (the last Neural-TTS node left). */
export const disposeNeuralTts = () => disposeMemo(synths, ["dispose"]);

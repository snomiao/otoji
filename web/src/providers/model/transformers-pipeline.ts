// Generic in-browser model runner via transformers.js (ONNX/WASM). Lets a graph
// node import ANY transformers.js-compatible model by HF repo id (or a custom
// remote host URL) and run it for one of the graph-relevant tasks. The library is
// fetched lazily from the CDN (esm.run) and weights are cached in the browser.

import { p2pModelCache } from "./p2p-cache";
import { disposeMemo } from "../dispose-util";

export interface PipeProgress {
  progress?: number; // 0..1
  text?: string;
}

// Our task ids -> transformers.js pipeline task names.
export const MODEL_TASKS = [
  { id: "asr", name: "Speech → Text (ASR)", tfjs: "automatic-speech-recognition" },
  { id: "translation", name: "Translate", tfjs: "translation" },
  { id: "text2text", name: "Text → Text", tfjs: "text2text-generation" },
  { id: "tts", name: "Text → Speech (TTS)", tfjs: "text-to-speech" },
] as const;

export type ModelTask = (typeof MODEL_TASKS)[number]["id"];

const TFJS_TASK: Record<ModelTask, string> = {
  asr: "automatic-speech-recognition",
  translation: "translation",
  text2text: "text2text-generation",
  tts: "text-to-speech",
};

// Weight precision. We default to "fp32" for maximum compatibility on the wasm
// backend: many quantized exports (esp. encoder-decoder decoders like Whisper)
// use 4-bit MatMulNBits ops the wasm EP can't load. Smaller dtypes (q8/q4) are
// opt-in per node for models that support them.
export const MODEL_DTYPES = ["fp32", "fp16", "q8", "q4", "auto"] as const;
export const DEFAULT_MODEL_DTYPE = "fp32";

const TFJS_URL = "https://esm.sh/@huggingface/transformers";
const importTfjs = () => new Function("u", "return import(u)")(TFJS_URL) as Promise<any>;

/** One pipeline per (task, model, dtype); creation is heavy, so cache + dedupe. */
const pipes = new Map<string, Promise<any>>();

function getPipe(task: ModelTask, model: string, dtype = DEFAULT_MODEL_DTYPE, onProgress?: (p: PipeProgress) => void): Promise<any> {
  const key = `${task}|${model}|${dtype}`;
  let p = pipes.get(key);
  if (!p) {
    p = (async () => {
      const tf = await importTfjs();
      tf.env.allowLocalModels = false;
      // Route model files through the P2P cache (env is a transformers.js global,
      // so this also covers the neural-TTS path): serve from a roommate before HF.
      tf.env.useBrowserCache = false;
      tf.env.useCustomCache = true;
      tf.env.customCache = p2pModelCache;
      const opts: Record<string, unknown> = {
        progress_callback: (r: { status?: string; progress?: number }) =>
          onProgress?.({ progress: r.progress !== undefined ? r.progress / 100 : undefined, text: r.status }),
      };
      if (dtype !== "auto") opts.dtype = dtype;
      return tf.pipeline(TFJS_TASK[task], model, opts);
    })().catch((e) => {
      pipes.delete(key); // don't cache a failed load — allow retry
      throw e;
    });
    pipes.set(key, p);
  }
  return p;
}

/** Preload a model so the first run isn't blocked on the download. */
export function warmPipe(task: ModelTask, model: string, dtype?: string, onProgress?: (p: PipeProgress) => void): Promise<void> {
  return getPipe(task, model, dtype, onProgress).then(() => undefined);
}

/** ASR: 16 kHz mono PCM -> recognized text. */
export async function runAsr(model: string, samples: Float32Array, dtype?: string): Promise<string> {
  const pipe = await getPipe("asr", model, dtype);
  const out = await pipe(samples, { sampling_rate: 16000 });
  return (Array.isArray(out) ? out[0]?.text : out?.text) ?? "";
}

/** translation / text2text-generation: text -> text. */
export async function runText(task: ModelTask, model: string, text: string, dtype?: string): Promise<string> {
  const pipe = await getPipe(task, model, dtype);
  const out = await pipe(text);
  const first = Array.isArray(out) ? out[0] : out;
  return (first?.translation_text ?? first?.generated_text ?? first?.summary_text ?? "") || text;
}

/** TTS: text -> { samples, sampleRate }. */
export async function runTts(model: string, text: string, dtype?: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const pipe = await getPipe("tts", model, dtype);
  const out = await pipe(text);
  return { samples: out.audio as Float32Array, sampleRate: out.sampling_rate as number };
}

/** Free all transformers.js pipelines (the last Custom-model node left). */
export const disposePipes = () => disposeMemo(pipes, ["dispose"]);

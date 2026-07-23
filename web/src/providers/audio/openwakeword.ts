// Real keyword-spotting (wake word) in the browser via openWakeWord on
// onnxruntime-web. Three ONNX stages, all on the wasm backend:
//   1. melspectrogram.onnx : 16 kHz float audio → log-mel frames (×32 bins),
//      each frame transformed (x/10 + 2) per openWakeWord's convention.
//   2. embedding_model.onnx : a sliding 76-frame mel window → a 96-d embedding
//      (Google's speech_embedding); window advances 8 mel frames per step.
//   3. <wake>.onnx : the last 16 embeddings ([1,16,96]) → a 0..1 score; a
//      score over the threshold (with a cooldown) is a detection.
// Tensor names are introspected per model, so any openWakeWord export works.
//
// Default models come from a CORS-friendly Hugging Face mirror; the frontend
// (mel + embedding) is shared across wake words, and the wake head is
// swappable via config. No weights are bundled.

import { disposeMemo } from "../dispose-util";

const ORT_VERSION = "1.27.0"; // matches the deduped onnxruntime-web dep
const HF = "https://huggingface.co/harvestsu/openwakeword-onnx/resolve/main";

export interface WakeModelPaths {
  melUrl: string;
  embeddingUrl: string;
  wakeUrl: string;
}

// openWakeWord frontend geometry (fixed by the exported models).
const CHUNK_SAMPLES = 1280; // 80 ms @ 16 kHz — mel model's expected input
const MEL_BINS = 32;
const EMBED_WINDOW = 76; // mel frames per embedding
const EMBED_STEP = 8; // mel frames advanced per embedding
const WAKE_WINDOW = 16; // embeddings per wake-model inference

export function defaultWakePaths(wakeUrl = `${HF}/hey_jarvis_v0.1.onnx`): WakeModelPaths {
  return { melUrl: `${HF}/melspectrogram.onnx`, embeddingUrl: `${HF}/embedding_model.onnx`, wakeUrl };
}

/** Resolve a config's wake-model reference (bare name, or full URL) to paths. */
export function wakePathsFromConfig(cfg: { model?: string; base?: string }): WakeModelPaths {
  const base = cfg.base?.replace(/\/+$/, "") || HF;
  const ref = (cfg.model ?? "hey_jarvis_v0.1.onnx").trim();
  const wakeUrl = /^https?:\/\//.test(ref) ? ref : `${base}/${ref.endsWith(".onnx") ? ref : ref + ".onnx"}`;
  return { melUrl: `${base}/melspectrogram.onnx`, embeddingUrl: `${base}/embedding_model.onnx`, wakeUrl };
}

interface OrtApi { InferenceSession: any; Tensor: any; env: any }
let ortPromise: Promise<OrtApi> | null = null;
function loadOrt(): Promise<OrtApi> {
  if (!ortPromise) {
    ortPromise = (async () => {
      const ort = (await import("onnxruntime-web")) as any;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      return ort as OrtApi;
    })().catch((e) => {
      ortPromise = null;
      throw e;
    });
  }
  return ortPromise;
}

interface Engine {
  ort: OrtApi;
  mel: any;
  embedding: any;
  wake: any;
}
const engines = new Map<string, Promise<Engine>>();

function getEngine(paths: WakeModelPaths): Promise<Engine> {
  const key = `${paths.melUrl}\n${paths.embeddingUrl}\n${paths.wakeUrl}`;
  let p = engines.get(key);
  if (!p) {
    p = (async () => {
      const ort = await loadOrt();
      const opts = { executionProviders: ["wasm"] };
      const fetchBuf = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer());
      const [melBuf, embBuf, wakeBuf] = await Promise.all([fetchBuf(paths.melUrl), fetchBuf(paths.embeddingUrl), fetchBuf(paths.wakeUrl)]);
      const [mel, embedding, wake] = await Promise.all([
        ort.InferenceSession.create(melBuf, opts),
        ort.InferenceSession.create(embBuf, opts),
        ort.InferenceSession.create(wakeBuf, opts),
      ]);
      return { ort, mel, embedding, wake };
    })().catch((e) => {
      engines.delete(key);
      throw e;
    });
    engines.set(key, p);
  }
  return p;
}

/** Preload the wake models so the first detection isn't slow. */
export function warmWake(paths?: WakeModelPaths): Promise<unknown> {
  return getEngine(paths ?? defaultWakePaths());
}

// ---------------------------------------------------------------------------
// Pure ring-buffer helper (no ORT) — accumulate captured audio after a wake
// and hand back exactly `captureMs` worth, so downstream ASR gets the command.
// ---------------------------------------------------------------------------
export class CaptureBuffer {
  private chunks: Float32Array[] = [];
  private len = 0;
  private capturing = false;
  private readonly target: number;
  constructor(captureMs: number, sampleRate = 16000) {
    this.target = Math.round((captureMs / 1000) * sampleRate);
  }
  start(): void {
    this.capturing = true;
    this.chunks = [];
    this.len = 0;
  }
  /** Feed audio; returns the captured utterance once `captureMs` is reached, else null. */
  push(samples: Float32Array): Float32Array | null {
    if (!this.capturing) return null;
    this.chunks.push(samples);
    this.len += samples.length;
    if (this.len < this.target) return null;
    const out = new Float32Array(this.len);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    this.capturing = false;
    this.chunks = [];
    this.len = 0;
    return out;
  }
  get active(): boolean {
    return this.capturing;
  }
}

export interface WakeStream {
  accept(samples: Float32Array): void;
  free(): void;
}

/**
 * Create a streaming wake-word detector. `onWake(score)` fires when the wake
 * model crosses `threshold` (respecting `cooldownMs`); `onCommandAudio` fires
 * once `captureMs` of audio has been buffered after a wake, carrying the
 * command utterance for an ASR node. `onScore` streams the raw score for a
 * live meter.
 */
export function createWakeStream(opts: {
  paths?: WakeModelPaths;
  threshold?: number;
  cooldownMs?: number;
  captureMs?: number;
  onWake?: (score: number) => void;
  onCommandAudio?: (samples: Float32Array) => void;
  onScore?: (score: number) => void;
  onError?: (e: Error) => void;
}): WakeStream {
  const paths = opts.paths ?? defaultWakePaths();
  const threshold = opts.threshold ?? 0.5;
  const cooldownMs = opts.cooldownMs ?? 2000;
  const capture = new CaptureBuffer(opts.captureMs ?? 3000);

  let engine: Engine | null = null;
  const enginePromise = getEngine(paths).then((e) => (engine = e));
  enginePromise.catch((e) => opts.onError?.(e instanceof Error ? e : new Error(String(e))));

  let sampleTail: number[] = []; // < CHUNK_SAMPLES leftover
  const melBuffer: number[] = []; // flattened [frame*MEL_BINS]
  const embBuffer: Float32Array[] = []; // rolling embeddings
  let lastWakeTs = -Infinity;
  let running = false;
  let freed = false;
  let clock = 0; // ms of audio consumed (for cooldown)

  const runFrontend = async (e: Engine) => {
    // 1. mel: consume whole 1280-sample chunks
    while (sampleTail.length >= CHUNK_SAMPLES) {
      const chunk = Float32Array.from(sampleTail.slice(0, CHUNK_SAMPLES));
      sampleTail = sampleTail.slice(CHUNK_SAMPLES);
      clock += (CHUNK_SAMPLES / 16000) * 1000;
      const melIn = new e.ort.Tensor("float32", chunk, [1, CHUNK_SAMPLES]);
      const melOut = await e.mel.run({ [e.mel.inputNames[0]]: melIn });
      const t = melOut[e.mel.outputNames[0]];
      const data = t.data as Float32Array;
      // openWakeWord's fixed post-transform; data is [.., frames, 32]
      for (let i = 0; i < data.length; i++) melBuffer.push(data[i] / 10 + 2);
    }
    // 2. embedding: slide a 76-frame window, advance 8 frames
    while (melBuffer.length >= EMBED_WINDOW * MEL_BINS) {
      const win = Float32Array.from(melBuffer.slice(0, EMBED_WINDOW * MEL_BINS));
      melBuffer.splice(0, EMBED_STEP * MEL_BINS);
      const embIn = new e.ort.Tensor("float32", win, [1, EMBED_WINDOW, MEL_BINS, 1]);
      const embOut = await e.embedding.run({ [e.embedding.inputNames[0]]: embIn });
      const emb = Float32Array.from((embOut[e.embedding.outputNames[0]].data as Float32Array).slice(0, 96));
      embBuffer.push(emb);
      if (embBuffer.length > WAKE_WINDOW) embBuffer.shift();
      // 3. wake: need a full window of 16 embeddings
      if (embBuffer.length === WAKE_WINDOW) {
        const flat = new Float32Array(WAKE_WINDOW * 96);
        for (let i = 0; i < WAKE_WINDOW; i++) flat.set(embBuffer[i], i * 96);
        const wakeIn = new e.ort.Tensor("float32", flat, [1, WAKE_WINDOW, 96]);
        const wakeOut = await e.wake.run({ [e.wake.inputNames[0]]: wakeIn });
        const score = (wakeOut[e.wake.outputNames[0]].data as Float32Array)[0];
        opts.onScore?.(score);
        if (score >= threshold && clock - lastWakeTs >= cooldownMs) {
          lastWakeTs = clock;
          opts.onWake?.(score);
          capture.start();
        }
      }
    }
  };

  const pump = async (samples: Float32Array) => {
    if (running || freed) { for (let i = 0; i < samples.length; i++) sampleTail.push(samples[i]); return; }
    running = true;
    try {
      const e = await enginePromise;
      if (!e) return;
      for (let i = 0; i < samples.length; i++) sampleTail.push(samples[i]);
      await runFrontend(e);
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      running = false;
    }
  };

  return {
    accept: (samples) => {
      if (freed || !samples?.length) return;
      // audio always feeds the post-wake capture too
      const captured = capture.push(samples);
      if (captured) opts.onCommandAudio?.(captured);
      void pump(samples);
    },
    free: () => { freed = true; sampleTail = []; },
  };
}

export const disposeWake = () => disposeMemo(engines, ["release", "dispose"]);
export const DEFAULT_WAKE_MODEL = "hey_jarvis_v0.1.onnx";

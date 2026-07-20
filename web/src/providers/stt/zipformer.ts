// In-browser streaming ASR: sherpa-exported streaming-zipformer transducer on
// onnxruntime-web (M6.1). Three ONNX sessions — encoder (with explicit cache
// in/out tensors), stateless decoder, joiner — plus the incremental fbank
// frontend and a greedy transducer search, all in TS. Feed continuous 16 kHz
// mono frames (mic-raw); partial hypotheses stream out per encoder chunk and a
// trailing-silence endpoint finalizes utterances.
//
// The M6.-1 spike measured RTF ≈ 0.23 on the wasm EP for a far larger model
// (and the 20M default is lighter still), so this runs on the main thread with
// a latest-only pump: while one chunk is in flight, audio keeps accumulating
// in the feature FIFO and the next run drains whatever is ready.

import { createStreamingFbank, type FbankOptions } from "../../lib/fbank";
import { parseOnnxMetadata } from "../../lib/onnx-meta";
import { backoffDelay, sleep } from "../../lib/backoff";
import type { ModelSourceMsg } from "../model/model-source";

const CACHE_NAME = "otoji-models-v1";
const ORT_VERSION = "1.27.0";

// Default model: streaming zipformer en 20M, int8 (~27 MB total) — small,
// fast, and verified end-to-end in Chrome. NOTE: the larger zipformer2 export
// (sherpa-onnx-streaming-zipformer-en-2023-06-26 int8) produces all-NaN
// encoder output on onnxruntime-web 1.27 wasm — a quantized-op bug; stick to
// zipformer(1)-generation exports for browser use until that's resolved.
const DEFAULT_REPO = "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main";
const DEFAULT_FILES = {
  encoder: "encoder-epoch-99-avg-1.int8.onnx",
  decoder: "decoder-epoch-99-avg-1.onnx", // sherpa recommends fp32 for the tiny decoder
  joiner: "joiner-epoch-99-avg-1.int8.onnx",
  tokens: "tokens.txt",
};

// icefall/zipformer features: kaldi fbank, 80 bins, povey window, and samples
// scaled to the int16 range (kaldi convention; no CMVN for these models).
const ZIPFORMER_FBANK: FbankOptions = {
  sampleRate: 16000,
  frameLengthMs: 25,
  frameShiftMs: 10,
  numBins: 80,
  lowFreq: 20,
  highFreq: 0,
  preemph: 0.97,
  removeDcOffset: true,
  window: "povey",
};
// icefall models are trained on lhotse fbank over [-1, 1] float waveforms —
// no int16 rescale (unlike the FunASR/SenseVoice convention).
const SAMPLE_SCALE = 1;

// Endpointing (subset of sherpa's rules): an utterance finalizes after
// TRAIL_SIL_MS of trailing silence once it has any tokens; with no tokens the
// hypothesis just keeps waiting (nothing to emit).
const TRAIL_SIL_MS = 1200;
const ENCODER_FRAME_MS = 20; // 320 ms chunk -> 16 encoder output frames

export interface ZipformerModelPaths {
  encoderUrl: string;
  decoderUrl: string;
  joinerUrl: string;
  tokensUrl: string;
}

/** Expand a repo base URL (…/resolve/main) into the default file quartet. */
export function zipformerPathsFromBase(base: string): ZipformerModelPaths {
  const b = base.replace(/\/+$/, "");
  return {
    encoderUrl: `${b}/${DEFAULT_FILES.encoder}`,
    decoderUrl: `${b}/${DEFAULT_FILES.decoder}`,
    joinerUrl: `${b}/${DEFAULT_FILES.joiner}`,
    tokensUrl: `${b}/${DEFAULT_FILES.tokens}`,
  };
}

/**
 * Map a Model-provider message to a zipformer file quartet, or undefined when
 * the source doesn't look like a sherpa streaming-transducer export. Accepts a
 * file listing with encoder/decoder/joiner ONNX + tokens.txt (int8 preferred),
 * or a bare directory URL hosting the default filenames.
 */
export function zipformerModelFromSource(src: Pick<ModelSourceMsg, "url" | "files">): ZipformerModelPaths | undefined {
  const files = src.files ?? [];
  const pick = (part: string) => {
    const all = files.filter((f) => new RegExp(`(^|[/_.-])${part}[^/]*\\.onnx$`, "i").test(f.name));
    return all.find((f) => /int8/i.test(f.name)) ?? all[0];
  };
  const encoder = pick("encoder");
  const decoder = pick("decoder");
  const joiner = pick("joiner");
  const tokens = files.find((f) => /(^|\/)tokens\.txt$/i.test(f.name));
  if (encoder && decoder && joiner && tokens)
    return { encoderUrl: encoder.url, decoderUrl: decoder.url, joinerUrl: joiner.url, tokensUrl: tokens.url };
  if (src.url && !/\.[a-z0-9]{1,12}([?#]|$)/i.test(src.url)) return zipformerPathsFromBase(src.url);
  return undefined;
}

/** Parse sherpa tokens.txt ("<piece> <id>" per line) into an id → piece table. */
export function parseTokens(text: string): string[] {
  const table: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const sp = trimmed.lastIndexOf(" ");
    if (sp <= 0) continue;
    const id = Number(trimmed.slice(sp + 1));
    if (!Number.isInteger(id) || id < 0) continue;
    table[id] = trimmed.slice(0, sp);
  }
  return table;
}

/** Join sentencepiece tokens into readable text (▁ marks a word boundary). */
export function decodeTokens(ids: number[], table: string[]): string {
  let out = "";
  for (const id of ids) {
    const piece = table[id] ?? "";
    if (!piece || piece.startsWith("<")) continue; // <blk>/<sos/eos>/<unk>
    out += piece.replace(/▁/g, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * One greedy-search step over a run of encoder frames: for each frame, take
 * argmax of joiner(enc, dec); a non-blank emits a token and advances the
 * decoder context (max one symbol per frame — sherpa's streaming greedy).
 * Pure math loop, exported for tests via `argmax`.
 */
export function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

async function fetchCached(url: string, onProgress?: (received: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    /* Cache API unavailable — plain fetch below */
  }
  let attempt = 0;
  for (;;) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      const total = Number(resp.headers.get("content-length")) || 0;
      const reader = resp.body?.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          onProgress?.(received, total);
        }
      }
      const buf = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.length; }
      try { await cache?.put(url, new Response(buf.slice())); } catch { /* quota */ }
      return buf;
    } catch (e) {
      if (++attempt > 4) throw e;
      await sleep(backoffDelay(attempt));
    }
  }
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
    })();
  }
  return ortPromise;
}

interface Engine {
  ort: OrtApi;
  encoder: any;
  decoder: any;
  joiner: any;
  tokens: string[];
  chunkFrames: number; // fbank frames consumed per encoder call (T)
  chunkShift: number; // fbank frames advanced per call (decode_chunk_len)
  contextSize: number; // decoder context width (2 for these exports)
  blankId: number;
  encCacheIn: string[]; // encoder cache input names (order-matched to outputs[1..])
  initCaches: Record<string, any>; // zero tensors keyed by cache input name
}

const engines = new Map<string, Promise<Engine>>();

function shapeOf(meta: any): (number | string)[] | undefined {
  return meta?.shape ?? meta?.dimensions ?? meta?.dims;
}
function metaFor(session: any, name: string): any {
  const m = session.inputMetadata;
  if (Array.isArray(m)) return m.find((x: any) => x.name === name);
  return m?.[name];
}
function concreteShape(meta: any): number[] {
  // The only dynamic axis in these exports is the batch ("N"), possibly
  // mid-shape in cache tensors; we always run batch-1.
  return (shapeOf(meta) ?? []).map((d) => (typeof d === "number" && d >= 0 ? d : 1));
}
function zeroTensor(ort: OrtApi, meta: any): any {
  const shape = concreteShape(meta);
  const size = shape.reduce((a, b) => a * b, 1);
  const type = String(meta?.type ?? "float32").replace(/^tensor\(|\)$/g, "");
  if (type === "int64") return new ort.Tensor("int64", new BigInt64Array(size), shape);
  if (type === "int32") return new ort.Tensor("int32", new Int32Array(size), shape);
  return new ort.Tensor("float32", new Float32Array(size), shape);
}

function getEngine(paths: ZipformerModelPaths, onProgress?: (stage: string, received: number, total: number) => void): Promise<Engine> {
  const key = `${paths.encoderUrl}\n${paths.decoderUrl}\n${paths.joinerUrl}\n${paths.tokensUrl}`;
  let p = engines.get(key);
  if (!p) {
    p = (async () => {
      const ort = await loadOrt();
      const [encBuf, decBuf, joinBuf, tokBuf] = await Promise.all([
        fetchCached(paths.encoderUrl, (r, t) => onProgress?.("encoder", r, t)),
        fetchCached(paths.decoderUrl, (r, t) => onProgress?.("decoder", r, t)),
        fetchCached(paths.joinerUrl, (r, t) => onProgress?.("joiner", r, t)),
        fetchCached(paths.tokensUrl),
      ]);
      // sherpa stores decode geometry in the encoder's metadata_props.
      const meta = parseOnnxMetadata(encBuf);
      const opts = { executionProviders: ["wasm"] };
      const [encoder, decoder, joiner] = await Promise.all([
        ort.InferenceSession.create(encBuf, opts),
        ort.InferenceSession.create(decBuf, opts),
        ort.InferenceSession.create(joinBuf, opts),
      ]);
      const xMeta = metaFor(encoder, encoder.inputNames[0]);
      const xShape = shapeOf(xMeta);
      const staticT = typeof xShape?.[1] === "number" && (xShape[1] as number) > 0 ? (xShape[1] as number) : 0;
      const chunkFrames = staticT || Number(meta["T"]) || 39;
      const chunkShift = Number(meta["decode_chunk_len"]) || chunkFrames - 7;
      const contextSize = Number(meta["context_size"]) || 2;
      const blankId = Number(meta["blank_id"]) || 0;
      const encCacheIn = (encoder.inputNames as string[]).slice(1);
      const initCaches: Record<string, any> = {};
      for (const name of encCacheIn) initCaches[name] = zeroTensor(ort, metaFor(encoder, name));
      return {
        ort, encoder, decoder, joiner,
        tokens: parseTokens(new TextDecoder().decode(tokBuf)),
        chunkFrames, chunkShift, contextSize, blankId, encCacheIn, initCaches,
      };
    })().catch((e) => {
      engines.delete(key);
      throw e;
    });
    engines.set(key, p);
  }
  return p;
}

/** Preload the model quartet so the first spoken words aren't slow. */
export function warmZipformer(paths?: ZipformerModelPaths, onProgress?: (stage: string, received: number, total: number) => void): Promise<unknown> {
  return getEngine(paths ?? zipformerPathsFromBase(DEFAULT_REPO), onProgress);
}

export interface ZipformerStream {
  /** Feed continuous mono float samples in [-1, 1] at 16 kHz. */
  accept(samples: Float32Array): void;
  /** Flush: finalize any pending hypothesis (e.g. on Stop). */
  flush(): Promise<void>;
  free(): void;
}

/**
 * Create a streaming recognizer. Callbacks mirror the native sherpa bridge:
 * `onPartial(text, segId)` fires when the hypothesis grows, `onFinal(text,
 * segId)` on a silence endpoint; segIds increment per utterance.
 */
export function createZipformerStream(
  opts: {
    paths?: ZipformerModelPaths;
    onPartial: (text: string, segId: number) => void;
    onFinal: (text: string, segId: number) => void;
    onError?: (e: Error) => void;
    onProgress?: (stage: string, received: number, total: number) => void;
  },
): ZipformerStream {
  const paths = opts.paths ?? zipformerPathsFromBase(DEFAULT_REPO);
  const fbank = createStreamingFbank(ZIPFORMER_FBANK);
  const frames: Float32Array[] = []; // FIFO of [numBins] fbank frames
  let engine: Engine | null = null;
  let caches: Record<string, any> = {};
  let context: number[] = [];
  let decoderOut: any = null;
  let hyp: number[] = [];
  let lastPartial = "";
  let segId = 0;
  let trailingSilMs = 0;
  let running = false;
  let freed = false;

  const enginePromise = getEngine(paths, opts.onProgress).then((e) => {
    engine = e;
    caches = { ...e.initCaches };
    context = new Array(e.contextSize).fill(e.blankId);
    return e;
  });
  enginePromise.catch((e) => opts.onError?.(e instanceof Error ? e : new Error(String(e))));

  const runDecoder = async (e: Engine): Promise<any> => {
    const y = new e.ort.Tensor("int64", BigInt64Array.from(context.map((t) => BigInt(t))), [1, e.contextSize]);
    const out = await e.decoder.run({ [e.decoder.inputNames[0]]: y });
    return out[e.decoder.outputNames[0]];
  };

  const finalize = (why: "endpoint" | "flush") => {
    if (!engine) return;
    const text = decodeTokens(hyp, engine.tokens);
    if (text) opts.onFinal(text, segId);
    if (text || why === "endpoint") segId += 1;
    hyp = [];
    lastPartial = "";
    trailingSilMs = 0;
    context = new Array(engine.contextSize).fill(engine.blankId);
    decoderOut = null;
    caches = { ...engine.initCaches }; // fresh utterance, fresh encoder state
  };

  const pump = async () => {
    if (running || freed) return;
    running = true;
    try {
      const e = await enginePromise;
      while (!freed && frames.length >= e.chunkFrames) {
        if (!decoderOut) decoderOut = await runDecoder(e); // fresh after an endpoint

        // Pack the first T frames into x, advance by decode_chunk_len.
        const x = new Float32Array(e.chunkFrames * ZIPFORMER_FBANK.numBins);
        for (let i = 0; i < e.chunkFrames; i++) x.set(frames[i], i * ZIPFORMER_FBANK.numBins);
        frames.splice(0, e.chunkShift);
        const feeds: Record<string, any> = { ...caches };
        feeds[e.encoder.inputNames[0]] = new e.ort.Tensor("float32", x, [1, e.chunkFrames, ZIPFORMER_FBANK.numBins]);
        const out = await e.encoder.run(feeds);
        const outNames = e.encoder.outputNames as string[];
        for (let i = 0; i < e.encCacheIn.length; i++) caches[e.encCacheIn[i]] = out[outNames[i + 1]];
        const enc = out[outNames[0]]; // [1, T_out, encDim]
        const [, tOut, encDim] = enc.dims as number[];
        const encData = enc.data as Float32Array;
        for (let t = 0; t < tOut; t++) {
          const encFrame = new e.ort.Tensor("float32", encData.slice(t * encDim, (t + 1) * encDim), [1, encDim]);
          const joinFeeds: Record<string, any> = {
            [e.joiner.inputNames[0]]: encFrame,
            [e.joiner.inputNames[1]]: decoderOut,
          };
          const jo = await e.joiner.run(joinFeeds);
          const logits = jo[e.joiner.outputNames[0]].data as Float32Array;
          const best = argmax(logits);
          if (best !== e.blankId) {
            hyp.push(best);
            context = [...context.slice(1), best];
            decoderOut = await runDecoder(e);
            trailingSilMs = 0;
          } else {
            trailingSilMs += ENCODER_FRAME_MS;
          }
        }
        const text = decodeTokens(hyp, e.tokens);
        if (text && text !== lastPartial) {
          lastPartial = text;
          opts.onPartial(text, segId);
        }
        if (hyp.length && trailingSilMs >= TRAIL_SIL_MS) finalize("endpoint");
      }
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      running = false;
    }
  };

  return {
    accept: (samples) => {
      if (freed || !samples?.length) return;
      const scaled = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * SAMPLE_SCALE;
      const { feats, numFrames, numBins } = fbank.push(scaled);
      for (let f = 0; f < numFrames; f++) frames.push(feats.slice(f * numBins, (f + 1) * numBins));
      void pump();
    },
    flush: async () => {
      // Wait for the in-flight pump, then finalize whatever is hypothesized.
      while (running) await sleep(20);
      if (engine) finalize("flush");
    },
    free: () => {
      freed = true;
      frames.length = 0;
    },
  };
}

export const DEFAULT_ZIPFORMER_REPO = DEFAULT_REPO;

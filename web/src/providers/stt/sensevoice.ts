import type { SttProvider, SttSegment, SttSession, SttLevel } from "../types";
import { computeFbank, SENSEVOICE_FBANK } from "../../lib/fbank";
import { parseOnnxMetadata, parseFloatList } from "../../lib/onnx-meta";
import { backoffDelay, sleep } from "../../lib/backoff";
import { startMicVad, MIC_VAD_SR } from "../../lib/mic-vad";
import {
  getSenseVoiceModel,
  DEFAULT_SENSEVOICE_MODEL,
  type SenseVoiceModelSpec,
} from "./sensevoice-models";

const CACHE_NAME = "otoji-models-v1";
const ORT_VERSION = "1.27.0";

export interface LoadProgress {
  stage: "fetch-model" | "fetch-tokens" | "init" | "ready";
  received?: number;
  total?: number;
}

/** Rich STT output. `lang` is SenseVoice's detected LID; `startMs`/`endMs` are the
 *  speech extent within the segment, derived from the CTC frame alignment. */
export interface SttResult {
  text: string;
  lang?: string;
  emotion?: string; // SER tag, e.g. "HAPPY"
  event?: string; // AED tag, e.g. "Applause" / "BGM" ("Speech" for ordinary speech)
  startMs?: number;
  endMs?: number;
}

// ---------------------------------------------------------------------------
// Pure decode pipeline (exported for unit tests)
// ---------------------------------------------------------------------------

/** Stack `m` consecutive fbank frames with shift `n` (sherpa ApplyLFR, no pad). */
export function applyLFR(
  feats: Float32Array,
  numFrames: number,
  numBins: number,
  m: number,
  n: number,
): { data: Float32Array; frames: number; dim: number } {
  const dim = numBins * m;
  const frames = numFrames < m ? 0 : Math.floor((numFrames - m) / n) + 1;
  const data = new Float32Array(frames * dim);
  for (let i = 0; i < frames; i++) {
    const inOff = i * n * numBins;
    data.set(feats.subarray(inOff, inOff + dim), i * dim);
  }
  return { data, frames, dim };
}

/** (x + neg_mean) * inv_stddev, row-wise (sherpa ApplyCMVN). In place. */
export function applyCMVN(data: Float32Array, dim: number, negMean: Float32Array, invStddev: Float32Array): void {
  const frames = data.length / dim;
  for (let f = 0; f < frames; f++) {
    const base = f * dim;
    for (let j = 0; j < dim; j++) data[base + j] = (data[base + j] + negMean[j]) * invStddev[j];
  }
}

/**
 * CTC greedy decode: argmax per frame, collapse repeats, drop blank. Returns the
 * emitted token ids plus the frame index each was emitted at (for timestamps).
 */
export function ctcGreedy(
  logits: Float32Array,
  numFrames: number,
  vocab: number,
  blankId: number,
): { tokens: number[]; frames: number[] } {
  const tokens: number[] = [];
  const frames: number[] = [];
  let prev = -1;
  for (let t = 0; t < numFrames; t++) {
    const base = t * vocab;
    let best = 0;
    let bestVal = logits[base];
    for (let v = 1; v < vocab; v++) {
      const val = logits[base + v];
      if (val > bestVal) {
        bestVal = val;
        best = v;
      }
    }
    if (best !== blankId && best !== prev) {
      tokens.push(best);
      frames.push(t);
    }
    prev = best;
  }
  return { tokens, frames };
}

// SenseVoice prepends 4 specials: <lang> <emotion> <event> <itn>.
const SV_LANGS = new Set(["zh", "en", "ja", "ko", "yue"]);
const SV_EMOTIONS = new Set(["HAPPY", "SAD", "ANGRY", "NEUTRAL", "FEARFUL", "DISGUSTED", "SURPRISED"]);
const SV_EVENTS = new Set(["Speech", "BGM", "Applause", "Laughter", "Cry", "Sneeze", "Breath", "Cough"]);

/** Read the special token at `index`, returning its inner tag iff it's in `valid`. */
function specialTag(tokens: number[], table: string[], index: number, valid: Set<string>): string | undefined {
  const m = (table[tokens[index]] ?? "").match(/^<\|([A-Za-z_]+)\|>$/);
  return m && valid.has(m[1]) ? m[1] : undefined;
}

/** Parse the leading `<lang>` special token into a BCP-47-ish code, or undefined. */
export function detectLang(tokens: number[], table: string[]): string | undefined {
  const m = (table[tokens[0]] ?? "").match(/^<\|([a-z]{2,3})\|>$/);
  return m && SV_LANGS.has(m[1]) ? m[1] : undefined;
}

/** Parse the `<emotion>` (2nd) special token, e.g. "HAPPY"; undefined if unknown. */
export function detectEmotion(tokens: number[], table: string[]): string | undefined {
  return specialTag(tokens, table, 1, SV_EMOTIONS);
}

/** Parse the `<event>` (3rd) special token, e.g. "Applause"/"BGM"; undefined if unknown. */
export function detectEvent(tokens: number[], table: string[]): string | undefined {
  return specialTag(tokens, table, 2, SV_EVENTS);
}

/**
 * SenseVoice tokens -> text. The first 4 tokens are <lang> <emotion> <event>
 * <itn> specials; skip them, join the rest, turn the SentencePiece "▁" into a
 * space, and tidy whitespace.
 */
export function detokenize(tokens: number[], table: string[]): string {
  const text = tokens
    .slice(4)
    .map((id) => table[id] ?? "")
    .join("");
  return text.replace(/▁/g, " ").replace(/\s+/g, " ").trim();
}

/** Parse a sherpa tokens.txt ("<sym> <id>" per line) into an id-indexed array. */
export function parseTokens(text: string): string[] {
  const table: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const idx = line.lastIndexOf(" ");
    if (idx < 0) continue;
    const sym = line.slice(0, idx);
    const id = parseInt(line.slice(idx + 1), 10);
    if (Number.isFinite(id)) table[id] = sym;
  }
  return table;
}

// ---------------------------------------------------------------------------
// Model fetch + cache (Cache API; survives reloads, big-blob friendly)
// ---------------------------------------------------------------------------

async function fetchCached(
  url: string,
  onProgress?: (received: number, total: number) => void,
): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer());
      onProgress?.(buf.length, buf.length);
      return buf;
    }
  } catch {
    /* Cache API unavailable (e.g. private mode) — fall back to plain fetch */
  }

  // φ-backoff retry on transient network failure.
  let attempt = 0;
  for (;;) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      const total = Number(resp.headers.get("content-length")) || 0;
      const reader = resp.body?.getReader();
      if (!reader) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        onProgress?.(buf.length, buf.length || total);
        return buf;
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(received, total);
      }
      const buf = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      if (cache) {
        try {
          await cache.put(url, new Response(buf, { headers: { "content-length": String(buf.length) } }));
        } catch {
          /* over quota — keep going without caching */
        }
      }
      return buf;
    } catch (e) {
      attempt += 1;
      if (attempt > 6) throw e;
      await sleep(backoffDelay(attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Engine: one loaded model, reused across sessions and memoized per model id
// ---------------------------------------------------------------------------

class SenseVoiceEngine {
  private constructor(
    private session: any,
    private table: string[],
    private negMean: Float32Array,
    private invStddev: Float32Array,
    private lfrM: number,
    private lfrN: number,
    private blankId: number,
    private withItnId: number,
    private normalizeSamples: boolean,
    private inputNames: string[],
    private outputName: string,
  ) {}

  private static instances = new Map<string, Promise<SenseVoiceEngine>>();

  static load(spec: SenseVoiceModelSpec, onProgress?: (p: LoadProgress) => void): Promise<SenseVoiceEngine> {
    let inst = this.instances.get(spec.id);
    if (!inst) {
      inst = this.build(spec, onProgress).catch((e) => {
        this.instances.delete(spec.id); // allow retry on failure
        throw e;
      });
      this.instances.set(spec.id, inst);
    }
    return inst;
  }

  private static async build(spec: SenseVoiceModelSpec, onProgress?: (p: LoadProgress) => void): Promise<SenseVoiceEngine> {
    const ort: any = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1; // single-thread: no COOP/COEP requirement
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

    const modelBuf = await fetchCached(spec.modelUrl, (received, total) =>
      onProgress?.({ stage: "fetch-model", received, total }),
    );
    onProgress?.({ stage: "fetch-tokens" });
    const tokensBuf = await fetchCached(spec.tokensUrl);
    const table = parseTokens(new TextDecoder().decode(tokensBuf));

    onProgress?.({ stage: "init" });
    const meta = parseOnnxMetadata(modelBuf);
    const negMean = parseFloatList(meta["neg_mean"] ?? "");
    const invStddev = parseFloatList(meta["inv_stddev"] ?? "");
    const lfrM = parseInt(meta["lfr_window_size"] ?? "7", 10);
    const lfrN = parseInt(meta["lfr_window_shift"] ?? "6", 10);
    const blankId = parseInt(meta["blank_id"] ?? "0", 10);
    const withItnId = parseInt(meta["with_itn"] ?? "14", 10);
    const normalizeSamples = (meta["normalize_samples"] ?? "1") !== "0";

    const session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    onProgress?.({ stage: "ready" });
    return new SenseVoiceEngine(
      session,
      table,
      negMean,
      invStddev,
      lfrM,
      lfrN,
      blankId,
      withItnId,
      normalizeSamples,
      session.inputNames,
      session.outputNames[0],
    );
  }

  /** Recognize one utterance of 16k mono float samples in [-1, 1]. */
  async recognize(samples: Float32Array): Promise<SttResult> {
    const ort: any = await import("onnxruntime-web");
    const scale = this.normalizeSamples ? 1 : 32768;
    const input = scale === 1 ? samples : samples.map((s) => s * scale);

    const { feats, numFrames, numBins } = computeFbank(input, SENSEVOICE_FBANK);
    if (numFrames < this.lfrM) return { text: "" };

    const lfr = applyLFR(feats, numFrames, numBins, this.lfrM, this.lfrN);
    if (lfr.frames === 0) return { text: "" };
    applyCMVN(lfr.data, lfr.dim, this.negMean, this.invStddev);

    const feeds: Record<string, any> = {};
    feeds[this.inputNames[0]] = new ort.Tensor("float32", lfr.data, [1, lfr.frames, lfr.dim]);
    feeds[this.inputNames[1]] = new ort.Tensor("int32", Int32Array.from([lfr.frames]), [1]);
    feeds[this.inputNames[2]] = new ort.Tensor("int32", Int32Array.from([0]), [1]); // language=auto
    feeds[this.inputNames[3]] = new ort.Tensor("int32", Int32Array.from([this.withItnId]), [1]);

    const out = await this.session.run(feeds);
    const logits = out[this.outputName];
    const [, t, vocab] = logits.dims as number[];
    const { tokens, frames } = ctcGreedy(logits.data as Float32Array, t, vocab, this.blankId);
    const text = detokenize(tokens, this.table);
    const lang = detectLang(tokens, this.table);
    const emotion = detectEmotion(tokens, this.table);
    const event = detectEvent(tokens, this.table);
    // CTC frames -> ms: each LFR frame advances `lfrN` fbank frames of frameShiftMs.
    // The first 4 tokens are specials (lang/emotion/event/itn); content starts at 4.
    const strideMs = SENSEVOICE_FBANK.frameShiftMs * this.lfrN;
    let startMs: number | undefined;
    let endMs: number | undefined;
    if (tokens.length > 4) {
      startMs = frames[4] * strideMs;
      endMs = (frames[frames.length - 1] + 1) * strideMs;
    }
    return { text, lang, emotion, event, startMs, endMs };
  }
}

/** Kick off (or reuse) a model download+init without starting the mic. */
export function warmSenseVoice(modelId?: string, onProgress?: (p: LoadProgress) => void): Promise<unknown> {
  return SenseVoiceEngine.load(getSenseVoiceModel(modelId), onProgress);
}

// ---------------------------------------------------------------------------
// Mic capture + energy VAD -> SttProvider
// ---------------------------------------------------------------------------

/** Recognize one utterance using the (memoized) engine for a model id. */
export async function sttRecognize(samples: Float32Array, modelId?: string): Promise<SttResult> {
  const engine = await SenseVoiceEngine.load(getSenseVoiceModel(modelId));
  return engine.recognize(samples);
}

export class SenseVoiceSttProvider implements SttProvider {
  readonly id = "sensevoice";
  readonly name = "SenseVoice (in-browser ONNX)";
  constructor(private modelId: string = DEFAULT_SENSEVOICE_MODEL) {}

  isAvailable(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(
    onSegment: (s: SttSegment) => void,
    onError?: (e: Error) => void,
    onLevel?: (l: SttLevel) => void,
  ): Promise<SttSession> {
    let engine: SenseVoiceEngine;
    try {
      engine = (await SenseVoiceEngine.load(getSenseVoiceModel(this.modelId))) as SenseVoiceEngine;
    } catch (e: any) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }

    let recogChain: Promise<void> = Promise.resolve();
    const handle = await startMicVad({
      onLevel: (l) => onLevel?.(l),
      onSpeechStart: () => onSegment({ text: "…", final: false }),
      onSegment: (samples, durationMs) => {
        onSegment({ text: "", final: false }); // clear interim marker
        const audio = { samples, sampleRate: MIC_VAD_SR, durationMs };
        recogChain = recogChain.then(async () => {
          try {
            const { text } = await engine.recognize(samples);
            onSegment({ text, final: true, audio });
          } catch (e: any) {
            onSegment({ text: "", final: true, audio });
            onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        });
      },
    });

    return {
      sendAudio() {
        /* self-capturing; not used */
      },
      stop: async () => {
        await handle.stop();
        await recogChain;
      },
    };
  }
}

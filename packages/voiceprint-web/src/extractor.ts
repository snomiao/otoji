import { speakerFeatures } from "./features";
import { createWasmSession } from "./ort";
import {
  DIMENSIONS,
  MAX_AUDIO_MS,
  SAMPLE_RATE,
  VoiceprintError,
  type ExtractorDependencies,
  type ExtractorOptions,
  type VoiceprintExtractor,
  type VoiceprintSession,
} from "./types";

function secureUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new VoiceprintError("config");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new VoiceprintError("config");
  return url;
}

export function validateOptions(options: ExtractorOptions): ExtractorOptions {
  const model = { ...options.model };
  const url = secureUrl(model.url),
    wasm = secureUrl(options.wasmBaseUrl);
  if (
    url.origin !== wasm.origin ||
    !wasm.pathname.endsWith("/") ||
    !/^[a-zA-Z0-9._-]{1,120}$/.test(model.id) ||
    !/^[0-9a-f]{64}$/.test(model.sha256) ||
    !Number.isSafeInteger(model.bytes) ||
    model.bytes < 1 ||
    model.bytes > 40 * 1024 * 1024 ||
    model.precision !== "fp32" ||
    !Number.isFinite(options.minAudioMs ?? 1200) ||
    (options.minAudioMs ?? 1200) < 25 ||
    (options.minAudioMs ?? 1200) > MAX_AUDIO_MS
  )
    throw new VoiceprintError("config");
  return { model, wasmBaseUrl: wasm.href, minAudioMs: options.minAudioMs ?? 1200 };
}

async function verifiedModel(
  options: ExtractorOptions,
  request: typeof fetch,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await request(options.model.url, {
    credentials: "omit",
    redirect: "error",
    cache: "force-cache",
    signal,
  });
  if (!response.ok) throw new VoiceprintError("artifact");
  const expected = options.model.bytes;
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > expected))
    throw new VoiceprintError("artifact");
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceprintError("artifact");
  const bytes = new Uint8Array(expected);
  let at = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (at + value.length > expected) {
        await reader.cancel();
        throw new VoiceprintError("artifact");
      }
      bytes.set(value, at);
      at += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (at !== expected) throw new VoiceprintError("artifact");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("") !== options.model.sha256)
    throw new VoiceprintError("artifact");
  return bytes;
}

/** No capture, uploads, account APIs or storage. The result can only be advisory. */
export function createVoiceprintExtractor(
  input: ExtractorOptions,
  deps: ExtractorDependencies = {},
): VoiceprintExtractor {
  const options = validateOptions(input);
  const abort = new AbortController();
  let closed = false,
    busy = false;
  let session: VoiceprintSession | null = null;
  let loading: Promise<void> | null = null;
  let pending: Promise<unknown> | null = null;
  return {
    async warm(consent) {
      if (closed) throw new VoiceprintError("closed");
      if (consent !== true) throw new VoiceprintError("consent");
      if (session) return;
      if (!loading)
        loading = (async () => {
          const bytes = await verifiedModel(options, deps.fetch ?? fetch, abort.signal);
          if (closed) throw new VoiceprintError("closed");
          const loaded = await (deps.createSession ?? createWasmSession)(
            bytes,
            options.wasmBaseUrl,
          );
          if (closed) {
            await loaded.release();
            throw new VoiceprintError("closed");
          }
          session = loaded;
        })().catch((error) => {
          loading = null;
          throw error instanceof VoiceprintError ? error : new VoiceprintError("unavailable");
        });
      return loading;
    },
    async extract(samples, signal) {
      if (closed) throw new VoiceprintError("closed");
      if (!session) throw new VoiceprintError("not-ready");
      if (busy) throw new VoiceprintError("busy");
      if (signal?.aborted) throw new VoiceprintError("aborted");
      if (!(samples instanceof Float32Array)) throw new VoiceprintError("audio");
      const ms = (samples.length * 1000) / SAMPLE_RATE;
      if (
        ms < options.minAudioMs! ||
        ms > MAX_AUDIO_MS ||
        samples.some((n) => !Number.isFinite(n) || Math.abs(n) > 1)
      )
        throw new VoiceprintError("audio");
      busy = true;
      const work = (async () => {
        const features = speakerFeatures(samples);
        try {
          const value = await session!.run(features.data, features.frames);
          if (closed || signal?.aborted) throw new VoiceprintError(closed ? "closed" : "aborted");
          if (value.length !== DIMENSIONS || value.some((n) => !Number.isFinite(n)))
            throw new VoiceprintError("artifact");
          const norm = Math.hypot(...value);
          if (!Number.isFinite(norm) || norm === 0) throw new VoiceprintError("artifact");
          return {
            v: 1 as const,
            trust: "device" as const,
            model: options.model.id,
            dimension: 192 as const,
            audioMs: ms,
            embedding: Float32Array.from(value, (n) => n / norm),
          };
        } finally {
          features.data.fill(0);
        }
      })();
      pending = work;
      try {
        return await work;
      } catch (error) {
        throw error instanceof VoiceprintError ? error : new VoiceprintError("unavailable");
      } finally {
        busy = false;
        pending = null;
      }
    },
    async dispose() {
      closed = true;
      abort.abort();
      await loading?.catch(() => {});
      await pending?.catch(() => {});
      const current = session;
      session = null;
      await current?.release();
    },
  };
}

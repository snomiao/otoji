import { createVoiceprintExtractor } from "./extractor";
import {
  MAX_AUDIO_MS,
  SAMPLE_RATE,
  VoiceprintError,
  type DeviceEmbedding,
  type ErrorCode,
  type ExtractorDependencies,
  type ExtractorOptions,
  type VoiceprintExtractor,
} from "./types";

export interface VoiceprintWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
const codes: readonly ErrorCode[] = [
  "consent",
  "config",
  "artifact",
  "unavailable",
  "not-ready",
  "closed",
  "busy",
  "audio",
  "aborted",
];

/** Call inside a dedicated application-owned module Worker. No handlers on window. */
export function installVoiceprintWorker(
  scope: VoiceprintWorkerScope,
  deps: ExtractorDependencies = {},
) {
  let extractor: VoiceprintExtractor | null = null,
    busy = false,
    closed = false;
  const receive = (event: MessageEvent) => {
    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      !Number.isSafeInteger(message.id) ||
      message.id < 1
    )
      return;
    const id = message.id;
    const fail = (code: ErrorCode) => scope.postMessage({ id, ok: false, error: code });
    if (closed) {
      fail("closed");
      return;
    }
    if (busy) {
      fail("busy");
      return;
    }
    busy = true;
    void (async () => {
      if (message.kind === "warm") {
        if (message.consent !== true) throw new VoiceprintError("consent");
        // A running worker keeps one model/config; use a new worker to switch.
        if (!extractor) extractor = createVoiceprintExtractor(message.options, deps);
        await extractor.warm(true);
        if (!closed) scope.postMessage({ id, ok: true });
      } else if (message.kind === "extract") {
        if (!extractor) throw new VoiceprintError("not-ready");
        if (
          !(message.samples instanceof ArrayBuffer) ||
          message.samples.byteLength % 4 ||
          message.samples.byteLength > ((SAMPLE_RATE * MAX_AUDIO_MS) / 1000) * 4
        )
          throw new VoiceprintError("audio");
        const pcm = new Float32Array(message.samples);
        try {
          const result = await extractor.extract(pcm);
          if (!closed) scope.postMessage({ id, ok: true, result }, [result.embedding.buffer]);
        } finally {
          pcm.fill(0);
        }
      } else throw new VoiceprintError("config");
    })()
      .catch((error) => {
        if (!closed) fail(error instanceof VoiceprintError ? error.code : "unavailable");
      })
      .finally(() => {
        busy = false;
      });
  };
  scope.addEventListener("message", receive);
  return async () => {
    closed = true;
    scope.removeEventListener("message", receive);
    await extractor?.dispose();
    extractor = null;
  };
}

export interface VoiceprintWorkerClient {
  warm(options: ExtractorOptions, consent: boolean): Promise<void>;
  extract(samples: Float32Array, signal?: AbortSignal): Promise<DeviceEmbedding>;
  dispose(): void;
}

/** The client owns this dedicated Worker. PCM is copied before transfer so the
 * same utterance can still feed transcription. No audio crosses a network. */
export function createVoiceprintWorkerClient(worker: Worker): VoiceprintWorkerClient {
  let closed = false,
    nextId = 0;
  type Pending = {
    resolve(value: unknown): void;
    reject(error: Error): void;
    finish(): void;
    cancel(): void;
  };
  const pending = new Map<number, Pending>();
  const receive = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id);
    call.finish();
    if (data.ok === true) call.resolve(data.result);
    else call.reject(new VoiceprintError(codes.includes(data.error) ? data.error : "unavailable"));
  };
  const failed = () => {
    for (const call of pending.values()) {
      call.finish();
      call.reject(new VoiceprintError("unavailable"));
    }
    pending.clear();
  };
  worker.addEventListener("message", receive);
  worker.addEventListener("error", failed);
  worker.addEventListener("messageerror", failed);
  const request = (
    kind: "warm" | "extract",
    value: Record<string, unknown>,
    transfer: Transferable[] = [],
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (closed) return Promise.reject(new VoiceprintError("closed"));
    if (signal?.aborted) return Promise.reject(new VoiceprintError("aborted"));
    if (pending.size) return Promise.reject(new VoiceprintError("busy"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        signal?.removeEventListener("abort", cancel);
        reject(new VoiceprintError("aborted"));
      };
      const timer = setTimeout(
        () => {
          const call = pending.get(id);
          if (!call) return;
          pending.delete(id);
          call.finish();
          reject(new VoiceprintError("unavailable"));
        },
        kind === "warm" ? 120000 : 30000,
      );
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      };
      pending.set(id, { resolve, reject, finish, cancel });
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        worker.postMessage({ id, kind, ...value }, transfer);
      } catch {
        pending.delete(id);
        finish();
        reject(new VoiceprintError("unavailable"));
      }
    });
  };
  return {
    async warm(options, consent) {
      await request("warm", { options, consent });
    },
    async extract(samples, signal) {
      if (
        !(samples instanceof Float32Array) ||
        samples.byteLength > ((SAMPLE_RATE * MAX_AUDIO_MS) / 1000) * 4
      )
        throw new VoiceprintError("audio");
      const owned = samples.slice();
      const result = (await request(
        "extract",
        { samples: owned.buffer },
        [owned.buffer],
        signal,
      )) as DeviceEmbedding;
      if (
        !result ||
        result.v !== 1 ||
        result.trust !== "device" ||
        result.dimension !== 192 ||
        typeof result.model !== "string" ||
        !/^[a-zA-Z0-9._-]{1,120}$/.test(result.model) ||
        !Number.isFinite(result.audioMs) ||
        result.audioMs < 0 ||
        result.audioMs > MAX_AUDIO_MS ||
        !(result.embedding instanceof Float32Array) ||
        result.embedding.length !== 192 ||
        result.embedding.some((n) => !Number.isFinite(n)) ||
        Math.abs(Math.hypot(...result.embedding) - 1) > 0.001
      )
        throw new VoiceprintError("artifact");
      return result;
    },
    dispose() {
      if (closed) return;
      closed = true;
      worker.removeEventListener("message", receive);
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", failed);
      for (const call of pending.values()) {
        call.finish();
        call.reject(new VoiceprintError("closed"));
      }
      pending.clear();
      worker.terminate();
    },
  };
}

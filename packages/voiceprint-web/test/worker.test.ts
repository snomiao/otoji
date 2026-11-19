import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceprintWorkerClient,
  installVoiceprintWorker,
  type VoiceprintWorkerScope,
} from "../src/worker";
import type { ExtractorOptions } from "../src/types";

const options: ExtractorOptions = {
  model: {
    id: "test-campp",
    precision: "fp32",
    bytes: 3,
    sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    url: "https://app.example.test/model.onnx",
  },
  wasmBaseUrl: "https://app.example.test/ort/",
  minAudioMs: 25,
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function ports() {
  const listeners = new Map<string, Set<(e: MessageEvent) => void>>();
  let receive: ((e: MessageEvent) => void) | undefined;
  const seen: any[] = [];
  const worker = {
    addEventListener(type: string, fn: (e: MessageEvent) => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: (e: MessageEvent) => void) {
      listeners.get(type)?.delete(fn);
    },
    postMessage(message: unknown, transfer: Transferable[]) {
      const data = structuredClone(message, { transfer });
      seen.push(data);
      queueMicrotask(() => receive?.({ data } as MessageEvent));
    },
    terminate: vi.fn(),
  } as unknown as Worker;
  const emit = (data: unknown) => {
    for (const fn of listeners.get("message") ?? []) fn({ data } as MessageEvent);
  };
  const scope: VoiceprintWorkerScope = {
    addEventListener(_type, fn) {
      receive = fn;
    },
    removeEventListener() {
      receive = undefined;
    },
    postMessage(message, transfer = []) {
      const data = structuredClone(message, { transfer });
      queueMicrotask(() => emit(data));
    },
  };
  return { worker, scope, seen, emit, listeners };
}
afterEach(() => vi.useRealTimers());

describe("dedicated Worker boundary", () => {
  it("requires consent, copies caller PCM before transfer, and erases worker PCM after inference", async () => {
    const p = ports(),
      request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
    const release = vi.fn(async () => {});
    const stop = installVoiceprintWorker(p.scope, {
      fetch: request,
      createSession: async () => ({ run: async () => new Float32Array(192).fill(1), release }),
    });
    const client = createVoiceprintWorkerClient(p.worker);
    await expect(client.warm(options, false)).rejects.toMatchObject({ code: "consent" });
    expect(request).not.toHaveBeenCalled();
    await client.warm(options, true);
    const pcm = new Float32Array(800).fill(0.1),
      saved = pcm.slice();
    const result = await client.extract(pcm);
    expect(result.trust).toBe("device");
    expect(Math.hypot(...result.embedding)).toBeCloseTo(1, 6);
    expect(pcm).toEqual(saved);
    expect(pcm.byteLength).toBe(3200);
    const transferred = p.seen.find((x) => x.kind === "extract").samples;
    expect(new Float32Array(transferred).every((x) => x === 0)).toBe(true);
    client.dispose();
    await stop();
    expect(release).toHaveBeenCalledOnce();
    expect(p.worker.terminate).toHaveBeenCalledOnce();
  });
  it("aborts the caller promptly but prevents another inference until the previous result is discarded", async () => {
    const p = ports(),
      inference = deferred<Float32Array>();
    const stop = installVoiceprintWorker(p.scope, {
      fetch: async () => new Response(new Uint8Array([1, 2, 3])),
      createSession: async () => ({ run: () => inference.promise, release: async () => {} }),
    });
    const client = createVoiceprintWorkerClient(p.worker);
    await client.warm(options, true);
    const controller = new AbortController(),
      running = client.extract(new Float32Array(800), controller.signal);
    await flush();
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "aborted" });
    await expect(client.extract(new Float32Array(800))).rejects.toMatchObject({ code: "busy" });
    inference.resolve(new Float32Array(192).fill(1));
    await flush();
    client.dispose();
    await stop();
    expect([...p.listeners.values()].every((x) => x.size === 0)).toBe(true);
  });
  it("rejects unready calls and sanitizes unexpected Worker error codes", async () => {
    const p = ports(),
      stop = installVoiceprintWorker(p.scope),
      client = createVoiceprintWorkerClient(p.worker);
    await expect(client.extract(new Float32Array(800))).rejects.toMatchObject({
      code: "not-ready",
    });
    await stop();
    const pending = client.warm(options, true);
    const id = p.seen.at(-1).id;
    p.emit({ id, ok: false, error: "private upstream payload" });
    await expect(pending).rejects.toThrow(/^Voiceprint unavailable\.$/);
    client.dispose();
  });
  it("bounds a non-responsive worker and removes listeners when disposed", async () => {
    vi.useFakeTimers();
    const p = ports(),
      client = createVoiceprintWorkerClient(p.worker);
    const pending = client.warm(options, true);
    const rejected = expect(pending).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    client.dispose();
    await expect(client.warm(options, true)).rejects.toMatchObject({ code: "closed" });
    expect([...p.listeners.values()].every((x) => x.size === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

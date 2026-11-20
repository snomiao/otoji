import { describe, expect, it, vi } from "vitest";
import { createVoiceprintExtractor, validateOptions } from "../src/extractor";
import type { ExtractorOptions, VoiceprintSession } from "../src/types";

const bytes = new Uint8Array([1, 2, 3]);
const hash = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
const options = (): ExtractorOptions => ({
  model: {
    id: "test-campp",
    url: "https://app.example.test/models/campp.onnx",
    sha256: hash,
    bytes: 3,
    precision: "fp32",
  },
  wasmBaseUrl: "https://app.example.test/ort/",
  minAudioMs: 25,
});
const audio = () => Float32Array.from({ length: 800 }, (_, i) => Math.sin(i / 9) * 0.2);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
function fixture() {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(bytes));
  const session: VoiceprintSession = {
    run: vi.fn(async () => new Float32Array(192).fill(1)),
    release: vi.fn(async () => {}),
  };
  const createSession = vi.fn(async () => session);
  const extractor = createVoiceprintExtractor(options(), { fetch: request, createSession });
  return { extractor, request, session, createSession };
}

describe("consent-gated advisory extractor", () => {
  it("does nothing on construction and rejects extraction/download without consent", async () => {
    const h = fixture();
    expect(h.request).not.toHaveBeenCalled();
    await expect(h.extractor.extract(audio())).rejects.toMatchObject({ code: "not-ready" });
    await expect(h.extractor.warm(false)).rejects.toMatchObject({ code: "consent" });
    expect(h.request).not.toHaveBeenCalled();
    await h.extractor.dispose();
  });
  it("downloads only the configured resource once, checks its digest, and returns normalized device-only data", async () => {
    const h = fixture();
    await Promise.all([h.extractor.warm(true), h.extractor.warm(true)]);
    expect(h.request).toHaveBeenCalledOnce();
    expect(h.request).toHaveBeenCalledWith(
      options().model.url,
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(h.createSession).toHaveBeenCalledWith(bytes, options().wasmBaseUrl);
    const pcm = audio(),
      saved = pcm.slice();
    const result = await h.extractor.extract(pcm);
    expect(result).toMatchObject({
      v: 1,
      trust: "device",
      model: "test-campp",
      dimension: 192,
      audioMs: 50,
    });
    expect(Math.hypot(...result.embedding)).toBeCloseTo(1, 6);
    expect(result).not.toHaveProperty("proof");
    expect(result).not.toHaveProperty("decision");
    expect(pcm).toEqual(saved);
    await h.extractor.dispose();
    expect(h.session.release).toHaveBeenCalledOnce();
  });
  it.each([{ bytes: 4 }, { sha256: "0".repeat(64) }])(
    "does not initialize a model whose byte length or digest differs from its manifest",
    async (patch) => {
      const o = options();
      Object.assign(o.model, patch);
      const createSession = vi.fn();
      const e = createVoiceprintExtractor(o, {
        fetch: async () => new Response(bytes),
        createSession,
      });
      await expect(e.warm(true)).rejects.toMatchObject({ code: "artifact" });
      expect(createSession).not.toHaveBeenCalled();
      await e.dispose();
    },
  );
  it("cancels an oversized model stream immediately", async () => {
    const cancel = vi.fn();
    const e = createVoiceprintExtractor(options(), {
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(4));
            },
            cancel,
          }),
        ),
    });
    await expect(e.warm(true)).rejects.toMatchObject({ code: "artifact" });
    expect(cancel).toHaveBeenCalledOnce();
    await e.dispose();
  });
  it("rejects invalid, short and overlong PCM before inference", async () => {
    const h = fixture();
    await h.extractor.warm(true);
    for (const pcm of [
      new Float32Array(399),
      new Float32Array(480001),
      new Float32Array(800).fill(NaN),
      new Float32Array(800).fill(2),
    ]) {
      await expect(h.extractor.extract(pcm)).rejects.toMatchObject({ code: "audio" });
    }
    expect(h.session.run).not.toHaveBeenCalled();
    await h.extractor.dispose();
  });
  it("rejects concurrent inference and discards an aborted result while clearing feature memory", async () => {
    const h = fixture(),
      result = deferred<Float32Array>();
    let features!: Float32Array;
    vi.mocked(h.session.run).mockImplementation(async (data) => {
      features = data;
      return result.promise;
    });
    await h.extractor.warm(true);
    const controller = new AbortController();
    const running = h.extractor.extract(audio(), controller.signal);
    await expect(h.extractor.extract(audio())).rejects.toMatchObject({ code: "busy" });
    controller.abort();
    result.resolve(new Float32Array(192).fill(1));
    await expect(running).rejects.toMatchObject({ code: "aborted" });
    expect(features.every((x) => x === 0)).toBe(true);
    await h.extractor.dispose();
  });
  it("dispose waits for active inference and releases once without returning a late embedding", async () => {
    const h = fixture(),
      result = deferred<Float32Array>();
    vi.mocked(h.session.run).mockReturnValue(result.promise);
    await h.extractor.warm(true);
    const running = h.extractor.extract(audio());
    const stopped = h.extractor.dispose();
    expect(h.session.release).not.toHaveBeenCalled();
    result.resolve(new Float32Array(192).fill(1));
    await expect(running).rejects.toMatchObject({ code: "closed" });
    await stopped;
    await h.extractor.dispose();
    expect(h.session.release).toHaveBeenCalledOnce();
    await expect(h.extractor.warm(true)).rejects.toMatchObject({ code: "closed" });
  });
  it.each([new Float32Array(191), new Float32Array(192), new Float32Array(192).fill(Infinity)])(
    "rejects unusable model outputs",
    async (vector) => {
      const h = fixture();
      vi.mocked(h.session.run).mockResolvedValue(vector);
      await h.extractor.warm(true);
      await expect(h.extractor.extract(audio())).rejects.toMatchObject({ code: "artifact" });
      await h.extractor.dispose();
    },
  );
  it("sanitizes engine/transport errors without automatic retry", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private credential and payload"));
    const e = createVoiceprintExtractor(options(), { fetch: request });
    await expect(e.warm(true)).rejects.toThrow(/^Voiceprint unavailable\.$/);
    expect(request).toHaveBeenCalledOnce();
    await e.dispose();
  });
});

describe("consumer-owned assets", () => {
  it.each([
    "http://remote.example.test/models/campp.onnx",
    "https://user:secret@app.example.test/model",
    "https://app.example.test/model?token=private",
    "https://app.example.test/model#fragment",
  ])("rejects unsafe resource URLs: %s", (url) => {
    const o = options();
    o.model.url = url;
    expect(() => validateOptions(o)).toThrow("Voiceprint config.");
  });
  it("requires the model and WASM assets on the same explicitly configured origin", () => {
    const o = options();
    o.wasmBaseUrl = "https://cdn.example.test/ort/";
    expect(() => validateOptions(o)).toThrow("Voiceprint config.");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { modelSourceToText, resolveModelSource, searchModelSources, searchWebLlmCatalog, webLlmModelSource } from "../providers/model/model-source";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("resolveModelSource", () => {
  it("resolves a Hugging Face URL and selects a model artifact", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      modelId: "Qwen/Qwen-Image-2512",
      pipeline_tag: "text-to-image",
      siblings: [
        { rfilename: "README.md" },
        { rfilename: "transformer/model.safetensors" },
      ],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveModelSource({
      provider: "huggingface",
      ref: "https://huggingface.co/Qwen/Qwen-Image-2512",
    });

    const resolveUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(resolveUrl).toContain("https://huggingface.co/api/models/Qwen/Qwen-Image-2512?");
    expect(resolveUrl).toContain("expand%5B%5D=config");
    expect(resolveUrl).toContain("expand%5B%5D=siblings");
    expect(result).toMatchObject({
      provider: "huggingface",
      id: "Qwen/Qwen-Image-2512",
      model: "Qwen/Qwen-Image-2512",
      kind: "text-to-image",
      url: "https://huggingface.co/Qwen/Qwen-Image-2512/resolve/main/transformer/model.safetensors",
      compatibility: { formats: ["safetensors"], runtimes: ["diffusers"], tasks: ["text-to-image", "image"], basis: "inferred" },
    });
  });

  it("resolves a Civitai version URL and preserves runner metadata", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 456,
      name: "Illustration v2",
      baseModel: "SDXL 1.0",
      trainedWords: ["otoji style"],
      files: [
        { name: "preview.png", downloadUrl: "https://example.test/preview.png", type: "Image" },
        { name: "illustration.safetensors", downloadUrl: "https://example.test/model", type: "Model", primary: true },
      ],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveModelSource({
      provider: "civitai",
      ref: "https://civitai.com/models/123/example?modelVersionId=456",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://civitai.com/api/v1/model-versions/456");
    expect(result).toMatchObject({
      provider: "civitai",
      id: "456",
      model: "https://example.test/model",
      url: "https://example.test/model",
      baseModel: "SDXL 1.0",
      triggerWords: ["otoji style"],
    });
    expect(modelSourceToText(result)).toContain("triggers=otoji style");
  });

  it("passes a direct artifact URL through without fetching", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await resolveModelSource({
      provider: "url",
      ref: "https://models.example.test/otoji.gguf",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: "url",
      model: "https://models.example.test/otoji.gguf",
      url: "https://models.example.test/otoji.gguf",
      files: [{ name: "otoji.gguf", format: "gguf", primary: true }],
      compatibility: { formats: ["gguf"], runtimes: ["llama.cpp"], basis: "inferred" },
    });
  });

  it("reports provider errors with the response status", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

    await expect(resolveModelSource({ provider: "huggingface", ref: "missing/model" }))
      .rejects.toThrow("Hugging Face returned 404");
  });
});

describe("searchModelSources", () => {
  it("searches the WebLLM catalog and emits browser-compatible ModelRef metadata", () => {
    const catalog = [
      { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC · ~300 MB VRAM", keywords: "qwen webgpu" },
      { id: "Llama-3-small-MLC", label: "Llama-3-small-MLC", keywords: "llama webgpu" },
    ];
    expect(searchWebLlmCatalog(catalog, "qwen 0.5b", 8, { runtime: "browser", task: "text", format: "mlc" })).toEqual([{
      provider: "webllm",
      id: catalog[0]!.id,
      ref: catalog[0]!.id,
      title: catalog[0]!.id,
      detail: `${catalog[0]!.label} · WebGPU`,
      compatibility: { formats: ["mlc"], runtimes: ["browser"], tasks: ["text"], basis: "inferred" },
    }]);
    expect(webLlmModelSource(catalog[0]!)).toMatchObject({
      provider: "webllm",
      model: catalog[0]!.id,
      kind: "text-generation",
      compatibility: { formats: ["mlc"], runtimes: ["browser"], tasks: ["text"] },
    });
  });

  it("filters WebLLM models out of incompatible runtime searches", () => {
    expect(searchWebLlmCatalog([{ id: "Qwen-MLC", label: "Qwen-MLC" }], "qwen", 8, { runtime: "llama.cpp" })).toEqual([]);
  });

  it("searches Hugging Face and returns compact model choices", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([
      { modelId: "Qwen/Qwen-Image-2512", pipeline_tag: "text-to-image", downloads: 1200000, likes: 321 },
    ]), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const results = await searchModelSources("huggingface", "qwen image", { limit: 5 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("search=qwen+image");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("limit=20");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("full=true");
    expect(results).toEqual([{
      provider: "huggingface",
      id: "Qwen/Qwen-Image-2512",
      ref: "Qwen/Qwen-Image-2512",
      title: "Qwen/Qwen-Image-2512",
      detail: "text-to-image · 1.2M downloads · 321 likes",
      compatibility: { formats: [], runtimes: [], tasks: ["text-to-image", "image"], basis: "inferred" },
    }]);
  });

  it("searches Civitai and pins the selected model version in its ref", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      items: [{
        id: 123,
        name: "Illustration XL",
        type: "Checkpoint",
        stats: { downloadCount: 98765 },
        modelVersions: [{ id: 456, baseModel: "SDXL 1.0" }],
      }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const results = await searchModelSources("civitai", "illustration");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("query=illustration");
    expect(results[0]).toEqual({
      provider: "civitai",
      id: "123",
      ref: "https://civitai.com/models/123?modelVersionId=456",
      title: "Illustration XL",
      detail: "Checkpoint · SDXL 1.0 · 98.8K downloads",
      compatibility: { formats: [], runtimes: [], tasks: ["image"], basis: "inferred" },
    });
  });

  it("filters generic checkpoints out of browser-runtime searches", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gemma-4-E4B-it-ONNX?")) return new Response(JSON.stringify({
        config: { model_type: "gemma4" },
        siblings: [{ rfilename: "onnx/model_q4.onnx" }],
      }), { status: 200 });
      if (url.includes("gemma-3-1b-it-ONNX?")) return new Response(JSON.stringify({
        config: { model_type: "gemma3_text" },
        siblings: [{ rfilename: "onnx/model_q4.onnx" }],
      }), { status: 200 });
      return new Response(JSON.stringify([
        {
          modelId: "onnx-community/gemma-4-E4B-it-ONNX",
          pipeline_tag: "text-generation",
          siblings: [{ rfilename: "onnx/model_q4.onnx" }],
        },
        {
          modelId: "onnx-community/gemma-3-1b-it-ONNX",
          pipeline_tag: "text-generation",
          siblings: [{ rfilename: "onnx/model_q4.onnx" }],
        },
      ]), { status: 200 });
    }) as unknown as typeof fetch;

    const results = await searchModelSources("huggingface", "gemma", {
      filters: { runtime: "browser", task: "text" },
    });

    expect(results.map((result) => result.id)).toEqual(["onnx-community/gemma-3-1b-it-ONNX"]);
    expect(results[0]?.compatibility).toMatchObject({ formats: ["onnx"], runtimes: ["browser"], tasks: ["text"] });
  });

  it("marks unsupported browser architectures when resolving a direct model id", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      modelId: "onnx-community/gemma-4-E4B-it-ONNX",
      config: { model_type: "gemma4" },
      siblings: [{ rfilename: "onnx/model_q4.onnx" }],
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await resolveModelSource({ provider: "huggingface", ref: "onnx-community/gemma-4-E4B-it-ONNX" });

    expect(result.compatibility).toMatchObject({
      formats: ["onnx"],
      runtimes: [],
      issues: ["Transformers.js 4.2 does not support model type gemma4"],
    });
  });

  it("rejects Gemma 4 architecture variants for the browser runtime", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      modelId: "example/gemma-4-text-ONNX",
      config: { model_type: "gemma4_text" },
      siblings: [{ rfilename: "onnx/model_q4.onnx" }],
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await resolveModelSource({ provider: "huggingface", ref: "example/gemma-4-text-ONNX" });

    expect(result.compatibility?.runtimes).not.toContain("browser");
    expect(result.compatibility?.issues).toEqual(["Transformers.js 4.2 does not support model type gemma4_text"]);
  });

  it("does not search direct URLs or blank queries", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await searchModelSources("url", "https://example.test/model.gguf")).toEqual([]);
    expect(await searchModelSources("huggingface", "  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

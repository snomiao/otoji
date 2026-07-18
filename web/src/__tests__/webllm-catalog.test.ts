import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSLATE_PROMPT_TEMPLATE, renderTranslatePrompt, webLlmModelOptionsFromConfig } from "../providers/translate/webllm";

describe("WebLLM model catalog", () => {
  it("maps and deduplicates every prebuilt model record", () => {
    const options = webLlmModelOptionsFromConfig({
      model_list: [
        { model_id: "Qwen-small", model: "https://example.test/qwen", estimated_vram_bytes: 300 * 1024 * 1024, required_features: ["shader-f16"] },
        { model_id: "Qwen-small", model: "https://example.test/duplicate" },
        { model_id: "Llama-small", model_lib: "https://example.test/model.wasm" },
        { model_id: "" },
      ],
    });
    expect(options).toEqual([
      { id: "Qwen-small", label: "Qwen-small · ~300 MB VRAM", keywords: "https://example.test/qwen shader-f16" },
      { id: "Llama-small", label: "Llama-small", keywords: "https://example.test/model.wasm" },
    ]);
  });
});

describe("WebLLM translation prompt", () => {
  it("renders all translation placeholders", () => {
    expect(renderTranslatePrompt(
      "Convert {source_language} to {target_language}: {text}",
      { text: "hello", sourceLanguage: "English", targetLanguage: "Japanese" },
    )).toBe("Convert English to Japanese: hello");
  });

  it("uses the default and never drops source text when a custom template omits {text}", () => {
    const values = { text: "hello", sourceLanguage: "English", targetLanguage: "Japanese" };
    expect(renderTranslatePrompt(undefined, values)).toContain("Text:\nhello");
    expect(renderTranslatePrompt("Translate into {target_language}.", values)).toBe("Translate into Japanese.\n\nText:\nhello");
    expect(DEFAULT_TRANSLATE_PROMPT_TEMPLATE).toContain("{text}");
  });
});

import type { TranslateLoadProgress, TranslateProvider } from "../types";
import { DEFAULT_TRANSLATE_MODEL, codeToLangName } from "./translate-config";
import { disposeMemo } from "../dispose-util";

// In-browser LLM translation via WebLLM (https://github.com/mlc-ai/web-llm).
// Runs a quantized instruct model entirely on-device over WebGPU — no audio or
// text ever leaves the browser. The library + model weights are fetched lazily
// from the MLC CDN (esm.run) only when a translate node is actually used, so the
// app bundle carries no extra weight when the feature is unused.

// Hide the URL specifier from Vite's bundler/optimizer (same trick the
// transformers.js STT fallback uses) so it stays a runtime dynamic import.
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";
const importWebLLM = () =>
  (new Function("u", "return import(u)")(WEBLLM_URL) as Promise<any>);

function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** One engine per model id; engine creation is heavy, so we cache + dedupe. */
const engines = new Map<string, Promise<any>>();

async function getEngine(modelId: string, onProgress?: (p: TranslateLoadProgress) => void): Promise<any> {
  let p = engines.get(modelId);
  if (!p) {
    p = (async () => {
      const webllm = await importWebLLM();
      return webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (r: { progress?: number; text?: string }) =>
          onProgress?.({ progress: r.progress, text: r.text }),
      });
    })().catch((e) => {
      // Don't cache a failed init — let a later attempt retry the download.
      engines.delete(modelId);
      throw e;
    });
    engines.set(modelId, p);
  }
  return p;
}

export class WebLLMTranslateProvider implements TranslateProvider {
  readonly id = "webllm";
  readonly name = "In-browser LLM (WebLLM)";

  isAvailable(): boolean {
    return webgpuAvailable();
  }

  async warm(modelId = DEFAULT_TRANSLATE_MODEL, onProgress?: (p: TranslateLoadProgress) => void): Promise<void> {
    if (!webgpuAvailable()) {
      throw new Error("WebGPU not available — the in-browser translate model needs a WebGPU-capable browser.");
    }
    await getEngine(modelId, onProgress);
  }

  async translate(text: string, targetLang: string, modelId = DEFAULT_TRANSLATE_MODEL, sourceLang?: string): Promise<string> {
    const src = text.trim();
    if (!src) return "";
    const engine = await getEngine(modelId);
    const srcName = sourceLang ? codeToLangName(sourceLang) : null;
    const reply = await engine.chat.completions.create({
      // temperature 0 → deterministic; we want a faithful translation, not prose.
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            `You are a translation engine. Translate the user's text` +
            (srcName ? ` from ${srcName}` : "") +
            ` into ${targetLang}. ` +
            `Output ONLY the translation, with no quotes, notes, or explanations. ` +
            `If the text is already in ${targetLang}, return it unchanged.`,
        },
        { role: "user", content: src },
      ],
    });
    return (reply.choices?.[0]?.message?.content ?? "").trim();
  }
}

export const webllmTranslate = new WebLLMTranslateProvider();

/** Free all WebLLM engines (the last LLM-translate node left the graph). */
export const disposeWebllm = () => disposeMemo(engines, ["unload"]);

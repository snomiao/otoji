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

export interface WebLlmModelOption {
  id: string;
  label: string;
  keywords?: string;
}

export const DEFAULT_TRANSLATE_PROMPT_TEMPLATE = `Translate the following text from {source_language} into {target_language}.
Output only the translation, with no quotes, notes, or explanations.
If the text is already in {target_language}, return it unchanged.

Text:
{text}`;

export function renderTranslatePrompt(
  template: string | undefined,
  values: { text: string; sourceLanguage: string; targetLanguage: string },
): string {
  const source = template?.trim() || DEFAULT_TRANSLATE_PROMPT_TEMPLATE;
  const includesText = source.includes("{text}");
  const rendered = source
    .split("{source_language}").join(values.sourceLanguage)
    .split("{target_language}").join(values.targetLanguage)
    .split("{text}").join(values.text);
  return includesText ? rendered : `${rendered}\n\nText:\n${values.text}`;
}

export function webLlmModelOptionsFromConfig(config: any): WebLlmModelOption[] {
  const records = Array.isArray(config?.model_list) ? config.model_list : [];
  const seen = new Set<string>();
  return records.flatMap((record: any): WebLlmModelOption[] => {
    const id = String(record?.model_id ?? "").trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const bytes = Number(record?.estimated_vram_bytes ?? 0);
    const size = Number.isFinite(bytes) && bytes > 0 ? ` · ~${Math.max(1, Math.round(bytes / 1024 / 1024))} MB VRAM` : "";
    return [{
      id,
      label: `${id}${size}`,
      keywords: [record?.model, record?.model_lib, ...(Array.isArray(record?.required_features) ? record.required_features : [])].filter(Boolean).join(" "),
    }];
  });
}

let catalogPromise: Promise<WebLlmModelOption[]> | null = null;
export function listWebLlmModels(): Promise<WebLlmModelOption[]> {
  catalogPromise ??= importWebLLM().then((webllm) => webLlmModelOptionsFromConfig(webllm.prebuiltAppConfig));
  return catalogPromise;
}

// `navigator.gpu` can exist while `requestAdapter()` still yields no compatible
// adapter (headless / VM Chrome, or a machine with no supported GPU). WebLLM only
// discovers this deep inside CreateMLCEngine, where it throws a scary "Unable to
// find a compatible GPU…" message. So probe the adapter ourselves: a false result
// hides the provider from the router and lets us surface a clear error first.
let gpuAdapterOk: boolean | null = null;
async function probeWebGPU(): Promise<boolean> {
  if (gpuAdapterOk != null) return gpuAdapterOk;
  try {
    const gpu = (navigator as any)?.gpu;
    gpuAdapterOk = !!gpu && !!(await gpu.requestAdapter());
  } catch {
    gpuAdapterOk = false;
  }
  return gpuAdapterOk;
}
// Kick the probe off eagerly so isAvailable() reflects the real answer soon after load.
if (typeof navigator !== "undefined" && "gpu" in navigator) void probeWebGPU();

function webgpuAvailable(): boolean {
  // Sync gate for the provider router; probeWebGPU() refines it to false once it
  // resolves on a GPU-less machine, so the router falls back to another provider.
  return typeof navigator !== "undefined" && "gpu" in navigator && gpuAdapterOk !== false;
}

/** One engine per model id; engine creation is heavy, so we cache + dedupe. */
const engines = new Map<string, Promise<any>>();

async function getEngine(modelId: string, onProgress?: (p: TranslateLoadProgress) => void): Promise<any> {
  // Guard both warm() and translate() paths before WebLLM can throw its own
  // opaque GPU error.
  if (!(await probeWebGPU())) {
    throw new Error("WebGPU not available — the in-browser translate model needs a WebGPU-capable browser/GPU.");
  }
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

  async translate(text: string, targetLang: string, modelId = DEFAULT_TRANSLATE_MODEL, sourceLang?: string, promptTemplate?: string): Promise<string> {
    const src = text.trim();
    if (!src) return "";
    const engine = await getEngine(modelId);
    const srcName = sourceLang ? (codeToLangName(sourceLang) ?? sourceLang) : "the detected source language";
    const prompt = renderTranslatePrompt(promptTemplate, {
      text: src,
      sourceLanguage: srcName,
      targetLanguage: targetLang,
    });
    const reply = await engine.chat.completions.create({
      // temperature 0 → deterministic; we want a faithful translation, not prose.
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    return (reply.choices?.[0]?.message?.content ?? "").trim();
  }

  async chat(text: string, instruction: string, modelId: string): Promise<string> {
    const src = text.trim();
    if (!src) return "";
    const engine = await getEngine(modelId);
    const reply = await engine.chat.completions.create({
      temperature: 0,
      max_tokens: 96,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: src },
      ],
    });
    return (reply.choices?.[0]?.message?.content ?? "").trim();
  }
}

export const webllmTranslate = new WebLLMTranslateProvider();

/** Free all WebLLM engines (the last LLM-translate node left the graph). */
export const disposeWebllm = () => disposeMemo(engines, ["unload"]);

// Config for the in-browser LLM translate node: the WebLLM model catalog and
// the target-language menu. Kept tiny and curated — these are multilingual
// instruct models small enough to download and run client-side over WebGPU.

export interface TranslateModelSpec {
  /** WebLLM model id (resolved from its prebuilt app-config). */
  id: string;
  name: string;
  /** Rough download size, shown in the picker so users know the cost. */
  size: string;
}

// Qwen2.5-Instruct is a strong multilingual translator at small sizes; Gemma/Llama
// offered as alternatives. q4f16 = 4-bit weights, fp16 activations (WebGPU).
export const TRANSLATE_MODELS: TranslateModelSpec[] = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 0.5B (fastest)", size: "~280 MB" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 1.5B (balanced)", size: "~880 MB" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", name: "Qwen2.5 3B (best quality)", size: "~1.7 GB" },
  { id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma 2 2B", size: "~1.4 GB" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B", size: "~700 MB" },
];

export const DEFAULT_TRANSLATE_MODEL = TRANSLATE_MODELS[1].id;

// Target languages. Value is the language name we put in the prompt; the model
// translates into it. The SOURCE is auto: SenseVoice detects it and the LLM
// returns same-language text unchanged, so only a target is needed.
export const TRANSLATE_LANGUAGES = [
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
  "German",
  "Russian",
  "Portuguese",
  "Arabic",
  "Hindi",
  "Vietnamese",
  "Thai",
  "Indonesian",
] as const;

// Map a BCP-47 prefix (navigator.language) to one of our target languages.
const LANG_BY_PREFIX: Record<string, string> = {
  en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean", es: "Spanish",
  fr: "French", de: "German", ru: "Russian", pt: "Portuguese", ar: "Arabic",
  hi: "Hindi", vi: "Vietnamese", th: "Thai", id: "Indonesian",
};

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANG_BY_PREFIX).map(([code, name]) => [name, code]),
);

/** Map a target-language name ("Chinese") to a BCP-47 code ("zh") for the
 *  browser Translator API. Already-a-code inputs ("ja", "zh-TW") pass through
 *  (graph configs store either form). Returns null for unknown names. */
export function langNameToCode(name: string): string | null {
  const mapped = NAME_TO_CODE[name];
  if (mapped) return mapped;
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(name) ? name : null;
}

/** Map a BCP-47 code (incl. SenseVoice's "yue") to a language name for prompts. */
export function codeToLangName(code: string): string | null {
  return LANG_BY_PREFIX[code] ?? ({ yue: "Cantonese" } as Record<string, string>)[code] ?? null;
}

// Translate backends. On-device LLM is the default (multilingual, no source
// needed); the browser Translator API is a lighter Chrome-only alternative.
export const TRANSLATE_PROVIDERS = [
  { id: "llm", name: "On-device LLM (WebLLM)" },
  { id: "browser", name: "Browser Translator API" },
] as const;

export const DEFAULT_TRANSLATE_PROVIDER = "llm";

/** The user's browser language as a target, falling back to English. */
export function browserTargetLang(): string {
  try {
    const prefix = (navigator.language || "en").toLowerCase().split("-")[0];
    return LANG_BY_PREFIX[prefix] ?? "English";
  } catch {
    return "English";
  }
}

// Default target = the user's browser language (so transcripts land in the
// language they read), overridable per node.
export const DEFAULT_TRANSLATE_LANG = browserTargetLang();

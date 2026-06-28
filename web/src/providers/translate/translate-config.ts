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
// translates into it. "Auto" intentionally omitted — translation needs a target.
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

export const DEFAULT_TRANSLATE_LANG = "English";

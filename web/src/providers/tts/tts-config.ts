// On-device neural TTS models (Meta MMS, VITS) served via transformers.js. Each
// is a per-language model that emits 16 kHz mono PCM — matching the graph's
// segment sample rate, so the output routes straight into a speaker/audio-out
// node (device-targetable, unlike the browser SpeechSynthesis node).

export interface NeuralTtsModel {
  id: string;
  name: string;
}

export const NEURAL_TTS_MODELS: NeuralTtsModel[] = [
  { id: "Xenova/mms-tts-eng", name: "English (MMS)" },
  { id: "Xenova/mms-tts-spa", name: "Spanish (MMS)" },
  { id: "Xenova/mms-tts-fra", name: "French (MMS)" },
  { id: "Xenova/mms-tts-deu", name: "German (MMS)" },
  { id: "Xenova/mms-tts-por", name: "Portuguese (MMS)" },
  { id: "Xenova/mms-tts-rus", name: "Russian (MMS)" },
  { id: "Xenova/mms-tts-ara", name: "Arabic (MMS)" },
  { id: "Xenova/mms-tts-vie", name: "Vietnamese (MMS)" },
];

export const DEFAULT_NEURAL_TTS_MODEL = "Xenova/mms-tts-eng";

/** MMS-TTS emits 16 kHz mono — the same rate the rest of the graph uses. */
export const NEURAL_TTS_SR = 16000;

/** Sentinel model value: pick the MMS model from the transcript's language. */
export const AUTO_TTS_MODEL = "auto";

// Map a transcript language code (ISO 639-1 from translate, or SenseVoice's
// zh/en/ja/ko/yue) to an MMS model id, when one exists in our set.
const LANG_TO_MODEL: Record<string, string> = {
  en: "Xenova/mms-tts-eng",
  es: "Xenova/mms-tts-spa",
  fr: "Xenova/mms-tts-fra",
  de: "Xenova/mms-tts-deu",
  pt: "Xenova/mms-tts-por",
  ru: "Xenova/mms-tts-rus",
  ar: "Xenova/mms-tts-ara",
  vi: "Xenova/mms-tts-vie",
};

/** Resolve a language code to an MMS model id, or undefined if none is available. */
export function langToTtsModel(code: string): string | undefined {
  return LANG_TO_MODEL[code.toLowerCase().split("-")[0]];
}

/** Sentinel voice value: pick a SpeechSynthesis voice from the transcript's lang. */
export const AUTO_TTS_VOICE = "auto";

/** True if a SpeechSynthesis voice.lang (e.g. "ja-JP") matches a transcript code
 *  (e.g. "ja"/"jpn") on its primary subtag. SenseVoice's "yue" maps to zh. */
export function voiceMatchesLang(voiceLang: string, code: string): boolean {
  const prim = (s: string) => s.toLowerCase().replace(/_/g, "-").split("-")[0];
  const want = code === "yue" ? "zh" : prim(code);
  return prim(voiceLang) === want;
}

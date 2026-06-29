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

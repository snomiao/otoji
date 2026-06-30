// Streaming ASR via vosk-browser (Kaldi compiled to WASM). Unlike SenseVoice/
// Whisper (offline, one shot per utterance), Vosk is a true streaming recognizer:
// feed it raw PCM continuously and it emits partial hypotheses that refine, plus a
// final result at each endpoint (silence). Best driven by the mic-raw node.
// The library + a per-language model are fetched lazily from the CDN.

import { disposeMemo } from "../dispose-util";

export interface VoskModel {
  id: string;
  name: string;
  url: string;
}

// Small streaming models (alphacephei / vosk-browser test host). English default.
export const VOSK_MODELS: VoskModel[] = [
  { id: "en", name: "English (small)", url: "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz" },
  { id: "cn", name: "Chinese (small)", url: "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-cn-0.3.tar.gz" },
  { id: "ru", name: "Russian (small)", url: "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-ru-0.4.tar.gz" },
  { id: "fr", name: "French (small)", url: "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-fr-0.4.tar.gz" },
];
export const DEFAULT_VOSK_MODEL = VOSK_MODELS[0].url;

const SR = 16000;
const VOSK_URL = "https://esm.run/vosk-browser";
const importVosk = () => new Function("u", "return import(u)")(VOSK_URL) as Promise<any>;

/** One Vosk model per url; loading is heavy (model download + WASM), so dedupe. */
const models = new Map<string, Promise<any>>();
function getModel(url: string): Promise<any> {
  let p = models.get(url);
  if (!p) {
    p = (async () => {
      const mod = await importVosk();
      return mod.createModel(url);
    })().catch((e) => {
      models.delete(url); // allow retry on failure
      throw e;
    });
    models.set(url, p);
  }
  return p;
}

/** Preload a model so the first frames aren't blocked on the download. */
export async function warmVosk(url = DEFAULT_VOSK_MODEL): Promise<void> {
  await getModel(url);
}

export interface VoskStream {
  accept(samples: Float32Array): void;
  free(): void;
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!audioCtx) {
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor({ sampleRate: SR });
  }
  return audioCtx;
}

/**
 * Open a streaming recognizer. `onPartial` fires with the evolving hypothesis;
 * `onResult` fires with a finalized utterance at each endpoint.
 */
export async function createVoskStream(
  url: string,
  onPartial: (text: string) => void,
  onResult: (text: string) => void,
): Promise<VoskStream> {
  const model = await getModel(url);
  const rec = new model.KaldiRecognizer(SR);
  rec.on("partialresult", (m: any) => { const t = m?.result?.partial; if (t) onPartial(t); });
  rec.on("result", (m: any) => { const t = m?.result?.text; if (t) onResult(t); });
  return {
    accept(samples: Float32Array) {
      if (!samples.length) return;
      // vosk-browser's acceptWaveform takes an AudioBuffer.
      const buf = ctx().createBuffer(1, samples.length, SR);
      buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      try { rec.acceptWaveform(buf); } catch { /* recognizer freed */ }
    },
    free() {
      try { rec.remove(); } catch { /* ignore */ }
    },
  };
}

/** Free all loaded Vosk models (the last Vosk node left the graph). */
export const disposeVosk = () => disposeMemo(models, ["terminate", "free", "remove"]);

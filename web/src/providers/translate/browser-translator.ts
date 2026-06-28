import type { TranslateProvider } from "../types";
import { langNameToCode } from "./translate-config";

// Chrome's built-in on-device Translator API (Chrome 138+). Lighter than the LLM
// (small language packs, fast), but needs an explicit source language — so we use
// the built-in LanguageDetector to detect it (SenseVoice's detection isn't carried
// in the transcript text). Falls back to passthrough whenever anything is missing.

function hasTranslator(): boolean {
  return typeof self !== "undefined" && "Translator" in self;
}
function hasDetector(): boolean {
  return typeof self !== "undefined" && "LanguageDetector" in self;
}

const translators = new Map<string, Promise<any>>(); // "src>tgt" -> Translator
let detectorP: Promise<any> | null = null;

async function getDetector(): Promise<any> {
  if (!hasDetector()) return null;
  if (!detectorP) {
    detectorP = (self as any).LanguageDetector.create().catch(() => {
      detectorP = null;
      return null;
    });
  }
  return detectorP;
}

async function detectSource(text: string): Promise<string | null> {
  const d = await getDetector();
  if (!d) return null;
  try {
    const r = await d.detect(text);
    return r?.[0]?.detectedLanguage ?? null;
  } catch {
    return null;
  }
}

function getTranslator(src: string, tgt: string): Promise<any> {
  const key = `${src}>${tgt}`;
  const existing = translators.get(key);
  if (existing) return existing;
  const p: Promise<any> = (self as any).Translator.create({ sourceLanguage: src, targetLanguage: tgt }).catch(
    (e: unknown) => {
      translators.delete(key);
      throw e;
    },
  );
  translators.set(key, p);
  return p;
}

export class BrowserTranslateProvider implements TranslateProvider {
  readonly id = "browser";
  readonly name = "Browser Translator API";

  isAvailable(): boolean {
    return hasTranslator();
  }

  // `targetLang` (a language NAME) lets us pre-download the detector + the likely
  // translator packs while we still have user activation (called from the warm
  // step right after Join). Chrome requires activation to START a pack download,
  // so doing it lazily on first transcript would otherwise throw NotAllowedError.
  async warm(targetLang?: string): Promise<void> {
    if (!hasTranslator()) throw new Error("Browser Translator API not available (needs Chrome 138+).");
    await getDetector();
    const tgt = targetLang ? langNameToCode(targetLang) : null;
    if (tgt) {
      const common = ["en", "zh", "ja", "es", "fr"];
      await Promise.allSettled(common.filter((s) => s !== tgt).map((s) => getTranslator(s, tgt)));
    }
  }

  async translate(text: string, targetLang: string): Promise<string> {
    const src0 = text.trim();
    if (!src0) return "";
    const tgt = langNameToCode(targetLang);
    if (!tgt || !hasTranslator()) return text; // passthrough
    const src = await detectSource(src0);
    if (!src || src === "und") return text; // unknown source -> passthrough
    if (src === tgt) return text; // already in target
    try {
      const av = await (self as any).Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
      if (av === "unavailable") return text;
      const t = await getTranslator(src, tgt);
      return ((await t.translate(src0)) ?? "").trim() || text;
    } catch {
      return text; // passthrough on any failure
    }
  }
}

export const browserTranslate = new BrowserTranslateProvider();

// PaddleOCR (PP-OCRv4) in the browser via @gutenye/ocr-browser on
// onnxruntime-web. Detection + recognition models and the dictionary are fetched
// from the jsdelivr CDN — no model weights are bundled (same policy as the STT/
// TTS providers; the vite config drops emitted .wasm). One memoized engine.

import { disposeMemo } from "../dispose-util";

// @gutenye/ocr-models version on the CDN (det/rec/dict assets live here). We use
// unpkg as the default host — jsdelivr intermittently 503s on the larger model
// file ("No healthy backends"); override via the node's `modelsBase` config if a
// host goes down. The wasm runtime still loads from jsdelivr like the rest.
const MODELS_VER = "1.4.2";
const DEFAULT_CDN = `https://unpkg.com/@gutenye/ocr-models@${MODELS_VER}/assets`;
const ORT_VERSION = "1.27.0"; // matches the deduped onnxruntime-web dep

interface OcrLine {
  text: string;
  box?: number[][];
}
interface OcrEngine {
  detect(image: string, options?: unknown): Promise<OcrLine[]>;
}

const engines = new Map<string, Promise<OcrEngine>>(); // memoized per models base url

function getEngine(base = DEFAULT_CDN): Promise<OcrEngine> {
  let p = engines.get(base);
  if (!p) {
    p = (async () => {
      const ort = (await import("onnxruntime-web")) as any;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      const mod = (await import("@gutenye/ocr-browser")) as any;
      const Ocr = mod.default ?? mod.Ocr ?? mod;
      return Ocr.create({
        models: {
          detectionPath: `${base}/ch_PP-OCRv4_det_infer.onnx`,
          recognitionPath: `${base}/ch_PP-OCRv4_rec_infer.onnx`,
          dictionaryPath: `${base}/ppocr_keys_v1.txt`,
        },
      }) as Promise<OcrEngine>;
    })().catch((e) => {
      engines.delete(base); // allow retry on failure
      throw e;
    });
    engines.set(base, p);
  }
  return p;
}

/** Preload the OCR det/rec models so the first frame isn't slow. */
export function warmOcr(modelsBase?: string): Promise<unknown> {
  return getEngine(modelsBase);
}

function bitmapToDataUrl(bitmap: ImageBitmap): string {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OCR: no 2d canvas context");
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Smallest y of a detection polygon, for top-to-bottom reading order. */
function topOf(box?: number[][]): number {
  if (!box || box.length === 0) return 0;
  return Math.min(...box.map((p) => p[1] ?? 0));
}

/**
 * Recognize text in a frame. Returns the detected lines joined top-to-bottom.
 * The PP-OCRv4 ch model also reads Latin text; `lang` is reserved for future
 * per-language model selection.
 */
export async function ocrRecognize(bitmap: ImageBitmap, modelsBase?: string): Promise<string> {
  const ocr = await getEngine(modelsBase);
  const lines = await ocr.detect(bitmapToDataUrl(bitmap));
  return [...lines]
    .sort((a, b) => topOf(a.box) - topOf(b.box))
    .map((l) => l.text)
    .filter((t) => t && t.trim())
    .join("\n");
}

/** Free all OCR engines (the last OCR node left the graph). */
export const disposeOcr = () => disposeMemo(engines, ["destroy", "dispose", "release"]);

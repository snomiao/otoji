// OCR in the browser via @gutenye/ocr-browser on onnxruntime-web. PaddleOCR
// (PP-OCRv4) is the default; a connected Model provider can swap in any
// Paddle-format det/rec/dict trio. Models are fetched from a CDN — no weights
// are bundled (same policy as the STT/TTS providers; vite drops emitted .wasm).

import type { ModelSourceMsg } from "../model/model-source";
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

/** Explicit det/rec/dict asset locations for a non-default OCR model. */
export interface OcrModelPaths {
  detectionPath: string;
  recognitionPath: string;
  dictionaryPath: string;
}

/** A models source: an assets base URL (standard PP-OCR filenames) or explicit paths. */
export type OcrModelRef = string | OcrModelPaths;

function resolvePaths(model: OcrModelRef = DEFAULT_CDN): OcrModelPaths {
  if (typeof model !== "string") return model;
  const base = model.replace(/\/+$/, "");
  return {
    detectionPath: `${base}/ch_PP-OCRv4_det_infer.onnx`,
    recognitionPath: `${base}/ch_PP-OCRv4_rec_infer.onnx`,
    dictionaryPath: `${base}/ppocr_keys_v1.txt`,
  };
}

/**
 * Map a Model provider message to OCR model paths, or undefined when the
 * source doesn't look like a Paddle-format OCR model. Accepts either a file
 * listing containing a det/rec ONNX pair + dictionary (e.g. a Hugging Face
 * repo), or a bare directory URL hosting the standard PP-OCR filenames.
 */
export function ocrModelFromSource(src: Pick<ModelSourceMsg, "url" | "files">): OcrModelPaths | undefined {
  const files = src.files ?? [];
  const det = files.find((f) => /(^|[/_.-])det[^/]*\.onnx$/i.test(f.name));
  const rec = files.find((f) => /(^|[/_.-])rec[^/]*\.onnx$/i.test(f.name));
  const dict = files.find((f) => /(^|[/_.-])(keys|dict)[^/]*\.txt$/i.test(f.name)) ?? files.find((f) => /\.txt$/i.test(f.name));
  if (det && rec && dict) return { detectionPath: det.url, recognitionPath: rec.url, dictionaryPath: dict.url };
  // A bare URL (no file extension) is treated as an assets base directory.
  if (src.url && !/\.[a-z0-9]{1,12}([?#]|$)/i.test(src.url)) return resolvePaths(src.url);
  return undefined;
}

const engines = new Map<string, Promise<OcrEngine>>(); // memoized per resolved model paths

function getEngine(model?: OcrModelRef): Promise<OcrEngine> {
  const paths = resolvePaths(model);
  const key = `${paths.detectionPath}\n${paths.recognitionPath}\n${paths.dictionaryPath}`;
  let p = engines.get(key);
  if (!p) {
    p = (async () => {
      const ort = (await import("onnxruntime-web")) as any;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      // ORT's proxy worker intermittently reports "worker not ready" in Vite/
      // Chrome when multiple providers initialize ORT. Run OCR on the main wasm
      // backend; the runtime already drops intermediate frames with makeLatest().
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      const mod = (await import("@gutenye/ocr-browser")) as any;
      const Ocr = mod.default ?? mod.Ocr ?? mod;
      return Ocr.create({ models: paths }) as Promise<OcrEngine>;
    })().catch((e) => {
      engines.delete(key); // allow retry on failure
      throw e;
    });
    engines.set(key, p);
  }
  return p;
}

/** Preload the OCR det/rec models so the first frame isn't slow. */
export function warmOcr(model?: OcrModelRef): Promise<unknown> {
  return getEngine(model);
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
export async function ocrRecognize(bitmap: ImageBitmap, model?: OcrModelRef): Promise<string> {
  const ocr = await getEngine(model);
  const lines = await ocr.detect(bitmapToDataUrl(bitmap));
  return [...lines]
    .sort((a, b) => topOf(a.box) - topOf(b.box))
    .map((l) => l.text)
    .filter((t) => t && t.trim())
    .join("\n");
}

/** Free all OCR engines (the last OCR node left the graph). */
export const disposeOcr = () => disposeMemo(engines, ["destroy", "dispose", "release"]);

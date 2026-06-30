// Object detection (YOLO-style) in the browser via transformers.js. The library
// + model are lazy-loaded from the CDN (esm.run) only when a Vision-model node
// runs, so non-vision users carry no extra bundle. Memoized per model id;
// disposable when the last vision node leaves the graph.

import { disposeMemo } from "../dispose-util";
import type { Detection } from "../../lib/detect-format";

// Hide the URL from Vite's optimizer so it stays a runtime dynamic import.
// esm.sh resolves transformers.js' deep dependency tree reliably; esm.run's
// (jsdelivr +esm) bundle fails a sub-import for this package.
const TFJS_URL = "https://esm.sh/@huggingface/transformers";
const importTfjs = () => new Function("u", "return import(u)")(TFJS_URL) as Promise<any>;

export const DETECT_MODELS = [
  { id: "Xenova/yolos-tiny", name: "YOLOS-tiny (fast)" },
  { id: "Xenova/detr-resnet-50", name: "DETR-50 (accurate)" },
];
export const DEFAULT_DETECT_MODEL = DETECT_MODELS[0].id;

const pipes = new Map<string, Promise<any>>();

function getPipe(model: string, onProgress?: (p: { progress?: number; text?: string }) => void): Promise<any> {
  let p = pipes.get(model);
  if (!p) {
    p = (async () => {
      const tf = await importTfjs();
      tf.env.allowLocalModels = false;
      tf.env.useBrowserCache = true;
      return tf.pipeline("object-detection", model, {
        progress_callback: (r: { status?: string; progress?: number }) =>
          onProgress?.({ progress: r.progress != null ? r.progress / 100 : undefined, text: r.status }),
      });
    })().catch((e) => {
      pipes.delete(model); // allow retry on failure
      throw e;
    });
    pipes.set(model, p);
  }
  return p;
}

export function warmDetect(
  model = DEFAULT_DETECT_MODEL,
  onProgress?: (p: { progress?: number; text?: string }) => void,
): Promise<void> {
  return getPipe(model, onProgress).then(() => undefined);
}

/** Free all detection pipelines (the last Vision-model node left the graph). */
export const disposeDetect = () => disposeMemo(pipes, ["dispose"]);

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("detect: no 2d canvas context");
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

/** Detect objects in a frame; boxes are in pixel coords. */
export async function detect(bitmap: ImageBitmap, model = DEFAULT_DETECT_MODEL, threshold = 0.5): Promise<Detection[]> {
  const pipe = await getPipe(model);
  const dataUrl = bitmapToCanvas(bitmap).toDataURL("image/png");
  const out = (await pipe(dataUrl, { threshold, percentage: false })) as Detection[];
  return out.map((d) => ({ label: d.label, score: d.score, box: d.box }));
}

const BOX_COLORS = ["#e53e3e", "#38a169", "#3182ce", "#d69e2e", "#805ad5", "#dd6b20", "#319795"];

/** Draw detection boxes + labels over the frame; returns a new ImageBitmap. */
export async function drawDetections(bitmap: ImageBitmap, dets: Detection[]): Promise<ImageBitmap> {
  const canvas = bitmapToCanvas(bitmap);
  const ctx = canvas.getContext("2d")!;
  ctx.lineWidth = Math.max(2, Math.round(canvas.width / 320));
  ctx.font = `${Math.max(12, Math.round(canvas.width / 32))}px sans-serif`;
  ctx.textBaseline = "top";
  let i = 0;
  for (const d of dets) {
    const color = BOX_COLORS[i++ % BOX_COLORS.length];
    const { xmin, ymin, xmax, ymax } = d.box;
    ctx.strokeStyle = color;
    ctx.strokeRect(xmin, ymin, xmax - xmin, ymax - ymin);
    const tag = `${d.label} ${Math.round(d.score * 100)}%`;
    const tw = ctx.measureText(tag).width + 6;
    const th = parseInt(ctx.font) + 4;
    ctx.fillStyle = color;
    ctx.fillRect(xmin, Math.max(0, ymin - th), tw, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(tag, xmin + 3, Math.max(0, ymin - th) + 2);
  }
  return createImageBitmap(canvas);
}

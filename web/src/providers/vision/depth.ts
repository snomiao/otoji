// Monocular depth estimation in the browser via transformers.js (Depth-Anything).
// image → a colorized depth map (ImageBitmap). Library lazy-loaded from esm.sh;
// memoized per model; disposable when the last vision node leaves the graph.

import { disposeMemo } from "../dispose-util";
import { buildPipeline } from "./tfjs-pipe";

export const DEPTH_MODELS = [{ id: "onnx-community/depth-anything-v2-small", name: "Depth-Anything v2 (small)" }];
export const DEFAULT_DEPTH_MODEL = DEPTH_MODELS[0].id;

const pipes = new Map<string, Promise<any>>();

function getPipe(model: string, onProgress?: (p: { progress?: number; text?: string }) => void): Promise<any> {
  let p = pipes.get(model);
  if (!p) {
    // WebGPU inference verified working on transformers.js 4.2.0 (~360ms/frame
    // vs multi-second wasm); buildPipeline still falls back to the wasm worker.
    p = buildPipeline("depth-estimation", model, onProgress).catch((e) => {
      pipes.delete(model);
      throw e;
    });
    pipes.set(model, p);
  }
  return p;
}

export function warmDepth(
  model = DEFAULT_DEPTH_MODEL,
  onProgress?: (p: { progress?: number; text?: string }) => void,
): Promise<void> {
  return getPipe(model, onProgress).then(() => undefined);
}

/** Free all depth pipelines (the last vision node left the graph). */
export const disposeDepth = () => disposeMemo(pipes, ["dispose"]);

// Near = warm (red), far = cool (blue): a simple perceptual ramp over [0,255].
function colorize(v: number): [number, number, number] {
  const t = v / 255; // 0 far … 1 near (Depth-Anything: brighter = nearer)
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 1) * 2)));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 0.5) * 3)));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(t - 0) * 2)));
  return [r, g, b];
}

export interface DepthFieldResult {
  width: number;
  height: number;
  values: number[];
  preview: ImageBitmap;
}

/** Estimate depth and retain both normalized samples and a color preview. */
export async function estimateDepthField(bitmap: ImageBitmap, model = DEFAULT_DEPTH_MODEL): Promise<DepthFieldResult> {
  const pipe = await getPipe(model);
  const src = document.createElement("canvas");
  src.width = bitmap.width;
  src.height = bitmap.height;
  src.getContext("2d")!.drawImage(bitmap, 0, 0);
  const out = await pipe(src.toDataURL("image/png"));
  // out.depth is a RawImage (grayscale): { data, width, height, channels }.
  const d = out.depth as { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number };
  const ch = d.channels || 1;
  const rgba = new Uint8ClampedArray(d.width * d.height * 4);
  for (let i = 0; i < d.width * d.height; i++) {
    const [r, g, b] = colorize(d.data[i * ch]);
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return {
    width: d.width,
    height: d.height,
    values: Array.from({ length: d.width * d.height }, (_, i) => d.data[i * ch]),
    preview: await createImageBitmap(new ImageData(rgba, d.width, d.height)),
  };
}

/** Estimate depth and return a colorized depth-map ImageBitmap. */
export async function estimateDepth(bitmap: ImageBitmap, model = DEFAULT_DEPTH_MODEL): Promise<ImageBitmap> {
  return (await estimateDepthField(bitmap, model)).preview;
}

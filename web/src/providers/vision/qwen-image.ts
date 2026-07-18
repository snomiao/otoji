export const DEFAULT_QWEN_IMAGE_SERVER = "http://127.0.0.1:7861/generate";
export const DEFAULT_QWEN_IMAGE_MODEL = "Qwen/Qwen-Image-2512";

export type QwenImageMode = "generate" | "edit";
export type QwenImageBackend = "diffusers" | "diffsynth" | "mlx" | "gguf" | "remote";

export interface QwenImageRequest {
  serverUrl?: string;
  prompt: string;
  image?: ImageBitmap;
  mode?: QwenImageMode;
  backend?: QwenImageBackend;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  strength?: number;
}

export interface QwenImageResult {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  info: string;
}

interface QwenRunnerResponse {
  image?: string;
  imageUrl?: string;
  url?: string;
  base64?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  info?: unknown;
  metadata?: unknown;
  error?: string;
}

export function qwenImageHardwareHint(backend = "diffusers"): string {
  if (backend === "gguf") return "GGUF/offload: usable RAM+VRAM must exceed model file size; Q4 is about 13GB.";
  if (backend === "diffsynth") return "DiffSynth offload can run in very low VRAM, but latency rises sharply.";
  if (backend === "mlx") return "Apple Silicon MLX 8-bit: about 40GB unified memory recommended.";
  return "Diffusers bf16: 24GB NVIDIA VRAM is the practical floor; 32GB+ is more comfortable.";
}

export async function generateQwenImage(req: QwenImageRequest): Promise<QwenImageResult> {
  const prompt = req.prompt.trim();
  if (!prompt) throw new Error("qwen-image: prompt is empty");

  const payload: Record<string, unknown> = {
    prompt,
    mode: req.mode ?? (req.image ? "edit" : "generate"),
    backend: req.backend ?? "diffusers",
    model: req.model || DEFAULT_QWEN_IMAGE_MODEL,
    width: req.width,
    height: req.height,
    steps: req.steps,
    seed: req.seed,
    strength: req.strength,
  };
  if (req.image) payload.image = await bitmapToDataUrl(req.image);

  const res = await fetch((req.serverUrl || DEFAULT_QWEN_IMAGE_SERVER).trim(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`qwen-image: runner returned ${res.status}`);
  const json = await res.json() as QwenRunnerResponse;
  if (json.error) throw new Error(`qwen-image: ${json.error}`);

  const blob = await responseImageBlob(json);
  const bitmap = await createImageBitmap(blob);
  return { bitmap, width: bitmap.width, height: bitmap.height, info: formatQwenInfo(json, req) };
}

async function responseImageBlob(json: QwenRunnerResponse): Promise<Blob> {
  const direct = json.image ?? json.imageUrl ?? json.url;
  if (direct) {
    if (/^data:/i.test(direct)) return (await fetch(direct)).blob();
    if (/^https?:\/\//i.test(direct) || direct.startsWith("blob:")) return (await fetch(direct)).blob();
    return base64ToBlob(direct, json.mimeType);
  }
  if (json.base64) return base64ToBlob(json.base64, json.mimeType);
  throw new Error("qwen-image: runner response did not include an image");
}

function base64ToBlob(value: string, mimeType = "image/png"): Blob {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "image/png" });
}

async function bitmapToDataUrl(bitmap: ImageBitmap): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("qwen-image: no 2d canvas context");
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}

function formatQwenInfo(json: QwenRunnerResponse, req: QwenImageRequest): string {
  const parts = [
    `model=${req.model || DEFAULT_QWEN_IMAGE_MODEL}`,
    `mode=${req.mode ?? (req.image ? "edit" : "generate")}`,
    `backend=${req.backend ?? "diffusers"}`,
  ];
  if (req.width && req.height) parts.push(`${req.width}x${req.height}`);
  if (req.steps) parts.push(`${req.steps} steps`);
  if (req.seed !== undefined) parts.push(`seed=${req.seed}`);
  if (req.strength !== undefined) parts.push(`strength=${req.strength}`);
  if (json.info !== undefined) parts.push(typeof json.info === "string" ? json.info : JSON.stringify(json.info));
  if (json.metadata !== undefined) parts.push(typeof json.metadata === "string" ? json.metadata : JSON.stringify(json.metadata));
  return parts.join("\n");
}

// Pose + hand landmark detection via MediaPipe Tasks (Google). The library +
// WASM fileset + .task models are lazy-loaded from CDNs only when a vision node
// runs pose/hand, so non-vision users carry nothing extra. Memoized per task;
// disposable (landmarkers expose .close()).

import { disposeMemo } from "../dispose-util";

const MP_URL = "https://esm.sh/@mediapipe/tasks-vision";
const importMp = () => new Function("u", "return import(u)")(MP_URL) as Promise<any>;
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export type MpTask = "pose" | "hand";

interface Landmark {
  x: number; // normalized 0..1
  y: number;
  z?: number;
}
export interface LmResult {
  task: MpTask;
  sets: Landmark[][]; // one array of landmarks per detected pose/hand
  connections: Array<{ start: number; end: number }>;
}

interface MpEngine {
  detect(image: ImageBitmap): { landmarks?: Landmark[][] };
  close?(): void;
  __connections: Array<{ start: number; end: number }>;
}

const engines = new Map<MpTask, Promise<MpEngine>>();

function getEngine(task: MpTask, onProgress?: (p: { text?: string }) => void): Promise<MpEngine> {
  let p = engines.get(task);
  if (!p) {
    p = (async () => {
      onProgress?.({ text: "loading MediaPipe…" });
      const mp = await importMp();
      const fileset = await mp.FilesetResolver.forVisionTasks(WASM);
      const isPose = task === "pose";
      const Landmarker = isPose ? mp.PoseLandmarker : mp.HandLandmarker;
      const modelAssetPath = isPose ? POSE_MODEL : HAND_MODEL;
      const extra = isPose ? { numPoses: 2 } : { numHands: 4 };
      // Prefer the GPU (WebGL) delegate — ~4.6× faster than CPU for these lite
      // models (pose detect 26.5ms → 5.7ms), so the per-frame main-thread block
      // shrinks. Fall back to CPU where the GPU delegate can't initialize.
      const create = (delegate: "GPU" | "CPU") =>
        Landmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "IMAGE",
          ...extra,
        });
      const eng = await create("GPU").catch(() => create("CPU"));
      eng.__connections = isPose ? mp.PoseLandmarker.POSE_CONNECTIONS : mp.HandLandmarker.HAND_CONNECTIONS;
      return eng;
    })().catch((e) => {
      engines.delete(task);
      throw e;
    });
    engines.set(task, p);
  }
  return p;
}

export function warmMediapipe(task: MpTask, onProgress?: (p: { text?: string }) => void): Promise<unknown> {
  return getEngine(task, onProgress);
}

/**
 * Precompile the GPU shaders for a given input resolution (one dummy detect),
 * so the first real camera frame isn't a one-off stall. The WebGL delegate
 * compiles per input size, so callers pass the camera's *actual* resolution.
 * Non-fatal — on failure the shaders just compile lazily on the first frame.
 */
export async function prewarmMediapipe(task: MpTask, width: number, height: number): Promise<void> {
  try {
    const eng = await getEngine(task);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    const bmp = await createImageBitmap(c);
    eng.detect(bmp);
    bmp.close();
  } catch {
    /* shaders compile on the first real frame instead */
  }
}

/** Free all MediaPipe landmarkers (the last vision node left the graph). */
export const disposeMediapipe = () => disposeMemo(engines, ["close"]);

export async function landmarks(bitmap: ImageBitmap, task: MpTask): Promise<LmResult> {
  const eng = await getEngine(task);
  const res = eng.detect(bitmap);
  return { task, sets: res.landmarks ?? [], connections: eng.__connections ?? [] };
}

/** Draw landmark points + skeleton connections over the frame. */
export async function drawLandmarks(bitmap: ImageBitmap, res: LmResult): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const W = canvas.width;
  const H = canvas.height;
  const dot = Math.max(2, Math.round(W / 200));
  for (const set of res.sets) {
    ctx.strokeStyle = "#38a169";
    ctx.lineWidth = Math.max(1, Math.round(W / 320));
    for (const c of res.connections) {
      const a = set[c.start];
      const b = set[c.end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * W, a.y * H);
      ctx.lineTo(b.x * W, b.y * H);
      ctx.stroke();
    }
    ctx.fillStyle = "#e53e3e";
    for (const p of set) {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return createImageBitmap(canvas);
}

export function formatLandmarksLabels(res: LmResult): string {
  const n = res.sets.length;
  return res.task === "pose" ? `${n} pose${n === 1 ? "" : "s"}` : `${n} hand${n === 1 ? "" : "s"}`;
}

export function formatLandmarksJson(res: LmResult): string {
  return res.sets
    .map((set, i) =>
      JSON.stringify({
        [res.task]: i,
        points: set.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]),
      }),
    )
    .join("\n");
}

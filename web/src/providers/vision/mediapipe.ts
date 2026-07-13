// Pose + hand landmark + gesture detection via MediaPipe Tasks (Google). The
// library + WASM fileset + .task models are lazy-loaded from CDNs only when a
// vision node runs pose/hand/gesture, so non-vision users carry nothing extra.
// Memoized per task; disposable (landmarkers expose .close()).

import { disposeMemo } from "../dispose-util";

const MP_URL = "https://esm.sh/@mediapipe/tasks-vision";
const importMp = () => new Function("u", "return import(u)")(MP_URL) as Promise<any>;
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const GESTURE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";

export type MpTask = "pose" | "hand" | "gesture";

interface Landmark {
  x: number; // normalized 0..1
  y: number;
  z?: number;
}
export interface LmResult {
  task: MpTask;
  sets: Landmark[][]; // one array of landmarks per detected pose/hand
  connections: Array<{ start: number; end: number }>;
  /** gesture task only: recognized gesture per hand, aligned with `sets`
   *  (e.g. "Thumb_Up"; null = hand seen but no known gesture) */
  tags?: (string | null)[];
}

interface MpEngine {
  detect(image: ImageBitmap): {
    landmarks?: Landmark[][];
    gestures?: { categoryName: string; score: number }[][];
  };
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
      const isGesture = task === "gesture";
      const Landmarker = isPose ? mp.PoseLandmarker : isGesture ? mp.GestureRecognizer : mp.HandLandmarker;
      const modelAssetPath = isPose ? POSE_MODEL : isGesture ? GESTURE_MODEL : HAND_MODEL;
      const extra = isPose ? { numPoses: 2 } : { numHands: isGesture ? 2 : 4 };
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
      // GestureRecognizer's inference method is recognize(); alias it so all
      // tasks share the detect() call site.
      if (isGesture) eng.detect = (image: ImageBitmap) => eng.recognize(image);
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
  const sets = res.landmarks ?? [];
  const out: LmResult = { task, sets, connections: eng.__connections ?? [] };
  if (task === "gesture") {
    // One top-scoring category per hand; "None" (below the recognizer's
    // internal threshold) maps to null so downstream text stays quiet.
    out.tags = sets.map((_, i) => {
      const top = res.gestures?.[i]?.[0];
      return top && top.categoryName && top.categoryName !== "None" ? top.categoryName : null;
    });
  }
  return out;
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
  let si = 0;
  for (const set of res.sets) {
    const tag = res.tags?.[si++];
    if (tag && set[0]) {
      // Label the gesture near the wrist landmark.
      ctx.font = `${Math.max(12, Math.round(W / 40))}px sans-serif`;
      ctx.textBaseline = "bottom";
      const x = set[0].x * W;
      const y = set[0].y * H;
      const tw = ctx.measureText(tag).width + 8;
      const th = parseInt(ctx.font) + 6;
      ctx.fillStyle = "rgba(26,32,44,0.75)";
      ctx.fillRect(x - 4, y - th, tw, th);
      ctx.fillStyle = "#68d391";
      ctx.fillText(tag, x, y - 3);
    }
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

/** Render a Suzanne-inspired object in the hand-derived camera space. */
export async function drawSpatialMonkey(bitmap: ImageBitmap, res: LmResult): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const hand = res.sets[0];
  if (!hand?.[8] || !hand[5] || !hand[0]) return createImageBitmap(canvas);
  const [tip, base, wrist] = [hand[8], hand[5], hand[0]];
  const x = tip.x * canvas.width;
  const y = tip.y * canvas.height;
  const span = Math.hypot((base.x - wrist.x) * canvas.width, (base.y - wrist.y) * canvas.height);
  const r = Math.max(22, Math.min(canvas.width * .13, span * .72));
  const angle = Math.atan2((tip.y - base.y) * canvas.height, (tip.x - base.x) * canvas.width);
  const depth = Math.max(-1, Math.min(1, -(tip.z ?? 0) * 5));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.scale(1 + depth * .12, 1 + depth * .12);
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = r * .22;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, r / 28);
  ctx.strokeStyle = "#8fffd5";
  ctx.fillStyle = "rgba(14,45,43,.78)";
  const oval = (ox: number, oy: number, rx: number, ry: number, rot = 0) => {
    ctx.beginPath(); ctx.ellipse(ox, oy, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  oval(0, 0, r * .72, r * .82);
  oval(-r * .72, 0, r * .35, r * .47, -.2);
  oval(r * .72, 0, r * .35, r * .47, .2);
  oval(0, r * .34, r * .48, r * .36);
  ctx.fillStyle = "#b9ffe6";
  oval(-r * .25, -r * .2, r * .13, r * .18);
  oval(r * .25, -r * .2, r * .13, r * .18);
  ctx.fillStyle = "#102a2a";
  ctx.beginPath(); ctx.arc(-r * .22, -r * .18, r * .055, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * .22, -r * .18, r * .055, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.font = `${Math.max(12, Math.round(canvas.width / 55))}px ui-monospace, monospace`;
  ctx.fillStyle = "#8fffd5";
  ctx.fillText(`finger XYZ  ${tip.x.toFixed(2)}  ${tip.y.toFixed(2)}  ${(tip.z ?? 0).toFixed(2)}`, 12, canvas.height - 16);
  return createImageBitmap(canvas);
}

export function formatLandmarksLabels(res: LmResult): string {
  const n = res.sets.length;
  if (res.task === "gesture") {
    // Human-readable gesture names ("Thumb_Up" → "Thumb Up"), stable order, so
    // a downstream Text diff / TTS only fires when the gesture actually changes.
    const names = (res.tags ?? []).filter((t): t is string => !!t).map((t) => t.replace(/_/g, " "));
    return names.length ? names.join(", ") : n ? `${n} hand${n === 1 ? "" : "s"}, no gesture` : "";
  }
  return res.task === "pose" ? `${n} pose${n === 1 ? "" : "s"}` : `${n} hand${n === 1 ? "" : "s"}`;
}

export function formatLandmarksJson(res: LmResult): string {
  return res.sets
    .map((set, i) =>
      JSON.stringify({
        [res.task]: i,
        ...(res.task === "gesture" ? { gesture: res.tags?.[i] ?? null } : {}),
        points: set.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, Math.round((p.z ?? 0) * 1000) / 1000]),
      }),
    )
    .join("\n");
}

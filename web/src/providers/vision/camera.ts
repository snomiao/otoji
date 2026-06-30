// Webcam frame source for the Camera node. Opens getUserMedia({video}) into an
// offscreen <video> and emits frames either free-running at a target FPS, or on
// demand — one frame per grabNow() "credit" — so a downstream consumer (OCR)
// can pace it via the control/feedback edge (backpressure).

export const DEFAULT_CAMERA_FPS = 4;
const MIN_FPS = 0.2;
const MAX_FPS = 30;

/** Clamp a requested FPS to a sane range; non-positive/NaN → default. */
export function clampFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return DEFAULT_CAMERA_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, fps));
}

export interface CameraHandle {
  stop(): void;
  setRate(fps: number): void; // free-run at fps (<=0 → pause, credit-only)
  grabNow(): void; // capture exactly one frame now (credit)
  dims(): { width: number; height: number }; // live stream size (0 until ready)
}

export interface CameraOpts {
  deviceId?: string;
  fps: number;
  demand?: boolean; // start in credit mode (wait for grabNow), after priming one frame
  onFrame: (bitmap: ImageBitmap, width: number, height: number) => void;
  onError?: (e: Error) => void;
}

export async function startCamera(opts: CameraOpts): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
    audio: false,
  });
  return createFrameSource(stream, opts);
}

/**
 * Build a frame source over an existing video MediaStream (webcam *or* a screen
 * share from getDisplayMedia). Owns the `<video>` element and the stream's video
 * tracks; stop() releases them. Frames emit free-running at `fps` or per credit.
 */
export async function createFrameSource(
  stream: MediaStream,
  opts: Omit<CameraOpts, "deviceId">,
): Promise<CameraHandle> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  let stopped = false;
  let grabbing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let rafPending = false;

  const grab = async () => {
    if (stopped || grabbing || !video.videoWidth) return; // skip if busy or not ready
    grabbing = true;
    try {
      const bitmap = await createImageBitmap(video);
      if (stopped) {
        bitmap.close();
        return;
      }
      opts.onFrame(bitmap, video.videoWidth, video.videoHeight);
    } catch (e) {
      opts.onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      grabbing = false;
    }
  };

  const startTimer = (fps: number) => {
    if (timer) clearInterval(timer);
    timer = setInterval(grab, 1000 / clampFps(fps));
  };

  // Credit grab, aligned to a paint. A downstream consumer that runs *synchronously*
  // on the main thread (e.g. MediaPipe pose/hand) completes a frame and immediately
  // pulses for the next; grabbing right then would chain inferences with no gap and
  // starve the compositor (the tab appears frozen). Deferring to requestAnimationFrame
  // guarantees one paint + input turn per frame and coalesces bursts of credits.
  const grabOnFrame = () => {
    if (rafPending || stopped) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      void grab();
    });
  };

  // Prime one frame once the stream has dimensions, so a credit-based downstream
  // has an initial frame to kick the loop (it then pulses for the next).
  const prime = () => {
    const tryOnce = () => {
      if (stopped) return;
      if (video.videoWidth) void grab();
      else setTimeout(tryOnce, 50);
    };
    tryOnce();
  };

  prime();
  if (!opts.demand) startTimer(opts.fps);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream.getVideoTracks().forEach((t) => t.stop()); // audio (if any) is owned elsewhere
      video.srcObject = null;
    },
    setRate: (fps: number) => {
      if (stopped) return;
      if (fps > 0) startTimer(fps);
      else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    grabNow: () => grabOnFrame(),
    dims: () => ({ width: video.videoWidth, height: video.videoHeight }),
  };
}

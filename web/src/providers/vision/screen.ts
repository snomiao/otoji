// Screen-share source for the Screen-share node. Opens getDisplayMedia (video +
// system/tab audio) and exposes two streams: video frames (same frame source as
// the Camera node — free-run at fps or one-per-credit, with backpressure) and,
// when the browser grants an audio track, VAD-segmented system audio for STT.

import { createFrameSource, type CameraHandle } from "./camera";
import { vadFromStream, type MicVadHandle } from "../../lib/mic-vad";

export interface ScreenOpts {
  fps: number;
  demand?: boolean; // start in credit mode (wait for grabNow)
  /** Reuse a live display stream across runtime restarts (keyed by node id).
   *  getDisplayMedia re-prompts the browser picker on EVERY call — there is no
   *  persistable permission — so the editor's stop→start restart cycle (any
   *  structural graph edit, e.g. rewiring a downstream node) must not re-acquire.
   *  With a cacheKey, stop() keeps the tracks alive; releaseScreenShares() is
   *  the only thing that actually ends the capture. */
  cacheKey?: string;
  onFrame: (bitmap: ImageBitmap, width: number, height: number) => void;
  onSegment?: (samples: Float32Array, durationMs: number, offsetMs: number) => void;
  onEnded?: () => void; // user clicked the browser's "Stop sharing"
  onError?: (e: Error) => void;
}

export type ScreenHandle = CameraHandle;

const cachedStreams = new Map<string, MediaStream>();

/** Stop and forget every cached display stream except the given keys. Call with
 *  the current screen-share node ids on restart (drops deleted nodes' captures)
 *  and with no args on leave/unmount (ends all captures). */
export function releaseScreenShares(keep: Iterable<string> = []): void {
  const keepSet = new Set(keep);
  for (const [key, stream] of cachedStreams) {
    if (keepSet.has(key)) continue;
    stream.getTracks().forEach((t) => t.stop());
    cachedStreams.delete(key);
  }
}

/** Stop and forget ONE node's cached display stream (forces a fresh picker on
 *  the next start) without touching other nodes' captures. */
export function releaseScreenShare(key: string): void {
  const stream = cachedStreams.get(key);
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  cachedStreams.delete(key);
}

/** Prompt immediately from a trusted UI click and cache the chosen stream. */
export async function preselectScreenShare(key: string): Promise<void> {
  releaseScreenShare(key);
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  cachedStreams.set(key, stream);
  stream.getVideoTracks()[0]?.addEventListener("ended", () => cachedStreams.delete(key), { once: true });
}

export async function startScreenShare(opts: ScreenOpts): Promise<ScreenHandle> {
  let stream = opts.cacheKey ? cachedStreams.get(opts.cacheKey) : undefined;
  // A cached stream is reusable only while its video track is live (the user may
  // have clicked the browser's "Stop sharing" while the runtime was down).
  if (stream && stream.getVideoTracks()[0]?.readyState !== "live") {
    stream.getTracks().forEach((t) => t.stop());
    cachedStreams.delete(opts.cacheKey!);
    stream = undefined;
  }
  if (!stream) {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (opts.cacheKey) {
      const key = opts.cacheKey;
      cachedStreams.set(key, stream);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => cachedStreams.delete(key), { once: true });
    }
  }
  const cached = !!opts.cacheKey;

  // Browser "Stop sharing" ends the video track — surface it so the node can
  // stop. Scoped to this handle's lifetime: the cached stream outlives the
  // handle across restarts, and stale listeners must not fire into dead runtimes.
  const ac = new AbortController();
  stream.getVideoTracks()[0]?.addEventListener("ended", () => opts.onEnded?.(), { signal: ac.signal });

  const video = await createFrameSource(stream, {
    fps: opts.fps,
    demand: opts.demand,
    stopTracks: !cached, // cached tracks survive restarts; releaseScreenShares() ends them
    onFrame: opts.onFrame,
    onError: opts.onError,
  });

  // System audio is optional: macOS often shares no audio for full-screen/window
  // capture (only tab share carries audio). Wire VAD only when a track exists.
  let audio: MicVadHandle | null = null;
  const audioTracks = stream.getAudioTracks();
  if (opts.onSegment && audioTracks.length) {
    try {
      audio = vadFromStream(new MediaStream(audioTracks), {
        onSegment: opts.onSegment,
      });
    } catch (e) {
      opts.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  return {
    ...video,
    stop: () => {
      ac.abort();
      video.stop();
      if (!cached) audioTracks.forEach((t) => t.stop());
      void audio?.stop();
    },
  };
}

// Screen-share source for the Screen-share node. Opens getDisplayMedia (video +
// system/tab audio) and exposes two streams: video frames (same frame source as
// the Camera node — free-run at fps or one-per-credit, with backpressure) and,
// when the browser grants an audio track, VAD-segmented system audio for STT.

import { createFrameSource, type CameraHandle } from "./camera";
import { vadFromStream, type MicVadHandle } from "../../lib/mic-vad";

export interface ScreenOpts {
  fps: number;
  demand?: boolean; // start in credit mode (wait for grabNow)
  onFrame: (bitmap: ImageBitmap, width: number, height: number) => void;
  onSegment?: (samples: Float32Array, durationMs: number, offsetMs: number) => void;
  onEnded?: () => void; // user clicked the browser's "Stop sharing"
  onError?: (e: Error) => void;
}

export type ScreenHandle = CameraHandle;

export async function startScreenShare(opts: ScreenOpts): Promise<ScreenHandle> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

  // Browser "Stop sharing" ends the video track — surface it so the node can stop.
  stream.getVideoTracks()[0]?.addEventListener("ended", () => opts.onEnded?.());

  const video = await createFrameSource(stream, {
    fps: opts.fps,
    demand: opts.demand,
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
      video.stop(); // stops the video tracks
      audioTracks.forEach((t) => t.stop());
      void audio?.stop();
    },
  };
}

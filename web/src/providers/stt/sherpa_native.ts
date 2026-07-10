// Native sherpa-onnx STT, bridged over a WebSocket to a local `otoji server`.
//
// `otoji server` (the Rust CLI) runs the real sherpa-onnx SenseVoice worker and
// speaks a tiny protocol over one WebSocket per session:
//   - binary frames IN : raw PCM16 mono @ 16 kHz (little-endian)
//   - text frames  OUT : one AsrEvent JSON per line, e.g.
//         {"type":"open"}
//         {"type":"partial","seg_id":0,"text":"…"}
//         {"type":"final","seg_id":0,"text":"…","words":[]}
//         {"type":"status","message":"…"} / {"type":"closed"}
//   - text frames  IN  : PTT_START / PTT_END / CONTEXT <text>  (control)
//
// This unlocks every model the native binary has on disk (whisper-large-v3,
// zipformer-ja-en, dolphin, full-precision SenseVoice, …) — models far too
// heavy to run in-browser via onnxruntime-web — while reusing the same graph
// wiring as the in-browser `stt`/`vosk` nodes.

export const DEFAULT_SHERPA_SERVER_URL = "ws://127.0.0.1:8080/";

// The `otoji server` SenseVoice worker is a *streaming* consumer: it advances
// its VAD/decode cadence per received audio chunk. A single monolithic frame
// (e.g. a file source emitting a whole 8 s clip at once) arrives as one chunk
// and never triggers the decode loop, so nothing comes back. Slicing into
// small frames — as a live mic naturally would — makes it decode and stream
// partials. 640 samples = 40 ms @ 16 kHz, matching the CLI's default frame.
const FRAME_SAMPLES = 640;
const MAX_PENDING_FRAMES = 30_000 / 40; // 30s of 40ms frames

export interface SherpaNativeStream {
  /** Feed one frame of mono float samples in [-1, 1] at 16 kHz. */
  accept(samples: Float32Array): void;
  /** Close the socket and release the native session. */
  free(): void;
}

/** Convert mono Float32 [-1,1] to little-endian PCM16 bytes. */
function floatToPcm16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/**
 * Open a streaming session against a local `otoji server`. Returns the stream
 * SYNCHRONOUSLY — the WebSocket connects in the background and frames sent
 * before it opens are buffered and flushed on open. Returning synchronously is
 * important: the graph runtime may deliver the first audio segment before the
 * socket finishes opening (a file-source emits its whole buffer at start), and
 * a Promise-based API would leave `stream` null and silently drop that audio.
 * `onError` fires if the socket cannot be opened (server not running).
 */
export function createSherpaNativeStream(
  url: string,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onError?: (e: Error) => void,
): SherpaNativeStream {
  let ws: WebSocket | null = null;
  let open = false;
  let closed = false;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    closed = true;
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  // Frames that arrive before the socket is OPEN are dropped by the browser,
  // so buffer them and flush on open. Keeps the first spoken words intact.
  const pending: ArrayBuffer[] = [];

  const sendFrame = (buf: ArrayBuffer) => {
    if (closed) return;
    if (open && ws && ws.readyState === WebSocket.OPEN) ws.send(buf);
    else {
      pending.push(buf);
      if (pending.length > MAX_PENDING_FRAMES) pending.shift();
    }
  };
  const fail = (e: Error) => {
    if (closed) return;
    closed = true;
    open = false;
    pending.length = 0;
    onError?.(e);
    try {
      if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close();
    } catch {
      /* already closing */
    }
  };
  const stream: SherpaNativeStream = {
    accept(samples: Float32Array) {
      if (!samples.length) return;
      // Slice into streaming-sized frames so the server's per-chunk decode
      // loop advances (a single large send yields no transcript).
      for (let o = 0; o < samples.length; o += FRAME_SAMPLES) {
        sendFrame(floatToPcm16(samples.subarray(o, Math.min(o + FRAME_SAMPLES, samples.length))));
      }
    },
    free() {
      closed = true;
      open = false;
      pending.length = 0;
      try {
        if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close();
      } catch {
        /* already closing */
      }
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      }
    },
  };

  if (ws) {
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      if (closed) {
        try {
          ws?.close();
        } catch {
          /* already closing */
        }
        return;
      }
      open = true;
      for (const buf of pending.splice(0)) {
        try {
          ws!.send(buf);
        } catch {
          /* ignore */
        }
      }
    };
    ws.onmessage = (ev) => {
      if (closed) return;
      if (typeof ev.data !== "string") return; // only text AsrEvent frames
      let msg: { type?: string; text?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "partial" && msg.text) onPartial(msg.text);
      else if (msg.type === "final" && msg.text) onFinal(msg.text);
    };
    ws.onerror = () => {
      if (!open) fail(new Error(`otoji server not reachable at ${url}`));
    };
    ws.onclose = () => {
      open = false;
      pending.length = 0;
      closed = true;
    };
  }
  return stream;
}

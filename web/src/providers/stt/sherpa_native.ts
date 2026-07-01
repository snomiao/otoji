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
 * Open a streaming session against a local `otoji server`. `onPartial` fires
 * with the evolving hypothesis; `onFinal` fires once per committed sentence.
 * Rejects if the socket cannot be opened (server not running).
 */
export function createSherpaNativeStream(
  url: string,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
): Promise<SherpaNativeStream> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    ws.binaryType = "arraybuffer";

    // Frames that arrive before the socket is OPEN are dropped by the browser,
    // so buffer them and flush on open. Keeps the first spoken words intact.
    const pending: ArrayBuffer[] = [];
    let open = false;

    const stream: SherpaNativeStream = {
      accept(samples: Float32Array) {
        if (!samples.length) return;
        const buf = floatToPcm16(samples);
        if (open && ws.readyState === WebSocket.OPEN) ws.send(buf);
        else pending.push(buf);
      },
      free() {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.close();
        } catch {
          /* already closing */
        }
      },
    };

    ws.onopen = () => {
      open = true;
      for (const buf of pending.splice(0)) {
        try {
          ws.send(buf);
        } catch {
          /* ignore */
        }
      }
      resolve(stream);
    };
    ws.onmessage = (ev) => {
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
      if (!open) reject(new Error(`otoji server not reachable at ${url}`));
    };
  });
}

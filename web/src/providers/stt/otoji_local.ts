import type { SttProvider, SttSegment, SttSession } from "../types";

/**
 * Local SenseVoice ASR over WebSocket.
 *
 * Connects to the bundled `otoji server` (see `otoji server --help`), which
 * listens on `ws://127.0.0.1:8080/` and accepts binary frames of 16 kHz mono
 * s16le PCM. It streams back `AsrEvent` JSON text frames (see
 * `src/core.rs::AsrEvent`) and accepts the control text frames `PTT_START`,
 * `PTT_END`, and `CONTEXT <text>`.
 *
 * This provider needs no API keys — everything runs on the local machine. It
 * is an OPTIONAL browser client for a separately-launched `otoji server`; the
 * shareable desktop app is the native overlay (`otoji listen --aec
 * --overlay`), not this web UI. Not registered by default in the playground.
 */
export interface OtojiLocalConfig {
  /** Defaults to `ws://127.0.0.1:8080/`. */
  url?: string;
}

export const DEFAULT_OTOJI_LOCAL_URL = "ws://127.0.0.1:8080/";

/**
 * Map one `AsrEvent` JSON frame to an `SttSegment`, or `null` for events that
 * carry no transcript text (open/closed/status/error/language_detected).
 *
 * The server tags events with serde `#[serde(tag = "type", rename_all =
 * "snake_case")]`, so the discriminator field is `type` with snake_case names.
 */
export function parseAsrEvent(raw: string): SttSegment | null {
  let ev: any;
  try { ev = JSON.parse(raw); } catch { return null; }
  if (!ev || typeof ev.type !== "string") return null;
  switch (ev.type) {
    // Live, revisable hypotheses.
    case "partial":
    case "ptt_partial":
      return typeof ev.text === "string" ? { text: ev.text, final: false } : null;
    // Confirmed text that will not change.
    case "final":
    case "ptt_final":
    case "ptt_upgrade":
    case "ptt_translated":
      return typeof ev.text === "string" ? { text: ev.text, final: true } : null;
    default:
      // open / closed / status / error / language_detected — no transcript.
      return null;
  }
}

export class OtojiLocalSttProvider implements SttProvider {
  readonly id = "otoji_local";
  readonly name = "Local SenseVoice (otoji)";
  private url: string;
  constructor(cfg: OtojiLocalConfig = {}) {
    this.url = cfg.url ?? DEFAULT_OTOJI_LOCAL_URL;
  }

  /** Always available: the local server ships with the app, no keys needed. */
  isAvailable(): boolean { return true; }

  async start(
    onSegment: (s: SttSegment) => void,
    onError?: (e: Error) => void,
  ): Promise<SttSession> {
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", () => rej(new Error("otoji local ws connect failed")), { once: true });
    });
    ws.addEventListener("message", (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      // Surface server-side errors so the UI can show "model not downloaded".
      try {
        const obj = JSON.parse(raw);
        if (obj?.type === "error" && typeof obj.message === "string") {
          onError?.(new Error(obj.message));
          return;
        }
      } catch { /* not JSON — ignore */ }
      const seg = parseAsrEvent(raw);
      if (seg) onSegment(seg);
    });
    ws.addEventListener("error", () => onError?.(new Error("otoji local ws error")));
    return {
      sendAudio(frame: Int16Array) {
        if (ws.readyState === ws.OPEN) {
          // Send the exact bytes of this frame (respect byteOffset/length).
          ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        }
      },
      async stop() {
        try {
          if (ws.readyState === ws.OPEN) ws.send("PTT_END");
        } catch { /* ignore */ }
        ws.close();
      },
    };
  }
}

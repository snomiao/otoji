import { hmacSha1Base64, md5Hex } from "../../lib/crypto";
import type { SttProvider, SttSegment, SttSession } from "../types";

export interface IflytekRtasrConfig {
  appId: string;
  apiKey: string;
  host?: string; // wss://rtasr.xfyun.cn/v1/ws
}

export interface RtasrSigned {
  url: string;
  ts: string;
  signa: string;
}

/** Pure signing function. Testable. */
export async function signRtasrUrl(
  cfg: IflytekRtasrConfig,
  nowSeconds?: number,
): Promise<RtasrSigned> {
  const ts = String(nowSeconds ?? Math.floor(Date.now() / 1000));
  const baseString = cfg.appId + ts;
  const md5hex = md5Hex(baseString);
  const sig = await hmacSha1Base64(cfg.apiKey, md5hex);
  const signa = encodeURIComponent(sig);
  const host = cfg.host ?? "wss://rtasr.xfyun.cn/v1/ws";
  const url = `${host}?appid=${encodeURIComponent(cfg.appId)}&ts=${ts}&signa=${signa}`;
  return { url, ts, signa };
}

/** Parse a single RTASR result frame. */
export function parseRtasrFrame(raw: string): SttSegment | null {
  let outer: any;
  try { outer = JSON.parse(raw); } catch { return null; }
  if (outer.action !== "result") return null;
  const dataStr = typeof outer.data === "string" ? outer.data : "";
  if (!dataStr) return null;
  let inner: any;
  try { inner = JSON.parse(dataStr); } catch { return null; }
  const st = inner?.cn?.st;
  if (!st) return null;
  const final = String(st.type) === "0";
  let text = "";
  const rts: any[] = st.rt ?? [];
  for (const rt of rts) {
    for (const ws of (rt.ws ?? [])) {
      for (const cw of (ws.cw ?? [])) {
        text += cw.w ?? "";
      }
    }
  }
  return { text, final };
}

export class IflytekRtasrProvider implements SttProvider {
  readonly id = "iflytek_rtasr";
  readonly name = "iFlytek RTASR";
  constructor(private cfg: IflytekRtasrConfig) {}
  isAvailable(): boolean { return !!(this.cfg.appId && this.cfg.apiKey); }

  async start(onSegment: (s: SttSegment) => void, onError?: (e: Error) => void): Promise<SttSession> {
    const { url } = await signRtasrUrl(this.cfg);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", () => rej(new Error("rtasr ws error")), { once: true });
    });
    ws.addEventListener("message", (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      const seg = parseRtasrFrame(raw);
      if (seg) onSegment(seg);
    });
    ws.addEventListener("error", () => onError?.(new Error("rtasr ws error")));
    return {
      sendAudio(frame: Int16Array) {
        if (ws.readyState === ws.OPEN) ws.send(frame.buffer);
      },
      async stop() {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ end: true }));
        ws.close();
      },
    };
  }
}

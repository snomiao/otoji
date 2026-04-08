import { hmacSha256Base64 } from "../../lib/crypto";
import { base64ToBytes, stringToBase64, utf8ToBase64 } from "../../lib/base64";
import type { TtsProvider } from "../types";

export interface IflytekTtsConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
  voice?: string;
  aue?: string;
  host?: string; // default tts-api.xfyun.cn
  path?: string; // default /v2/tts
}

export interface TtsSigned {
  url: string;
  date: string;
  authorization: string;
}

export async function signIflytekTtsUrl(
  cfg: IflytekTtsConfig,
  dateOverride?: string,
): Promise<TtsSigned> {
  const host = cfg.host ?? "tts-api.xfyun.cn";
  const path = cfg.path ?? "/v2/tts";
  const date = dateOverride ?? new Date().toUTCString();
  const signingString = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = await hmacSha256Base64(cfg.apiSecret, signingString);
  const authorizationOrigin =
    `api_key="${cfg.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = stringToBase64(authorizationOrigin);
  const url =
    `wss://${host}${path}` +
    `?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}` +
    `&host=${encodeURIComponent(host)}`;
  return { url, date, authorization };
}

export function buildTtsFirstFrame(cfg: IflytekTtsConfig, text: string): string {
  return JSON.stringify({
    common: { app_id: cfg.appId },
    business: {
      aue: cfg.aue ?? "lame",
      vcn: cfg.voice ?? "xiaoyan",
      tte: "UTF8",
      auf: "audio/L16;rate=16000",
    },
    data: { text: utf8ToBase64(text), status: 2 },
  });
}

export interface TtsFrameParsed {
  audio: Uint8Array;
  done: boolean;
  error?: string;
}

export function parseIflytekTtsFrame(raw: string): TtsFrameParsed | null {
  let j: any;
  try { j = JSON.parse(raw); } catch { return null; }
  if (j.code !== 0 && j.code !== undefined && j.code !== null) {
    return { audio: new Uint8Array(), done: true, error: j.message ?? `code ${j.code}` };
  }
  const d = j.data;
  if (!d) return null;
  const audio = d.audio ? base64ToBytes(d.audio) : new Uint8Array();
  const done = d.status === 2;
  return { audio, done };
}

export class IflytekTtsProvider implements TtsProvider {
  readonly id = "iflytek_tts";
  readonly name = "iFlytek TTS";
  constructor(private cfg: IflytekTtsConfig) {}
  isAvailable(): boolean {
    return !!(this.cfg.appId && this.cfg.apiKey && this.cfg.apiSecret);
  }

  async synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }> {
    const { url } = await signIflytekTtsUrl(this.cfg);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const chunks: Uint8Array[] = [];
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => {
        ws.send(buildTtsFirstFrame(this.cfg, text));
        res();
      }, { once: true });
      ws.addEventListener("error", () => rej(new Error("tts ws error")), { once: true });
    });
    await new Promise<void>((res, rej) => {
      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : "";
        const p = parseIflytekTtsFrame(raw);
        if (!p) return;
        if (p.error) { rej(new Error(p.error)); return; }
        if (p.audio.length) chunks.push(p.audio);
        if (p.done) { ws.close(); res(); }
      });
      ws.addEventListener("error", () => rej(new Error("tts ws error")));
    });
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    const mime = (this.cfg.aue ?? "lame") === "lame" ? "audio/mpeg" : "audio/L16";
    return { audio: out, mime };
  }
}

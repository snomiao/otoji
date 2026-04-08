import type { TtsProvider } from "../types";

export interface OpenAiTtsConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
  format?: string;
}

export function buildOpenAiTtsRequest(cfg: OpenAiTtsConfig, text: string): { url: string; init: RequestInit } {
  const base = cfg.baseUrl ?? "https://api.openai.com/v1";
  return {
    url: `${base}/audio/speech`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model ?? "tts-1",
        input: text,
        voice: cfg.voice ?? "alloy",
        format: cfg.format ?? "mp3",
      }),
    },
  };
}

export class OpenAiTtsProvider implements TtsProvider {
  readonly id = "openai_tts";
  readonly name = "OpenAI TTS";
  constructor(private cfg: OpenAiTtsConfig) {}
  isAvailable(): boolean { return !!this.cfg.apiKey; }
  async synthesize(text: string): Promise<{ audio: Uint8Array; mime: string }> {
    const { url, init } = buildOpenAiTtsRequest(this.cfg, text);
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`openai tts http ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { audio: buf, mime: "audio/mpeg" };
  }
}

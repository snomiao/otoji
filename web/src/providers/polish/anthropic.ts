import type { PolishProvider } from "../types";

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function buildAnthropicRequest(cfg: AnthropicConfig, text: string, instruction?: string): { url: string; init: RequestInit } {
  const base = cfg.baseUrl ?? "https://api.anthropic.com/v1";
  const sys = instruction ?? "Polish the following text. Preserve meaning and language. Return only the polished text.";
  return {
    url: `${base}/messages`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: cfg.model ?? "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: sys,
        messages: [{ role: "user", content: text }],
      }),
    },
  };
}

export function parseAnthropicResponse(j: any): string {
  const parts = j?.content ?? [];
  return parts.map((p: any) => p.text ?? "").join("");
}

export class AnthropicPolishProvider implements PolishProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic Claude";
  constructor(private cfg: AnthropicConfig) {}
  isAvailable(): boolean { return !!this.cfg.apiKey; }
  async polish(text: string, instruction?: string): Promise<string> {
    const { url, init } = buildAnthropicRequest(this.cfg, text, instruction);
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`anthropic http ${res.status}`);
    return parseAnthropicResponse(await res.json());
  }
}

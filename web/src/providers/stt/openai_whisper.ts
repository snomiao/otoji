import type { SttProvider, SttSegment, SttSession } from "../types";

export interface OpenAiWhisperConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/** Build multipart form for Whisper transcription request. */
export function buildWhisperRequest(cfg: OpenAiWhisperConfig, audioBlob: Blob): { url: string; init: RequestInit } {
  const base = cfg.baseUrl ?? "https://api.openai.com/v1";
  const form = new FormData();
  form.append("file", audioBlob, "audio.wav");
  form.append("model", cfg.model ?? "whisper-1");
  return {
    url: `${base}/audio/transcriptions`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
    },
  };
}

export function pcm16ToWavBlob(pcm: Int16Array, sampleRate = 16000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataLen = pcm.byteLength;
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const body = new Uint8Array(44 + pcm.byteLength);
  body.set(new Uint8Array(header), 0);
  body.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return new Blob([body as BlobPart], { type: "audio/wav" });
}

export class OpenAiWhisperProvider implements SttProvider {
  readonly id = "openai_whisper";
  readonly name = "OpenAI Whisper";
  constructor(private cfg: OpenAiWhisperConfig) {}
  isAvailable(): boolean { return !!this.cfg.apiKey; }

  async start(onSegment: (s: SttSegment) => void, onError?: (e: Error) => void): Promise<SttSession> {
    const chunks: Int16Array[] = [];
    return {
      sendAudio(frame: Int16Array) { chunks.push(new Int16Array(frame)); },
      stop: async () => {
        try {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const merged = new Int16Array(total);
          let o = 0;
          for (const c of chunks) { merged.set(c, o); o += c.length; }
          const blob = pcm16ToWavBlob(merged);
          const { url, init } = buildWhisperRequest(this.cfg, blob);
          const res = await fetch(url, init);
          if (!res.ok) throw new Error(`whisper http ${res.status}`);
          const j = await res.json();
          onSegment({ text: j.text ?? "", final: true });
        } catch (e: any) {
          onError?.(e);
        }
      },
    };
  }
}

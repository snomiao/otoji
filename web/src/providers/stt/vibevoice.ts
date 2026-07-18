export const DEFAULT_VIBEVOICE_SERVER = "http://localhost:8000";
export const DEFAULT_VIBEVOICE_MLX_MODEL = "mlx-community/VibeVoice-ASR-bf16";
export const DEFAULT_VIBEVOICE_VLLM_MODEL = "vibevoice";

export type VibeVoiceBackend = "mlx" | "vllm";

export interface VibeVoiceConfig {
  baseUrl?: string;
  model?: string;
  hotwords?: string;
  backend?: VibeVoiceBackend;
}

export interface VibeVoiceResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
}

function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pcm16ToWavBytes(pcm: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return bytes;
}

export async function buildVibeVoiceRequest(
  samples: Float32Array,
  sampleRate: number,
  cfg: VibeVoiceConfig = {},
): Promise<{ url: string; init: RequestInit }> {
  const wav = pcm16ToWavBytes(floatToPcm16(samples), sampleRate);
  const duration = samples.length / sampleRate;
  const hotwords = cfg.hotwords?.trim();
  const baseUrl = (cfg.baseUrl?.trim() || DEFAULT_VIBEVOICE_SERVER).replace(/\/+$/, "");
  const backend = cfg.backend ?? "mlx";

  if (backend === "mlx") {
    const form = new FormData();
    form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "audio.wav");
    form.append("model", cfg.model?.trim() || DEFAULT_VIBEVOICE_MLX_MODEL);
    form.append("response_format", "json");
    if (hotwords) form.append("prompt", hotwords);
    return {
      url: `${baseUrl}/v1/audio/transcriptions`,
      init: { method: "POST", body: form },
    };
  }

  const audio = bytesToBase64(wav);
  const context = hotwords ? `, with extra info: ${hotwords}` : "";
  const prompt = `This is a ${duration.toFixed(2)} seconds audio${context}, please transcribe it with these keys: Start time, End time, Speaker ID, Content`;

  return {
    url: `${baseUrl}/v1/chat/completions`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model?.trim() || DEFAULT_VIBEVOICE_VLLM_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that transcribes audio input into text output in JSON format.",
          },
          {
            role: "user",
            content: [
              { type: "audio_url", audio_url: { url: `data:audio/wav;base64,${audio}` } },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: 32768,
        temperature: 0,
        stream: false,
        top_p: 1,
      }),
    },
  };
}

export async function transcribeVibeVoice(
  samples: Float32Array,
  sampleRate: number,
  cfg: VibeVoiceConfig = {},
): Promise<string> {
  const { url, init } = await buildVibeVoiceRequest(samples, sampleRate, cfg);
  const response = await fetch(url, init);
  const json = await response.json() as VibeVoiceResponse;
  if (!response.ok) {
    const message = typeof json.error === "string" ? json.error : json.error?.message;
    throw new Error(`vibevoice: ${message || `runner returned ${response.status}`}`);
  }
  const text = ((json as VibeVoiceResponse & { text?: string }).text ?? json.choices?.[0]?.message?.content)?.trim();
  if (!text) throw new Error("vibevoice: runner response did not include a transcript");
  return text;
}

export async function checkVibeVoiceServer(baseUrl = DEFAULT_VIBEVOICE_SERVER): Promise<void> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const response = await fetch(`${base}/v1/models`);
  if (!response.ok) throw new Error(`runner returned ${response.status}`);
}

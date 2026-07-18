import { describe, expect, it, vi } from "vitest";
import { buildVibeVoiceRequest, transcribeVibeVoice } from "../providers/stt/vibevoice";

describe("VibeVoice ASR", () => {
  it("builds an MLX Audio multipart transcription request by default", async () => {
    const { url, init } = await buildVibeVoiceRequest(new Float32Array(16000), 16000, {
      baseUrl: "http://localhost:8000/",
      hotwords: "Otoji,VibeVoice",
    });
    const body = init.body as FormData;
    expect(url).toBe("http://localhost:8000/v1/audio/transcriptions");
    expect(body.get("model")).toBe("mlx-community/VibeVoice-ASR-bf16");
    expect(body.get("prompt")).toBe("Otoji,VibeVoice");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("builds the official vLLM chat-completions request when selected", async () => {
    const { url, init } = await buildVibeVoiceRequest(new Float32Array(16000), 16000, { backend: "vllm" });
    const body = JSON.parse(init.body as string);
    expect(url).toBe("http://localhost:8000/v1/chat/completions");
    expect(body.model).toBe("vibevoice");
    expect(body.messages[1].content[0].audio_url.url).toMatch(/^data:audio\/wav;base64,/);
  });

  it("returns a non-streaming transcript", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "speaker 0: hello" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(transcribeVibeVoice(new Float32Array(16), 16000)).resolves.toBe("speaker 0: hello");
    vi.unstubAllGlobals();
  });
});

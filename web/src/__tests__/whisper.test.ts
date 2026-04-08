import { describe, it, expect } from "vitest";
import { buildWhisperRequest, pcm16ToWavBlob } from "../providers/stt/openai_whisper";

describe("openai whisper", () => {
  it("builds multipart request with bearer auth", () => {
    const blob = new Blob([new Uint8Array([0])], { type: "audio/wav" });
    const { url, init } = buildWhisperRequest({ apiKey: "sk" }, blob);
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk");
    expect(init.body).toBeInstanceOf(FormData);
  });
  it("wraps pcm16 into a wav blob", () => {
    const pcm = new Int16Array([0, 1, -1, 32767]);
    const blob = pcm16ToWavBlob(pcm, 16000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + pcm.byteLength);
  });
});

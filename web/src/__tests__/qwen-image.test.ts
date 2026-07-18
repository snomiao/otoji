import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQwenImage } from "../providers/vision/qwen-image";

const originalFetch = globalThis.fetch;
const originalCreateImageBitmap = globalThis.createImageBitmap;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.createImageBitmap = originalCreateImageBitmap;
  vi.restoreAllMocks();
});

function mockRunner() {
  const bitmap = { width: 64, height: 32 } as ImageBitmap;
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ base64: "AA==", mimeType: "image/png" }), { status: 200 })) as unknown as typeof fetch;
  globalThis.createImageBitmap = vi.fn(async () => bitmap) as unknown as typeof createImageBitmap;
  return bitmap;
}

describe("image generation runner bridge", () => {
  it("sends text-to-image backend and generation controls", async () => {
    const bitmap = mockRunner();
    const result = await generateQwenImage({
      serverUrl: "https://runner.test/generate",
      prompt: "draw otoji",
      model: "Qwen/Qwen-Image-2512",
      backend: "diffusers",
      mode: "generate",
      width: 768,
      height: 512,
      steps: 12,
      seed: 7,
    });
    const call = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(call[0]).toBe("https://runner.test/generate");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({
      prompt: "draw otoji",
      model: "Qwen/Qwen-Image-2512",
      backend: "diffusers",
      mode: "generate",
      width: 768,
      height: 512,
      steps: 12,
      seed: 7,
    });
    expect(result.bitmap).toBe(bitmap);
  });

  it("sends the seed image and strength for image-to-image", async () => {
    mockRunner();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,seed");
    await generateQwenImage({
      prompt: "make it editorial",
      image: { width: 128, height: 128 } as ImageBitmap,
      model: "Qwen/Qwen-Image-Edit-2511",
      backend: "diffusers",
      mode: "edit",
      strength: 0.65,
    });
    const payload = JSON.parse(String((vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit).body));
    expect(payload).toMatchObject({
      prompt: "make it editorial",
      image: "data:image/png;base64,seed",
      model: "Qwen/Qwen-Image-Edit-2511",
      backend: "diffusers",
      mode: "edit",
      strength: 0.65,
    });
  });
});

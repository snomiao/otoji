import { describe, expect, it } from "vitest";
import { CaptureBuffer, defaultWakePaths, wakePathsFromConfig } from "../providers/audio/openwakeword";

describe("openWakeWord model path resolution", () => {
  it("defaults mel/embedding/head to the HF mirror", () => {
    const p = defaultWakePaths();
    expect(p.melUrl).toMatch(/melspectrogram\.onnx$/);
    expect(p.embeddingUrl).toMatch(/embedding_model\.onnx$/);
    expect(p.wakeUrl).toMatch(/hey_jarvis_v0\.1\.onnx$/);
  });
  it("resolves a bare wake-model name against the base", () => {
    const p = wakePathsFromConfig({ model: "alexa_v0.1" });
    expect(p.wakeUrl).toMatch(/alexa_v0\.1\.onnx$/);
  });
  it("passes a full wake-model URL through, keeps shared frontend on base", () => {
    const p = wakePathsFromConfig({ model: "https://cdn.example.com/my_wake.onnx", base: "https://cdn.example.com/oww" });
    expect(p.wakeUrl).toBe("https://cdn.example.com/my_wake.onnx");
    expect(p.melUrl).toBe("https://cdn.example.com/oww/melspectrogram.onnx");
  });
});

describe("post-wake capture buffer", () => {
  it("buffers exactly captureMs of audio then hands it over once", () => {
    const buf = new CaptureBuffer(100, 16000); // 100ms = 1600 samples
    expect(buf.push(new Float32Array(800))).toBeNull(); // not capturing yet
    buf.start();
    expect(buf.active).toBe(true);
    expect(buf.push(new Float32Array(1000))).toBeNull(); // 1000 < 1600
    const out = buf.push(new Float32Array(1000)); // total 2000 >= 1600
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2000);
    expect(buf.active).toBe(false);
    // further pushes are inert until start() again
    expect(buf.push(new Float32Array(1000))).toBeNull();
  });
});

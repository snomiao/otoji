import { describe, expect, it } from "vitest";
import {
  argmax,
  decodeTokens,
  parseTokens,
  zipformerModelFromSource,
  zipformerPathsFromBase,
} from "../providers/stt/zipformer";

describe("zipformer streaming ASR (pure parts)", () => {
  it("parses sherpa tokens.txt into an id table", () => {
    const table = parseTokens("<blk> 0\n<sos/eos> 1\n▁THE 2\n▁QUICK 3\nS 4\n");
    expect(table[0]).toBe("<blk>");
    expect(table[2]).toBe("▁THE");
    expect(table[4]).toBe("S");
  });

  it("decodes sentencepiece pieces into readable text", () => {
    const table = parseTokens("<blk> 0\n▁HELLO 1\n▁WORLD 2\nS 3\n");
    expect(decodeTokens([1, 2, 3], table)).toBe("HELLO WORLDS");
    expect(decodeTokens([0, 1], table)).toBe("HELLO"); // blanks are skipped
    expect(decodeTokens([], table)).toBe("");
  });

  it("argmax picks the greatest logit", () => {
    expect(argmax(new Float32Array([0.1, 2.5, -1, 2.4]))).toBe(1);
    expect(argmax(new Float32Array([5]))).toBe(0);
  });

  it("maps a HF file listing to the encoder/decoder/joiner/tokens quartet, preferring int8", () => {
    const mk = (name: string) => ({ name, url: `https://hf.co/r/${name}` });
    const paths = zipformerModelFromSource({
      url: "https://huggingface.co/acme/streaming-zipformer",
      files: [
        mk("encoder-epoch-99-avg-1.onnx"),
        mk("encoder-epoch-99-avg-1.int8.onnx"),
        mk("decoder-epoch-99-avg-1.int8.onnx"),
        mk("joiner-epoch-99-avg-1.int8.onnx"),
        mk("tokens.txt"),
        mk("README.md"),
      ],
    });
    expect(paths).toEqual({
      encoderUrl: "https://hf.co/r/encoder-epoch-99-avg-1.int8.onnx",
      decoderUrl: "https://hf.co/r/decoder-epoch-99-avg-1.int8.onnx",
      joinerUrl: "https://hf.co/r/joiner-epoch-99-avg-1.int8.onnx",
      tokensUrl: "https://hf.co/r/tokens.txt",
    });
  });

  it("rejects sources without the full quartet; accepts a bare base URL", () => {
    expect(zipformerModelFromSource({ files: [{ name: "model.onnx", url: "u" }] })).toBeUndefined();
    const fromBase = zipformerModelFromSource({ url: "https://cdn.example.com/zipformer-en" });
    expect(fromBase?.tokensUrl).toBe("https://cdn.example.com/zipformer-en/tokens.txt");
    expect(zipformerPathsFromBase("https://x.example/").encoderUrl).toMatch(/^https:\/\/x\.example\/encoder-/);
  });
});

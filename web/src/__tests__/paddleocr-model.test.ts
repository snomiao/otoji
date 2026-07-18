import { describe, expect, it } from "vitest";
import { ocrModelFromSource } from "../providers/vision/paddleocr";

describe("ocrModelFromSource", () => {
  it("picks det/rec/dict from a Hugging Face-style file listing", () => {
    const paths = ocrModelFromSource({
      url: "https://huggingface.co/acme/pp-ocr-en",
      files: [
        { name: "README.md", url: "https://hf.co/r/README.md" },
        { name: "en_PP-OCRv3_det_infer.onnx", url: "https://hf.co/r/en_PP-OCRv3_det_infer.onnx" },
        { name: "en_PP-OCRv3_rec_infer.onnx", url: "https://hf.co/r/en_PP-OCRv3_rec_infer.onnx" },
        { name: "en_dict.txt", url: "https://hf.co/r/en_dict.txt" },
      ],
    });
    expect(paths).toEqual({
      detectionPath: "https://hf.co/r/en_PP-OCRv3_det_infer.onnx",
      recognitionPath: "https://hf.co/r/en_PP-OCRv3_rec_infer.onnx",
      dictionaryPath: "https://hf.co/r/en_dict.txt",
    });
  });

  it("treats a bare directory URL as an assets base with standard PP-OCR names", () => {
    const paths = ocrModelFromSource({ url: "https://cdn.example.com/ocr-assets/" });
    expect(paths).toEqual({
      detectionPath: "https://cdn.example.com/ocr-assets/ch_PP-OCRv4_det_infer.onnx",
      recognitionPath: "https://cdn.example.com/ocr-assets/ch_PP-OCRv4_rec_infer.onnx",
      dictionaryPath: "https://cdn.example.com/ocr-assets/ppocr_keys_v1.txt",
    });
  });

  it("rejects sources without a Paddle-format det/rec/dict trio", () => {
    expect(ocrModelFromSource({ url: "https://hf.co/r/model.safetensors", files: [{ name: "model.safetensors", url: "https://hf.co/r/model.safetensors" }] })).toBeUndefined();
    expect(ocrModelFromSource({ files: [{ name: "en_PP-OCRv3_det_infer.onnx", url: "https://hf.co/r/det.onnx" }] })).toBeUndefined();
  });
});

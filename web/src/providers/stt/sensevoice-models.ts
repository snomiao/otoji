// Selectable in-browser ONNX ASR models (the "model dropdown"). All entries
// share the SenseVoice front-end pipeline (fbank + LFR + CMVN + CTC).

export interface SenseVoiceModelSpec {
  id: string;
  name: string;
  modelUrl: string;
  tokensUrl: string;
  approxMB: number;
}

const SV_BASE =
  "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main";

export const SENSEVOICE_MODELS: SenseVoiceModelSpec[] = [
  {
    id: "sensevoice-small-int8",
    name: "SenseVoice Small · int8 · zh/en/ja/ko/yue (~228 MB)",
    modelUrl: `${SV_BASE}/model.int8.onnx`,
    tokensUrl: `${SV_BASE}/tokens.txt`,
    approxMB: 228,
  },
  {
    id: "sensevoice-small-fp32",
    name: "SenseVoice Small · fp32 · higher accuracy (~895 MB)",
    modelUrl: `${SV_BASE}/model.onnx`,
    tokensUrl: `${SV_BASE}/tokens.txt`,
    approxMB: 895,
  },
];

export const DEFAULT_SENSEVOICE_MODEL = "sensevoice-small-int8";

export function getSenseVoiceModel(id: string | undefined): SenseVoiceModelSpec {
  return (
    SENSEVOICE_MODELS.find((m) => m.id === id) ??
    SENSEVOICE_MODELS.find((m) => m.id === DEFAULT_SENSEVOICE_MODEL)!
  );
}

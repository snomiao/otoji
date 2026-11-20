export const SAMPLE_RATE = 16000;
export const DIMENSIONS = 192;
export const MAX_AUDIO_MS = 30000;

export interface ModelAsset {
  id: string;
  url: string;
  sha256: string;
  bytes: number;
  /** Quantization is deliberately not enabled before device/score calibration. */
  precision: "fp32";
}
export interface ExtractorOptions {
  model: ModelAsset;
  /** The consuming application's own copy of onnxruntime-web 1.27.0/dist/. */
  wasmBaseUrl: string;
  minAudioMs?: number;
}
export interface DeviceEmbedding {
  v: 1;
  trust: "device";
  model: string;
  dimension: 192;
  audioMs: number;
  embedding: Float32Array;
}
export type ErrorCode =
  | "consent"
  | "config"
  | "artifact"
  | "unavailable"
  | "not-ready"
  | "closed"
  | "busy"
  | "audio"
  | "aborted";
export class VoiceprintError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(`Voiceprint ${code}.`);
  }
}
/** Runtime seam for deterministic tests; browser consumers normally use the WASM default. */
export interface VoiceprintSession {
  run(data: Float32Array, frames: number): Promise<Float32Array>;
  release(): Promise<void>;
}
export interface ExtractorDependencies {
  fetch?: typeof fetch;
  createSession?: (model: Uint8Array, wasmBaseUrl: string) => Promise<VoiceprintSession>;
}
export interface VoiceprintExtractor {
  warm(consent: boolean): Promise<void>;
  extract(samples: Float32Array, signal?: AbortSignal): Promise<DeviceEmbedding>;
  dispose(): Promise<void>;
}

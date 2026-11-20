export { createVoiceprintExtractor, validateOptions } from "./extractor";
export { installVoiceprintWorker, createVoiceprintWorkerClient } from "./worker";
export type { VoiceprintWorkerScope, VoiceprintWorkerClient } from "./worker";
export { SAMPLE_RATE, DIMENSIONS, MAX_AUDIO_MS, VoiceprintError } from "./types";
export type {
  ModelAsset,
  ExtractorOptions,
  DeviceEmbedding,
  ErrorCode,
  VoiceprintExtractor,
  ExtractorDependencies,
  VoiceprintSession,
} from "./types";

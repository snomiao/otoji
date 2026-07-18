export interface SttAudio {
  /** Mono float samples in [-1, 1]. */
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export interface SttSegment {
  text: string;
  final: boolean;
  /** Captured VAD segment audio (set by self-capturing providers on finals). */
  audio?: SttAudio;
}

/** Per-window input level, for the live wave-chart. */
export interface SttLevel {
  rms: number;
  active: boolean;
}

export interface SttSession {
  sendAudio(pcm16kMonoFrame: Int16Array): void;
  stop(): Promise<void>;
}

export interface SttProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  start(
    onSegment: (seg: SttSegment) => void,
    onError?: (e: Error) => void,
    onLevel?: (level: SttLevel) => void,
  ): Promise<SttSession>;
}

export interface TtsProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  synthesize(text: string): Promise<{ audio: Uint8Array; mime: string } | { played: true }>;
}

export interface PolishProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  polish(text: string, instruction?: string): Promise<string>;
}

export interface TranslateLoadProgress {
  /** 0..1 model download/init progress, when known. */
  progress?: number;
  text?: string;
}

export interface TranslateProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  /** Preload the model so the first translation isn't blocked on a big download. */
  warm(modelId?: string, onProgress?: (p: TranslateLoadProgress) => void): Promise<void>;
  /** Translate `text` into `targetLang` (a human language name, e.g. "English").
   *  `sourceLang` is an optional BCP-47 code (e.g. SenseVoice's detected "zh");
   *  when given, providers skip their own detection. */
  translate(text: string, targetLang: string, modelId?: string, sourceLang?: string, promptTemplate?: string): Promise<string>;
}

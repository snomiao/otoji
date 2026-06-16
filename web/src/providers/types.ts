export interface SttSegment {
  text: string;
  final: boolean;
}

export interface SttSession {
  sendAudio(pcm16kMonoFrame: Int16Array): void;
  stop(): Promise<void>;
}

export interface SttProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  /**
   * When true, the provider captures the microphone itself (e.g. the browser
   * Web Speech API) and the app must NOT run its own mic pump / `sendAudio`.
   * When false/undefined, the app captures the mic, downsamples to 16 kHz mono
   * s16le, and feeds frames via `SttSession.sendAudio`.
   */
  readonly capturesOwnAudio?: boolean;
  start(onSegment: (seg: SttSegment) => void, onError?: (e: Error) => void): Promise<SttSession>;
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

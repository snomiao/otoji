// @otoji/core — TypeScript API for speech ⇄ text.
//
// Low-level (napi-rs native):
export { PolishOptions, TranscribeOptions, polishText, transcribePcm } from "./index";

/** True if the platform-specific native binding loaded successfully. */
export declare function isNativeAvailable(): boolean;

/** The error captured the last time we tried to load the native binding,
 *  or `null` if it loaded successfully. */
export declare function nativeLoadError(): Error | null;

// ─── High-level API ───

export interface TranscribeResult {
  /** Full concatenated transcript. */
  text: string;
  /** Per-segment results from the recognizer. */
  segments: Array<{ text: string }>;
}

/**
 * Transcribe an audio file or buffer in one shot.
 *
 * Accepts a file path (WAV/PCM) or raw 16kHz mono f32 samples.
 * Internally loads the SenseVoice model and runs full-buffer decode.
 *
 * ```ts
 * import { transcribe } from "@otoji/core";
 * const { text } = await transcribe("meeting.wav");
 * ```
 */
export declare function transcribe(
  input: string | Buffer | Float32Array,
  opts?: { modelDir?: string; language?: string },
): Promise<TranscribeResult>;

export interface ListenEvent {
  type: "open" | "partial" | "final" | "closed";
  segId?: number;
  text?: string;
}

export interface ListenSession {
  /** Push 16kHz mono f32 PCM samples into the recognizer. */
  push(samples: Float32Array): void;
  /** Signal end of input. Flushes remaining audio. */
  end(): Promise<void>;
  /** Abort and free resources immediately. */
  close(): void;
}

/**
 * Create a streaming recognition session.
 *
 * Push audio chunks and receive events via callbacks. The session runs
 * the sliding-window SenseVoice architecture: Partials stream word-by-word,
 * Finals commit when sentence-ending punctuation stabilizes.
 *
 * ```ts
 * import { listen } from "@otoji/core";
 * const session = listen({
 *   onPartial: (text) => process.stdout.write(`\r${text}`),
 *   onFinal: (text) => console.log(`\n✓ ${text}`),
 * });
 * // Push mic audio chunks...
 * session.push(new Float32Array(samples));
 * // When done:
 * await session.end();
 * ```
 */
export declare function listen(opts?: {
  modelDir?: string;
  language?: string;
  onPartial?: (text: string, segId: number) => void;
  onFinal?: (text: string, segId: number) => void;
  onOpen?: () => void;
  onClosed?: () => void;
}): ListenSession;

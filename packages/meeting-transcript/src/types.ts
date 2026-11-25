export const SAMPLE_RATE = 16000;
export type MeetingTrack = "me" | "others";

/** Sample offsets use one meeting clock, including gaps and pauses. */
export interface PcmFrame {
  track: MeetingTrack;
  startSample: number;
  samples: Float32Array;
}

/** ASR timings are relative to this window, not wall time. */
export interface AudioWindow extends PcmFrame {}
export interface AsrSpan {
  startMs: number;
  endMs: number;
  text: string;
  lang?: string;
}
export type Transcribe = (window: AudioWindow, signal: AbortSignal) => Promise<readonly AsrSpan[]>;
export type Embed = (window: AudioWindow, signal: AbortSignal) => Promise<Float32Array | null>;

/** Advisory diarization labels are scoped to one meeting, never identity proofs. */
export interface MeetingLine {
  id: string;
  track: MeetingTrack;
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
  lang?: string;
}

export type TranscriptErrorCode =
  | "config"
  | "audio"
  | "timeline"
  | "busy"
  | "closed"
  | "aborted"
  | "provider"
  | "output";
export class TranscriptError extends Error {
  constructor(public readonly code: TranscriptErrorCode) {
    super(`Meeting transcript ${code}.`);
  }
}

export function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new TranscriptError("aborted");
}

/** Close promptly even when an injected native decoder cannot cancel its work. */
export async function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  checkAbort(signal);
  let stop!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(new TranscriptError("aborted"));
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        checkAbort(signal);
        return operation();
      }),
      aborted,
    ]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export function validateFrame(frame: PcmFrame, maxMs = 120000): void {
  if (
    !frame ||
    !["me", "others"].includes(frame.track) ||
    !Number.isSafeInteger(frame.startSample) ||
    frame.startSample < 0 ||
    !(frame.samples instanceof Float32Array) ||
    !frame.samples.length ||
    frame.samples.length > (maxMs * SAMPLE_RATE) / 1000 ||
    !Number.isSafeInteger(frame.startSample + frame.samples.length) ||
    frame.samples.some((n) => !Number.isFinite(n) || Math.abs(n) > 1)
  )
    throw new TranscriptError("audio");
}

export function validateSpans(spans: readonly AsrSpan[], durationMs: number): AsrSpan[] {
  if (!Array.isArray(spans) || spans.length > 4096) throw new TranscriptError("output");
  let previous = -1,
    characters = 0;
  return spans
    .map((span) => {
      if (
        !span ||
        typeof span.text !== "string" ||
        span.text.length > 16000 ||
        !Number.isFinite(span.startMs) ||
        !Number.isFinite(span.endMs) ||
        span.startMs < 0 ||
        span.endMs <= span.startMs ||
        span.endMs > durationMs + 1 ||
        span.startMs < previous ||
        (span.lang !== undefined &&
          (typeof span.lang !== "string" || !/^[a-zA-Z-]{1,32}$/.test(span.lang)))
      )
        throw new TranscriptError("output");
      previous = span.startMs;
      characters += span.text.length;
      if (characters > 16000) throw new TranscriptError("output");
      return {
        startMs: span.startMs,
        endMs: Math.min(durationMs, span.endMs),
        text: span.text.trim(),
        ...(span.lang ? { lang: span.lang } : {}),
      };
    })
    .filter((span) => span.text.length > 0);
}

/** No raw provider exceptions (which can contain transcripts or credentials). */
export function safeError(error: unknown): TranscriptError {
  return error instanceof TranscriptError ? error : new TranscriptError("provider");
}

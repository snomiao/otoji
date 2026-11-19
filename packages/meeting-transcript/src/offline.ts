import {
  SAMPLE_RATE,
  TranscriptError,
  abortable,
  checkAbort,
  safeError,
  validateFrame,
  validateSpans,
  type MeetingLine,
  type MeetingTrack,
  type PcmFrame,
  type Transcribe,
  type Embed,
} from "./types";
import { createDiarizer, type DiarizerOptions } from "./diarization";

export interface MeetingGap {
  track: MeetingTrack;
  startSample: number;
  endSample: number;
}
export interface MeetingWindowResult {
  track: MeetingTrack;
  startMs: number;
  endMs: number;
  lines: MeetingLine[];
}
export interface OfflineMeetingOptions {
  transcribe: Transcribe;
  embed?: Embed;
  windowMs?: number;
  overlapMs?: number;
  /** Skip below-threshold turn PCM on either track; zero disables this gate. */
  silenceRms?: number;
  diarization?: DiarizerOptions;
  onGap?: (gap: MeetingGap) => void;
  /** Successful, disjoint ownership ranges, including silence. Awaited for persistence backpressure. */
  onWindow?: (result: MeetingWindowResult) => void | Promise<void>;
}
interface TrackBuffer {
  track: MeetingTrack;
  samples: Float32Array;
  start: number;
  length: number;
  end: number | null;
  recent: MeetingLine[];
}
const millis = (sample: number) => Math.round((sample * 1000) / SAMPLE_RATE);
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

function deduplicate(previous: readonly MeetingLine[], line: MeetingLine): MeetingLine | null {
  let current = line;
  for (const old of previous) {
    if (old.endMs <= current.startMs || old.startMs >= current.endMs) continue;
    const before = normalize(old.text),
      after = normalize(current.text);
    if (before === after || before.endsWith(after)) return null;
    // Trimming requires exact normalized word boundaries and temporal overlap.
    const words = current.text.trim().split(/\s+/);
    for (let n = words.length - 1; n > 0; n--) {
      const prefix = normalize(words.slice(0, n).join(" "));
      if (before === prefix || before.endsWith(` ${prefix}`)) {
        const startMs = Math.max(current.startMs, old.endMs);
        if (startMs >= current.endMs) break;
        current = {
          ...current,
          id: `${current.track}:${startMs}`,
          startMs,
          text: words.slice(n).join(" "),
        };
        break;
      }
    }
  }
  return current;
}

/** Sequential ASR over owned <=12s buffers; source frames and whole meetings are never retained. */
export async function* transcribeMeeting(
  frames: AsyncIterable<PcmFrame>,
  options: OfflineMeetingOptions,
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<MeetingLine> {
  const windowMs = options.windowMs ?? 12000,
    overlapMs = options.overlapMs ?? 1000,
    silenceRms = options.silenceRms ?? 0.003;
  if (
    typeof options.transcribe !== "function" ||
    !Number.isFinite(windowMs) ||
    windowMs < 1500 ||
    windowMs > 12000 ||
    !Number.isFinite(overlapMs) ||
    overlapMs < 0 ||
    overlapMs >= windowMs / 2 ||
    !Number.isFinite(silenceRms) ||
    silenceRms < 0 ||
    silenceRms > 1
  )
    throw new TranscriptError("config");
  const capacity = Math.round((windowMs * SAMPLE_RATE) / 1000),
    overlap = Math.round((overlapMs * SAMPLE_RATE) / 1000);
  const diarizer = options.embed ? createDiarizer(options.embed, options.diarization) : null;
  const tracks = new Map<MeetingTrack, TrackBuffer>();
  const iterator = frames[Symbol.asyncIterator]();
  let iteratorDone = false;

  async function process(state: TrackBuffer, final = false): Promise<MeetingLine[]> {
    if (!state.length) return [];
    checkAbort(signal);
    const ownedStart = state.start,
      ownedEnd = state.start + state.length - (final ? 0 : overlap);
    const rangeStartMs = millis(ownedStart),
      rangeEndMs = millis(ownedEnd);
    if (rangeEndMs <= rangeStartMs) return [];
    const samples = state.samples.slice(0, state.length);
    const window = { track: state.track, startSample: state.start, samples };
    try {
      const turns =
        state.track === "others" && diarizer
          ? await diarizer.analyze(window, signal)
          : [
              {
                startSample: state.start,
                endSample: state.start + samples.length,
                speaker: state.track === "me" ? "me" : "unknown",
              },
            ];
      const lines: MeetingLine[] = [];
      for (const turn of turns) {
        const turnStart = Math.max(ownedStart, turn.startSample),
          turnEnd = Math.min(ownedEnd, turn.endSample);
        if (turnEnd <= turnStart) continue;
        // Whole-window ASR has no word alignment. Decode actual clipped turns instead of inventing it.
        const turnSamples = samples.slice(turnStart - state.start, turnEnd - state.start);
        try {
          let energy = 0;
          for (const sample of turnSamples) energy += sample * sample;
          if (Math.sqrt(energy / turnSamples.length) < silenceRms) continue;
          const spans = validateSpans(
            await abortable(
              () =>
                options.transcribe(
                  { track: state.track, startSample: turnStart, samples: turnSamples },
                  signal,
                ),
              signal,
            ),
            (turnSamples.length * 1000) / SAMPLE_RATE,
          );
          checkAbort(signal);
          for (const span of spans) {
            const startSample = turnStart + Math.round((span.startMs * SAMPLE_RATE) / 1000),
              endSample = turnStart + Math.round((span.endMs * SAMPLE_RATE) / 1000);
            const startMs = Math.max(rangeStartMs, millis(startSample)),
              endMs = Math.min(rangeEndMs, Math.max(startMs + 1, millis(endSample)));
            if (endMs <= startMs) continue;
            const line = deduplicate([...state.recent, ...lines], {
              id: `${state.track}:${startMs}`,
              track: state.track,
              startMs,
              endMs,
              speaker: turn.speaker,
              text: span.text,
              ...(span.lang ? { lang: span.lang } : {}),
            });
            if (!line) continue;
            const previous = lines.at(-1);
            if (previous && previous.startMs === line.startMs) {
              previous.endMs = Math.max(previous.endMs, line.endMs);
              previous.text += ` ${line.text}`;
              if (previous.speaker !== line.speaker) previous.speaker = "unknown";
            } else if (
              previous &&
              previous.speaker === line.speaker &&
              previous.lang === line.lang &&
              line.startMs >= previous.endMs &&
              line.startMs - previous.endMs <= 250
            ) {
              previous.text += ` ${line.text}`;
              previous.endMs = line.endMs;
            } else lines.push(line);
          }
        } finally {
          turnSamples.fill(0);
        }
      }
      checkAbort(signal);
      if (options.onWindow)
        await abortable(async () => {
          await options.onWindow!({
            track: state.track,
            startMs: rangeStartMs,
            endMs: rangeEndMs,
            lines,
          });
        }, signal);
      checkAbort(signal);
      state.recent = [...state.recent, ...lines]
        .filter((line) => line.endMs > rangeEndMs - overlapMs)
        .slice(-128);
      return lines;
    } finally {
      samples.fill(0);
    }
  }

  try {
    while (true) {
      const next = await abortable(() => iterator.next(), signal);
      if (next.done) {
        iteratorDone = true;
        break;
      }
      const frame = next.value;
      checkAbort(signal);
      validateFrame(frame);
      let state = tracks.get(frame.track);
      if (!state) {
        state = {
          track: frame.track,
          samples: new Float32Array(capacity),
          start: frame.startSample,
          length: 0,
          end: null,
          recent: [],
        };
        tracks.set(frame.track, state);
      }
      if (state.end !== null && frame.startSample < state.end)
        throw new TranscriptError("timeline");
      const expected = state.end ?? 0;
      if (frame.startSample > expected) {
        for (const line of await process(state, true)) {
          checkAbort(signal);
          yield line;
        }
        state.samples.fill(0);
        state.length = 0;
        state.start = frame.startSample;
        state.recent = [];
        options.onGap?.({
          track: frame.track,
          startSample: expected,
          endSample: frame.startSample,
        });
      }
      state.end = frame.startSample + frame.samples.length;
      let offset = 0;
      while (offset < frame.samples.length) {
        checkAbort(signal);
        if (!state.length) state.start = frame.startSample + offset;
        const size = Math.min(capacity - state.length, frame.samples.length - offset);
        state.samples.set(frame.samples.subarray(offset, offset + size), state.length);
        state.length += size;
        offset += size;
        if (state.length === capacity) {
          for (const line of await process(state)) {
            checkAbort(signal);
            yield line;
          }
          state.samples.copyWithin(0, capacity - overlap, capacity);
          state.samples.fill(0, overlap);
          state.start += capacity - overlap;
          state.length = overlap;
        }
      }
    }
    for (const state of tracks.values())
      for (const line of await process(state, true)) {
        checkAbort(signal);
        yield line;
      }
  } catch (error) {
    throw safeError(error);
  } finally {
    for (const state of tracks.values()) {
      state.samples.fill(0);
      state.recent.length = 0;
    }
    tracks.clear();
    diarizer?.reset();
    if (!iteratorDone) {
      // Do not let an uncooperative source's return() delay zeroing or cancellation.
      try {
        void Promise.resolve(iterator.return?.()).catch(() => {});
      } catch {
        /* Source cleanup errors are never logged. */
      }
    }
  }
}

import { joinAsrText, trimTranscriptOverlap } from "./overlap";
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
} from "./types";

export interface LiveOptions {
  transcribe: Transcribe;
  onDraft(line: MeetingLine | null, track: MeetingTrack): void;
  onStable(lines: MeetingLine[]): void;
  onGap?(gap: { track: MeetingTrack; startSample: number; endSample: number }): void;
  onStatus?(event: {
    kind: "draft-regressed";
    track: MeetingTrack;
    startMs: number;
    endMs: number;
  }): void;
  windowMs?: number;
  stepMs?: number;
  overlapMs?: number;
  silenceRms?: number;
}
type TrackState = {
  buffer: Float32Array;
  start: number;
  end: number | null;
  ownerStart: number;
  decodedEnd: number;
  draft: MeetingLine | null;
  previous: MeetingLine | null;
  busy: boolean;
};
const fresh = (): TrackState => ({
  buffer: new Float32Array(),
  start: 0,
  end: null,
  ownerStart: 0,
  decodedEnd: 0,
  draft: null,
  previous: null,
  busy: false,
});

/** A continuous meeting is a sequence of overlapping bounded decoder windows.
 * push is backpressured; capture and durable recording remain the host's job. */
export function createLiveTranscriber(options: LiveOptions) {
  const windowMs = options.windowMs ?? 12000,
    stepMs = options.stepMs ?? 2000,
    overlapMs = options.overlapMs ?? 2000,
    silenceRms = options.silenceRms ?? 0.003;
  if (
    ![windowMs, stepMs, overlapMs, silenceRms].every(Number.isFinite) ||
    windowMs < 1000 ||
    windowMs > 12000 ||
    stepMs < 100 ||
    stepMs > windowMs ||
    overlapMs < 0 ||
    overlapMs >= windowMs ||
    silenceRms < 0 ||
    silenceRms > 1
  )
    throw new TranscriptError("config");
  const capacity = Math.round((windowMs * SAMPLE_RATE) / 1000),
    step = Math.round((stepMs * SAMPLE_RATE) / 1000),
    overlap = Math.round((overlapMs * SAMPLE_RATE) / 1000);
  const state: Record<MeetingTrack, TrackState> = { me: fresh(), others: fresh() };
  const controller = new AbortController();
  let closed = false;
  const ready = () => {
    if (closed) throw new TranscriptError("closed");
    checkAbort(controller.signal);
  };
  const reset = (s: TrackState, at: number) => {
    s.buffer.fill(0);
    s.buffer = new Float32Array();
    s.start = at;
    s.end = at;
    s.ownerStart = at;
    s.decodedEnd = at;
    s.draft = null;
    s.previous = null;
  };
  async function decode(track: MeetingTrack, s: TrackState) {
    ready();
    if (s.end === null || s.end <= s.ownerStart || !s.buffer.length) return;
    let energy = 0;
    for (const n of s.buffer) energy += n * n;
    if (Math.sqrt(energy / s.buffer.length) < silenceRms) {
      s.draft = null;
      s.decodedEnd = s.end;
      options.onDraft(null, track);
      return;
    }
    const owned = s.buffer.slice();
    try {
      const spans = validateSpans(
        await abortable(
          () =>
            options.transcribe({ track, startSample: s.start, samples: owned }, controller.signal),
          controller.signal,
        ),
        (owned.length / SAMPLE_RATE) * 1000,
      );
      ready();
      const parts = spans.filter(
        (span) => (s.start / SAMPLE_RATE) * 1000 + span.endMs > (s.ownerStart / SAMPLE_RATE) * 1000,
      );
      const text = joinAsrText(parts.map((span) => span.text));
      const startMs = Math.round((s.ownerStart / SAMPLE_RATE) * 1000),
        endMs = Math.round((s.end / SAMPLE_RATE) * 1000);
      const raw: MeetingLine = {
        id: `${track}:${startMs}`,
        track,
        startMs: Math.round((s.start / SAMPLE_RATE) * 1000 + (parts[0]?.startMs ?? 0)),
        endMs,
        speaker: track === "me" ? "me" : "unknown",
        text,
        ...(parts[0]?.lang ? { lang: parts[0].lang } : {}),
      };
      const line = text ? trimTranscriptOverlap(s.previous, raw) : null;
      if (line) {
        line.startMs = Math.max(startMs, line.startMs);
        line.id = `${track}:${line.startMs}`;
      }
      if (s.draft && (!line || line.text.length < s.draft.text.length * 0.6)) {
        s.draft = { ...s.draft, endMs };
        options.onStatus?.({ kind: "draft-regressed", track, startMs, endMs });
      } else s.draft = line;
      s.decodedEnd = s.end;
      options.onDraft(s.draft, track);
    } catch (error) {
      throw safeError(error);
    } finally {
      owned.fill(0);
    }
  }
  async function commit(track: MeetingTrack, s: TrackState) {
    if (s.end === null || s.end <= s.ownerStart) return;
    if (s.decodedEnd !== s.end) await decode(track, s);
    ready();
    if (s.draft) {
      const line = { ...s.draft };
      options.onStable([line]);
      ready();
      s.previous = line;
    }
    s.draft = null;
    options.onDraft(null, track);
  }
  async function flushTrack(track: MeetingTrack, s: TrackState) {
    await commit(track, s);
    const end = s.end ?? 0;
    reset(s, end);
  }
  return {
    async push(frame: PcmFrame): Promise<void> {
      ready();
      validateFrame(frame);
      const s = state[frame.track];
      if (s.busy) throw new TranscriptError("busy");
      if (s.end !== null && frame.startSample < s.end) throw new TranscriptError("timeline");
      s.busy = true;
      try {
        if (s.end !== null && frame.startSample > s.end) {
          const from = s.end;
          await flushTrack(frame.track, s);
          options.onGap?.({ track: frame.track, startSample: from, endSample: frame.startSample });
        }
        if (!s.buffer.length) {
          s.start = frame.startSample;
          s.end = frame.startSample;
          s.ownerStart = frame.startSample;
          s.decodedEnd = frame.startSample;
        }
        for (let at = 0; at < frame.samples.length; ) {
          ready();
          const count = Math.min(capacity - s.buffer.length, frame.samples.length - at);
          const next = new Float32Array(s.buffer.length + count);
          next.set(s.buffer);
          next.set(frame.samples.subarray(at, at + count), s.buffer.length);
          s.buffer.fill(0);
          s.buffer = next;
          at += count;
          s.end = frame.startSample + at;
          if (s.end - s.decodedEnd >= step || s.buffer.length === capacity)
            await decode(frame.track, s);
          if (s.buffer.length === capacity) {
            await commit(frame.track, s);
            const end = s.end;
            const retained = s.buffer.slice(capacity - overlap);
            s.buffer.fill(0);
            s.buffer = retained;
            s.start = end - overlap;
            s.ownerStart = end;
            s.decodedEnd = end;
          }
        }
      } catch (error) {
        throw safeError(error);
      } finally {
        s.busy = false;
      }
    },
    async flush(track?: MeetingTrack): Promise<void> {
      ready();
      const tracks: MeetingTrack[] = track ? [track] : ["me", "others"];
      if (tracks.some((t) => state[t].busy)) throw new TranscriptError("busy");
      for (const t of tracks) state[t].busy = true;
      try {
        for (const t of tracks) await flushTrack(t, state[t]);
      } finally {
        for (const t of tracks) state[t].busy = false;
      }
    },
    bufferedSamples(): number {
      return state.me.buffer.length + state.others.buffer.length;
    },
    close(): void {
      if (closed) return;
      closed = true;
      controller.abort();
      for (const s of Object.values(state)) {
        s.buffer.fill(0);
        s.buffer = new Float32Array();
        s.draft = null;
        s.previous = null;
      }
    },
  };
}

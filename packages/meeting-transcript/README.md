# @otoji/meeting-transcript

Private, unpublished meeting transcription primitives for a consuming
application's pinned Otoji git submodule. This package captures, uploads,
stores and plays nothing. The application supplies explicitly chosen ASR and
embedding providers on its own infrastructure; no endpoint or cloud fallback
is built in. Transcript text never goes to a command parser or chat hub.

## Input and ownership

All input is finite mono float32 PCM in [-1,1], sampled at 16 kHz. Frames
carry `track: 'me' | 'others'`, an absolute `startSample` on the meeting clock,
and `samples`. Offsets remain absolute across pauses and gaps. Out-of-order
or overlapping frames are rejected; gaps are reported and never zero-filled.
Source frames may contain at most 120 seconds. The SDK keeps at most one
12-second buffer per track, independent of meeting length.

`Transcribe(window, signal)` returns `AsrSpan[]` with millisecond timings
relative to that exact supplied window. A provider returning only a full
window's text must return a full-window span; decoder runtime is not a word
timestamp. `Embed(window, signal)` returns a speaker vector or null. Both
providers receive owned copies, which are cleared after completion or abort;
the caller's original PCM remains usable for durable recording.

## Live captions

```ts
import { createLiveTranscriber } from "./vendor/otoji/packages/meeting-transcript/dist/index.js";

const live = createLiveTranscriber({
  transcribe: approvedSpeechProvider,
  onDraft: (line, track) => showEphemeralCaption(track, line),
  onStable: (lines) => enqueueOwnAccountLines({ source: "live", lines }),
  onGap: (gap) => showCaptionGap(gap),
});
await live.push({ track: "me", startSample: offset, samples });
await live.flush();
live.close();
```

The default decoder window is 12 seconds, advances every 2 seconds and
retains 2 seconds of context when it rolls. The meeting itself has no short
utterance cutoff. Drafts are replaced in memory; only stable windows go to
`onStable`. A substantially truncated decode preserves a fuller draft and
emits `draft-regressed`, leaving final correction to the post-meeting pass.

`push` applies per-track backpressure and refuses concurrent calls. A capture
host must bound its own pending live queue, display a lag/gap when full, and
continue its durable recorder independently. It must not block capture or
silently discard archive audio because caption decoding is slow.

Overlapping full-window text uses exact normalized suffix/prefix matching;
unmatched text is preserved. Precise timed spans avoid matching a legitimate
repeat spoken later. This is conservative stitching, not forced word alignment.

## Final transcript and speaker turns

```ts
import { transcribeMeeting } from "./vendor/otoji/packages/meeting-transcript/dist/index.js";

for await (const line of transcribeMeeting(
  decodedFrames,
  {
    transcribe: approvedSpeechProvider,
    embed: approvedLocalEmbeddingProvider,
    onWindow: async ({ track, startMs, endMs, lines }) => {
      await writeOwnAccountLines({
        source: "final",
        lines,
        replace: { track, startMs, endMs },
      });
    },
  },
  abortSignal,
)) {
  showFinalLine(line);
}
```

The source is an async iterator of bounded decoded chunks, consumed
sequentially. Each audio-only source container must be independently
decodable, with sequence and meeting start/duration metadata. Concatenating a
headerless MediaRecorder `timeslice` fragment is not decoding one chunk.
Decoding, downsampling and archive fetching belong to the host.

Final analysis windows overlap, but each completed window owns a disjoint
prefix of the timeline; the last tail is flushed. `onWindow` is awaited before
the next window. It is called for completed silence too, with `lines: []`,
so an atomic replacement can remove stale live text. Failed or aborted
windows never request replacement. Every emitted line fits its ownership
range and has integer millisecond times with id `track:startMs`.

Both tracks skip below-threshold PCM before ASR (`silenceRms: 0.003` by
default, configurable; zero disables the energy gate). This is a minimal
silence guard, not a trained speech/noise detector. The host may supply
stronger VAD and quality gates inside its approved provider.

The `me` track stays `me`. On `others`, overlapping 2-second vectors (1-second
hop by default) form bounded meeting-local cosine clusters A, B, C….
Classification uses the nearest center, a configurable match threshold and
an ambiguity margin; uncertainty, invalid embeddings, low signal and a full
cluster budget produce `unknown`. A failed embedding provider does not
discard speech text. Speaker turns are detected before ASR, so even a
whole-window ASR provider decodes actual clipped turn audio rather than
having guessed word timestamps assigned afterwards.

These labels are advisory and scoped to this meeting. They do not identify
accounts, prove identity, distinguish simultaneous speakers or separate their
audio. Short/fast interjections and boundary words still need real-speech
calibration. Threshold defaults are starting values, not measured error rates.
Closing the iterator clears its PCM and cluster centroids.

## Build and verify

Use Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun run test
bun run build
```

Build runs pinned tsrs, bundles dependency-free browser ESM, emits declarations
and compiles a consumer against `dist/`. Tests use generated PCM and
deterministic providers only: long continuous streams, ownership ranges,
speaker changes, uncertainty, gaps, backpressure and cancellation. They do
not establish real-meeting ASR accuracy or device performance. No model,
recording, account content or production asset is bundled or deployed.

# Browser voiceprint SDK: local O3 spike

This is the first local O3 experiment, not completion of mobile acceptance or
the voice service. The architecture boundary is code only: Otoji supplies the
SDK and eventual server/container code as a pinned git submodule; the consuming
application owns its service domain, Cloudflare resources, identity and usage
booking. Nothing in this change deploys a service, uploads model assets,
publishes an npm package, changes a signing key or migrates enrolled voices.

The package is `packages/voiceprint-web`. Its README covers API use, consent,
model provenance and the advisory trust boundary. There are no raw audio uploads,
microphone capture calls, playback calls or account APIs in the SDK.

## What was actually measured

Local desktop Chromium, module Worker, WASM single-threaded ONNX Runtime Web
1.27.0; synthetic 3-second PCM with deterministic tones and noise. Loopback
serves the model, runtime and test input; the browser was muted and no real
microphone, speech recording or paid API was used.

| observation | local result |
| --- | --- |
| official Chinese/English CAM++ fp32 weight size | 28,281,164 bytes |
| SHA-256 | `aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2` |
| artifact verification + WASM/model initialization | 343 ms (loopback/cached, not a mobile cold start) |
| first 3-second extraction | 109 ms |
| second extraction | 88 ms |
| output | 192 finite, L2-normalized floats; `trust: device` |
| cosine vs native sherpa-onnx 2.0.1 on identical synthetic PCM | approximately 1.0 |
| caller PCM after worker transfer | intact; 192,000 bytes |
| off-device or POST requests during the check | zero |
| browser page errors | zero |

The browser check also compared a separately prepared Python ONNX Runtime
1.31.1 reference and obtained cosine 0.9757. The native sherpa comparison and
WASM matched, but that separate reference path has not been reconciled. These
measurements do not establish equivalence across every runtime or device.

The filterbank has a separate native oracle test: reflected edges, Povey
window, -400 Hz upper offset, epsilon energy floor, 80 bins and per-bin
utterance mean. Selected frames from native `get_frames` agree within 0.0001
(observed maximum across the full synthetic matrix about 0.000037). The fixture
contains synthetic numbers only, with model hash and reference version.

## What remains before use beyond a local spike

- Real iPhone size, initialization, inference latency, memory and cancellation
  checks. Desktop Chromium and emulation cannot substitute for them.
- Approved real-speech calibration and comparison with the current native
  recognizer across devices, noise and speaker changes. A synthetic cosine is
  an implementation check, not a false-accept/false-reject measurement.
- An int8 artifact and the required score-shift acceptance test (at most 0.02).
  No official int8 artifact was found in the upstream speaker-model release,
  and this package currently enables only fp32. The earlier 8 MB figure remains
  an estimate for a future quantization, not a measured download.
- Consumer-hosted, versioned model and WASM assets with explicit consent and
  the application's VAD/noise gates. This SDK never grants an approval or a
  trusted speaker check mark.
- Integration and deployment review in the consuming application. The package
  remains private/unpublished, and CI checks code only.

## Reproduce the code checks

In `packages/voiceprint-web`:

```sh
bun install --frozen-lockfile
bun run test
bun run build
```

Build runs pinned tsrs, bundles the shared DSP implementation, emits public
declarations and typechecks a consumer against `dist/`. The root web app keeps
its existing filterbank import path through a re-export; its previous frontend
parameters and algorithm are unchanged.

Model/reference sources are linked in the package README. Real model weights
are intentionally absent from test fixtures and git history.

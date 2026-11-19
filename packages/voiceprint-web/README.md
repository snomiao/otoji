# @otoji/voiceprint-web — local browser spike

Consent-gated CAM++ feature extraction, run inside an application-owned Web
Worker. This is a private, unpublished package prototype. It neither captures a
microphone nor creates identity proofs. Every result has `trust: "device"`:
avatars and advisory filtering only, never approvals or authenticated identity.

The consuming application owns its domain, model/WASM hosting, accounts and
services. There are no otoji.org endpoints, accounts, keys or remote inference
fallbacks in this package. Audio stays in the browser. The worker client copies
PCM before transferring it, so the same original utterance remains available to
transcription. Temporary worker PCM and computed feature arrays are cleared
after inference. The embedding returned to the caller is biometric data; the
application remains responsible for consent, isolation, retention and deletion.

## Consume from a git submodule

Use Bun 1.4.4 to build this directory after checking out the pinned Otoji
submodule revision:

```sh
bun install --frozen-lockfile
bun run build
bun run test
```

Import `dist/index.js` through the application's submodule path. The bundle
contains its DSP frontend; `onnxruntime-web` **1.27.0** is the sole runtime peer.
Copy that dependency's `dist/` runtime files to the application's own static
hosting. The model and WASM base must share the same configured HTTPS origin
(HTTP loopback is allowed for local tests). Query strings, URL credentials and
redirects are rejected. No third-party CDN default is installed.

Create an application-owned module worker entry:

```ts
import { installVoiceprintWorker } from "./vendor/otoji/packages/voiceprint-web/dist/index.js";
installVoiceprintWorker(self);
```

Then, from an explicit consent/start action:

```ts
import { createVoiceprintWorkerClient } from "./vendor/otoji/packages/voiceprint-web/dist/index.js";

const worker = new Worker(new URL("./voiceprint.worker.ts", import.meta.url), { type: "module" });
const client = createVoiceprintWorkerClient(worker);
await client.warm({
  model: {
    id: "campp-zh-en-fp32-v1",
    url: "https://app.example.test/models/campp.onnx",
    bytes: 28281164,
    sha256: "aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2",
    precision: "fp32",
  },
  wasmBaseUrl: "https://app.example.test/ort/",
}, true); // application has just obtained explicit consent

const result = await client.extract(utterancePcm16kMono);
// {v: 1, trust: "device", model, dimension: 192, audioMs, embedding: Float32Array}
client.dispose(); // terminates the dedicated worker owned by this client
```

Importing or constructing the SDK does not download a model. `warm(false)` is
refused. Model bytes are bounded and checked against the manifest's exact size
and SHA-256 before initializing ONNX. Inference accepts finite mono 16 kHz PCM
in [-1,1], between 1.2 seconds (configurable) and 30 seconds, one call at a
time. The application supplies VAD and quality/noise gates; this SDK does not
decide whether the signal is speech or who spoke.

An AbortSignal rejects the caller promptly in the Worker client, but native
WASM inference already in progress finishes before another extraction is
accepted. `dispose()` terminates the worker and discards pending results. Use a
fresh worker to switch models or asset configuration. Do not mix runtime asset
versions in one worker.

## Preprocessing and model provenance

CAM++ uses 80 mel bins, a Povey window, high-frequency offset -400 Hz,
reflection at utterance edges, a float-epsilon log-energy floor, and per-bin
utterance mean subtraction. This differs from SenseVoice's Hamming/snip-edge
frontend. The unchanged shared filterbank implementation lives in this package;
the existing web app re-exports its previous API.

The local spike uses the official
[CAM++ Chinese/English fp32 model](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx).
Its actual size is **28,281,164 bytes**. No official int8 variant was found in
that release. Weights and WASM assets are not bundled or published by this PR.
The consuming application must supply approved, versioned model assets.

Native frontend references:
[speaker extractor](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/sherpa-onnx/csrc/speaker-embedding-extractor-general-impl.h),
[feature defaults](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.1/sherpa-onnx/csrc/features.h).
The unit fixture was generated from synthetic tones and deterministic noise,
with sherpa-onnx 2.0.1. It contains no recorded person's voice.

## Acceptance still required

This spike does not establish speaker accuracy, spoof resistance, calibrated
thresholds or mobile performance. Real iPhone timing and the design's int8
score-shift test (at most 0.02 on approved calibration samples) remain open.
Only fp32 is enabled here. See `docs/VOICEPRINT-BROWSER-SPIKE.md` for measured
local results and their limits. Nothing is deployed or published automatically.

## Local browser benchmark

This uses generated tones/noise only. With the documented public model already
saved locally:

```sh
bun run bench -- --model /path/to/campp.onnx
```

In another terminal, pass the loopback URL printed by that command:

```sh
bun run bench:check -- http://127.0.0.1:PORT
```

The check launches headless Chromium with audio muted, verifies the caller's
PCM is intact and fails on off-device or non-GET requests. Install the
Playwright Chromium binary locally if it is not already available. To reuse a
compatible local Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
explicitly when running the check.

For a native comparison, save the server's `/synthetic.f32` and run
`bench/reference.py --model … --pcm … --output reference.json` using an isolated
Python environment with numpy and sherpa-onnx 2.0.1. Restart the local benchmark
with `--reference /path/to/reference.json`; `bench:check` then also requires
cosine at least 0.999 against that native synthetic reference. No model or
benchmark server is deployed by these commands.

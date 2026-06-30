# otoji (音字)

> realtime speech ⇄ text — *音を字に*

**[otoji.org](https://otoji.org)** — wire `mic → STT → translate → speech` as a
**voice graph** that runs **on your devices**. No accounts, no API keys, nothing
leaves the browser by default: ASR, translation, and TTS all run on-device
(transformers.js / onnxruntime-web / WebGPU / WASM).

Join a **room** and the graph spans your devices: a phone captures the mic, a
laptop runs SenseVoice, any device speaks the result — chained over a WebRTC
P2P mesh, Google-Meet-style shareable URLs (`otoji.org/keen-gibbon-4a0d`).

```text
   phone                         laptop                        any device
 ┌─────────┐   opus/segment    ┌──────────────┐   transcript  ┌──────────┐
 │ Mic+VAD ├══════════════════>│ SenseVoice    ├═════════════>│ Translate │──► 🔊 / 📝 / .srt
 └─────────┘   WebRTC (P2P)    │ STT           │   WebRTC      └──────────┘
                               └──────────────┘
```

## Try it

- **[otoji.org](https://otoji.org)** — create/join a room, or hit **"Try it here"**
  to run the whole graph locally on one device (no room needed).
- **[otoji.org/?simple](https://otoji.org/?simple)** — minimal one-box live
  transcription, no graph editor.

## How it works

Each **node** has typed ports — `segment` (audio) or `transcript` (text) — and an
edge is valid only when the source output type matches the target input type.
Same-device edges run in-process; **cross-device edges become a WebRTC data
channel** carrying audio segments + transcript frames. The graph itself is
authoritative state, synced live to every device in the room through a
Cloudflare **Durable Object** (the only server; it relays signaling + graph
patches, never your audio).

### Node catalog

| Category | Nodes |
|---|---|
| **Input** | Mic + VAD · Mic (raw, no VAD) · Audio file in (drop or URL) · Text file in |
| **Speech → Text** | SenseVoice STT (ONNX, multilingual + emotion/event tags) · Web Speech (browser streaming) · Vosk (Kaldi/WASM streaming) |
| **Text → Text** | Translate — in-browser LLM (WebLLM) or the browser Translator API |
| **Text → Speech** | Text-to-Speech (browser SpeechSynthesis) · Neural TTS (on-device ONNX MMS-TTS) |
| **Output** | Transcript + Recordings · Audio file (out) · SRT subtitles (out) · Speaker (play) |
| **Custom** | Any transformers.js model by repo/URL (ASR / text2text / TTS) |
| **Pipe** | CLI stdio bridge — wire a terminal into the graph via `otoji node` |

Models download once per device and can be **shared P2P within a room**, so only
one device pays the download cost.

## Local-first

Everything runs locally by default — no API keys, no cloud, no internet. Cloud
providers (Anthropic / OpenAI / iFlytek / ElevenLabs / Gemini) are **opt-in
fallbacks** you can configure with your own keys, stored only in your browser.
Resolution order for every component: **local in-process > local server >
cloud API > disabled**. See [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## CLI: bridge a terminal into a graph

The **CLI pipe** node bridges any terminal's stdio to the graph over the
signaling relay (no WebRTC needed) — copy the command shown on the node:

```bash
npx otoji node otoji.org/keen-gibbon-4a0d/pipe-ab12   # text in graph → stdout; stdin → graph
otoji node my-room | grep foo                          # consume transcripts
some-producer | otoji node my-room                     # feed text in
```

## `@otoji/core` — Node/Bun bindings

The Rust core also ships as an npm package with napi-rs bindings for one-shot
and streaming on-device SenseVoice:

```ts
import { transcribe, listen } from "@otoji/core";

const { text } = await transcribe("meeting.wav");      // one-shot

const session = listen({                               // streaming
  onPartial: (t) => process.stdout.write(`\r${t}`),
  onFinal:   (t) => console.log(`\n✓ ${t}`),
});
session.push(pcmFloat32);                               // 16kHz mono f32
await session.end();
```

## Repository layout

| Path | What |
|---|---|
| `web/` | The otoji.org app — React Flow voice-graph editor, WebRTC mesh, on-device providers, plus a browser extension + userscript |
| `signal/` | Cloudflare Worker + `RoomDurableObject` — presence, SDP/ICE relay, authoritative graph state |
| `src/` | Rust core — SenseVoice ASR, VAD, TTS, LLM polish; `cpal`/`ratatui` desktop CLI; napi bindings |
| `cli/otoji-node.mjs` | `otoji node` — the stdio↔graph bridge |
| `docs/` | Architecture rationale, RT-ASR/model benchmarks, roadmap |

See [`TODO.md`](./TODO.md) for the distributed voice-graph design and milestone
status, and [`docs/`](./docs/README.md) for the deeper architecture/benchmark notes.

## Develop

```bash
# Web app
cd web && pnpm install && pnpm dev          # http://localhost:5173
pnpm test                                   # vitest
pnpm test:e2e                               # playwright

# Rust core / desktop CLI
cargo build --release
cargo run -- listen                         # live mic → on-device STT in the TUI
```

## License

MIT

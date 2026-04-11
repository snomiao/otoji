# otoji Roadmap

## Principle: Local-First

**Everything runs locally by default. No API keys, no cloud, no internet
required.** Cloud providers (Anthropic, OpenAI, ElevenLabs, etc.) are opt-in
fallbacks for users who choose to configure them.

| Component | Local default | Cloud opt-in |
|-----------|---------------|--------------|
| **ASR** | SenseVoice (sherpa-onnx, in-process) | iFlytek RTASR |
| **TTS** | Piper VITS (sherpa-onnx, in-process) | OpenAI / ElevenLabs / Gemini / iFlytek |
| **Polish** | Ollama / any local OpenAI-compat server | Anthropic Claude |
| **Polish (future)** | candle / llama.cpp in-process | — |

Resolution order for every component: **local in-process > local server
(Ollama) > cloud API > noop/disabled**.

## Vision

otoji = **pure-compute core** + **thin platform adapters**.

The core handles all inference (ASR, TTS, VAD) and text processing (LLM polish)
with zero I/O — it takes PCM samples in and emits events/audio out.
Each platform adapter owns I/O (mic, speaker, files, network) and drives the core.

**Same-process by default.** When you run `otoji listen` on a Mac, cpal captures
audio and feeds core directly — no server, no IPC, no overhead. The server mode
is an opt-in deployment for remote/browser/mobile clients.

```
                   ┌───────────────────────────────┐
                   │         otoji-core             │
                   │                                │
                   │  feed(&[i16]) → AsrEvent       │
                   │  synthesize(&str) → Vec<i16>   │
                   │  polish(&str) → String          │
                   │                                │
                   │  No I/O. No network. No cpal.  │
                   │  WASM-compatible.              │
                   └───────────┬────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼──────┐ ┌───────▼───────┐
     │ otoji-desktop  │ │ otoji-server│ │ otoji-web     │
     │ (native CLI)   │ │ (WS/gRPC)  │ │ (WASM+JS)     │
     │                │ │             │ │               │
     │ cpal mic/spk   │ │ hosts core  │ │ WebAudio API  │
     │ file I/O       │ │ serves API  │ │ wasm-pack     │
     │ TUI (ratatui)  │ │             │ │ or thin WS    │
     │                │ │             │ │ client        │
     │ in-process     │ │             │ │               │
     │ core — no      │ │             │ │               │
     │ server needed  │ │             │ │               │
     └────────────────┘ └─────────────┘ └───────────────┘
```

### Deployment modes

| Mode | Description | Core location |
|------|-------------|---------------|
| **Native CLI** | `otoji listen` on Mac/Linux/Win. Everything in one process. | in-process |
| **Node/Bun lib** | `require("@otoji/core")`. napi-rs binding, same process. | in-process |
| **Server + thin client** | Server runs core. Clients send audio over WS. | server |
| **Browser (WASM)** | Core compiled to WASM, runs in browser. WebAudio captures mic. | in-browser |
| **Browser (remote)** | Lightweight JS client sends mic audio to server over WS. | server |
| **Mobile** | Same as native (Rust via FFI) or remote (thin client to server). | either |

---

## Current state (v0.1)

Monolithic single crate. Everything in one `src/`:

```
src/
├── core.rs          # types: AudioFormat, AsrEvent, OtojiError
├── audio/
│   ├── mic.rs       # cpal capture (platform-specific)
│   └── file.rs      # PCM/WAV file reader
├── asr/
│   ├── sensevoice.rs   # sherpa-onnx offline ASR (worker thread)
│   └── iflytek_rtasr.rs # iFlytek WebSocket ASR
├── tts/
│   ├── piper.rs     # local TTS (sherpa-onnx)
│   ├── openai.rs    # OpenAI TTS API
│   ├── elevenlabs.rs
│   ├── gemini.rs
│   └── iflytek_tts.rs
├── polish.rs        # Anthropic LLM polisher
├── tui.rs           # ratatui live display
├── napi.rs          # Node.js bindings (feature-gated)
└── main.rs          # CLI entry point
```

**Problem**: `mic.rs` (cpal), `tui.rs` (ratatui), `main.rs` (clap) are not
WASM-compatible, and they're tangled with the inference code.

---

## Phase 1 — Extract `otoji-core` (pure compute)

**Goal**: Split into workspace. `otoji-core` compiles to WASM.

### 1.1 Define the core boundary

Core contains **only**:
- `core.rs` — types (`AudioFormat`, `AsrEvent`, `AudioChunk`, errors)
- `asr/sensevoice.rs` — offline ASR (sherpa-onnx, WASM-compatible)
- `tts/piper.rs` — local TTS (sherpa-onnx, WASM-compatible)
- `polish.rs` — LLM polish (uses `reqwest` or injected HTTP client)
- VAD logic (currently inside sensevoice, may extract)

Core does **NOT** contain:
- `audio/mic.rs` (cpal — platform-specific)
- `audio/file.rs` (filesystem)
- `tui.rs` (ratatui — terminal-specific)
- `main.rs` (CLI — clap, terminal)
- `napi.rs` (Node.js — napi-rs)
- Cloud TTS/ASR providers (iflytek, openai, elevenlabs, gemini — these use network but could be optional features)

### 1.2 Core API surface

```rust
// otoji-core/src/lib.rs

/// Push-based ASR engine. No I/O — caller feeds audio, receives events.
pub struct AsrEngine { /* ... */ }

impl AsrEngine {
    /// Load model from bytes (caller handles fetch/read).
    pub fn new(model: &[u8], config: AsrConfig) -> Result<Self>;

    /// Feed PCM samples. Returns events generated by this chunk.
    /// Caller controls timing — real-time pacing is adapter's job.
    pub fn feed(&mut self, samples: &[i16]) -> Vec<AsrEvent>;

    /// Signal end of audio. Flushes any buffered partial.
    pub fn flush(&mut self) -> Vec<AsrEvent>;
}

/// Push-based TTS engine.
pub struct TtsEngine { /* ... */ }

impl TtsEngine {
    pub fn new(model: &[u8], config: TtsConfig) -> Result<Self>;
    pub fn synthesize(&self, text: &str) -> Vec<i16>;
}

/// LLM polisher. Needs an HTTP client injected (fetch in WASM, reqwest native).
pub struct Polisher { /* ... */ }

impl Polisher {
    pub fn new(config: PolishConfig, http: Box<dyn HttpClient>) -> Self;
    pub async fn polish(&self, text: &str) -> Result<String>;
}

/// Trait for HTTP calls — implemented by reqwest (native) or fetch (WASM).
pub trait HttpClient: Send + Sync {
    async fn post(&self, url: &str, body: &[u8], headers: &[(&str, &str)]) -> Result<Vec<u8>>;
}
```

### 1.3 Workspace layout

```
Cargo.toml              # [workspace]
crates/
├── otoji-core/         # pure compute, WASM-compatible
│   ├── Cargo.toml
│   └── src/
├── otoji-cli/          # desktop CLI (cpal + ratatui + clap)
│   ├── Cargo.toml      # depends on otoji-core
│   └── src/
├── otoji-node/         # napi-rs bindings
│   ├── Cargo.toml      # depends on otoji-core
│   └── src/
└── otoji-server/       # WebSocket server (future)
    ├── Cargo.toml      # depends on otoji-core
    └── src/
```

### 1.4 Native CLI stays same-process

```rust
// otoji-cli/src/main.rs (simplified)
fn main() {
    let model = std::fs::read("model.onnx")?;
    let mut engine = otoji_core::AsrEngine::new(&model, config)?;

    // cpal mic callback — same process, zero overhead
    let stream = cpal::build_input_stream(move |data: &[i16]| {
        let events = engine.feed(data);
        for event in events {
            ui_tx.send(event);  // send to TUI
        }
    });
}
```

No server. No serialization. Direct function calls in the audio callback thread.

---

## Phase 2 — WASM build

**Goal**: `otoji-core` compiles to `wasm32-unknown-unknown`.

### 2.1 Prerequisites
- sherpa-onnx WASM support (available via `sherpa-onnx` crate)
- Replace `reqwest` in polisher with injected `HttpClient` trait
- Model loading via `new(model: &[u8])` — no filesystem access

### 2.2 wasm-pack target

```toml
# crates/otoji-core/Cargo.toml
[lib]
crate-type = ["cdylib", "rlib"]

[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
```

### 2.3 Browser integration

```javascript
// JS side
import init, { AsrEngine } from '@otoji/core-wasm';

await init();
const model = await fetch('/models/sensevoice.onnx').then(r => r.arrayBuffer());
const engine = AsrEngine.new(new Uint8Array(model));

// WebAudio capture → feed engine
const ctx = new AudioContext({ sampleRate: 16000 });
const source = ctx.createMediaStreamSource(micStream);
const processor = ctx.createScriptProcessor(4096, 1, 1);
processor.onaudioprocess = (e) => {
    const f32 = e.inputBuffer.getChannelData(0);
    const i16 = float32ToInt16(f32);
    const events = engine.feed(i16);
    events.forEach(handleEvent);
};
```

---

## Phase 3 — Server mode (optional remote)

**Goal**: Host core on a server, thin clients send audio over WebSocket.

### 3.1 Protocol

```
Client → Server:  { "type": "audio", "samples": "<base64 i16 LE>" }
Client → Server:  { "type": "synthesize", "text": "..." }
Server → Client:  { "type": "asr_partial", "text": "..." }
Server → Client:  { "type": "asr_final", "text": "...", "seg_id": 1 }
Server → Client:  { "type": "tts_audio", "samples": "<base64>" }
```

### 3.2 When to use server mode

- Browser on low-end device (model too large for WASM)
- Mobile app that wants to avoid bundling 200MB+ models
- Multi-user setup (shared GPU server)
- Privacy-controlled deployment (audio never leaves your infra)

### 3.3 Thin client

The browser/mobile client becomes trivial:
```javascript
const ws = new WebSocket('wss://my-otoji-server/v1/stream');
// capture mic → send audio frames
// receive ASR events → display
```

---

## Phase 4 — Cloud ASR/TTS as optional adapters

Move iFlytek, OpenAI, ElevenLabs, Gemini TTS/ASR to separate crates or
feature-gated modules. They're "remote providers" — conceptually similar to
server mode but using third-party APIs.

```
crates/
├── otoji-core/              # local inference only
├── otoji-provider-iflytek/  # optional: iFlytek RTASR + TTS
├── otoji-provider-openai/   # optional: OpenAI TTS
├── otoji-provider-gemini/   # optional: Gemini TTS
└── ...
```

The CLI can enable them via features:
```toml
[dependencies]
otoji-core = { path = "../otoji-core" }
otoji-provider-openai = { path = "../otoji-provider-openai", optional = true }
```

---

## Summary

| Phase | What | Key outcome |
|-------|------|-------------|
| **v0.1** (now) | Monolith, works on desktop | ✅ shipped |
| **v0.2** | Local-first polish (Ollama) | ✅ zero API keys needed for full pipeline |
| **Phase 1** | Extract otoji-core | WASM-ready crate, clean API |
| **Phase 2** | WASM build | Runs in browser |
| **Phase 3** | Server mode | Remote clients, shared infra |
| **Phase 4** | Provider crates | Pluggable cloud providers |
| **Future** | In-process LLM (candle/llama.cpp) | No Ollama needed, true single-binary |

Each phase is independently useful. Phase 1 is the foundation — everything
else builds on it.

### Local-first stack (zero cloud, zero API keys)

```
otoji listen
  ├── mic: cpal (in-process)
  ├── ASR: SenseVoice via sherpa-onnx (in-process)
  ├── TTS: Piper via sherpa-onnx (in-process)
  └── polish: Ollama (localhost) ← v0.2
              or candle (in-process) ← future
```

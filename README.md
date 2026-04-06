# otoji (音字)

> realtime speech ⇄ text — *音を字に*

`otoji` is a Rust workspace that wires up streaming ASR, LLM-polished transcripts, and TTS behind a single `react-ink`-style terminal UI built on [`ratatui`](https://ratatui.rs).

```text
mic / file ──► AudioChunk ──► AsrProvider ──► AsrEvent ──► Polisher ──► TUI
                                                                    └─► transcript.md
```

## Workspace layout

| Crate | Purpose |
|---|---|
| `otoji-core` | Shared types: `AudioChunk`, `AsrEvent`, `Word`, `OtojiError` |
| `otoji-audio` | Audio sources — `cpal` mic capture (with resampling) and PCM file replay |
| `otoji-asr` | `AsrProvider` trait + `iflytek_rtasr` (HMAC-SHA1 signa, WebSocket) |
| `otoji-tts` | `TtsProvider` trait + `iflytek_tts` (HMAC-SHA256 auth, MP3/PCM streaming) |
| `otoji-polish` | `Polisher` trait + `NoopPolisher` and `AnthropicPolisher` (Claude Haiku 4.5 default) |
| `otoji-cli` | `otoji` binary — clap subcommands + ratatui TUI |

See [`./docs/`](./docs/README.md) for the architecture rationale and the comparison of RT ASR providers (iFlytek RTASR / CoLi / SenseVoice / Whisper / Deepgram).

## Build

```bash
cargo build --release
```

## Usage

```bash
# 1) Live mic → RTASR → polished TUI
export IFLYTEK_APP_ID=...
export IFLYTEK_API_KEY=...
export ANTHROPIC_API_KEY=...   # optional, enables LLM polish layer
cargo run -p otoji-cli -- listen

# 2) Replay a 16kHz mono PCM file in real time
cargo run -p otoji-cli -- file 16k_10.pcm

# 3) Synthesize speech via iFlytek TTS
export IFLYTEK_TTS_API_KEY=...
export IFLYTEK_TTS_API_SECRET=...
cargo run -p otoji-cli -- speak "你好，世界" --out hello.mp3
```

## TUI

The transcript view shows:

- `[seg_id]` confirmed segments in **white bold** (polished) or **gray** (raw, awaiting polish)
- The current partial hypothesis as `░ ...` in dark gray italic
- A header with provider state and counts

Press `q` / `Esc` / `Ctrl-C` to quit.

## Roadmap

- [ ] `otoji-asr/coli.rs` — CoLi ASR via ListenHub
- [ ] `otoji-asr/sensevoice.rs` — FunASR self-host bridge
- [ ] `otoji-tts/edge_tts.rs` — Microsoft Edge TTS as a free fallback
- [ ] `otoji-cli record` — write transcripts to `*.md` next to the source audio
- [ ] Bench harness (CER / latency / cost) under `crates/otoji-bench`

## License

MIT

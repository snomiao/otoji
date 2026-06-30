# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.1.48] - 2026-06-30

### Bug Fixes
- Make auto-layout converge to a fixpoint (stop sparsening) *(graph)*

## [0.1.47] - 2026-06-30

### Features
- Spring auto-layout + reverse omnibox on input handles *(graph)*

## [0.1.46] - 2026-06-30

### Bug Fixes
- Publish the @otoji/core umbrella (unfreeze from 0.1.1) *(release)*

## [0.1.45] - 2026-06-30

### Bug Fixes
- List linux-arm64-gnu among SUPPORTED native targets *(napi)*

## [0.1.44] - 2026-06-30

### Bug Fixes
- Skip empty/too-short audio before ONNX runs (avoids ORT shape crash) *(graph)*

### Features
- Standalone zero-dep `otoji` CLI launcher + resilient npm publish *(cli)*

## [0.1.43] - 2026-06-30

### Features
- Depth, pose & hand on the Vision-model node + templates ([#52](https://github.com/snomiao/otoji/pull/52)) *(graph)*

## [0.1.42] - 2026-06-30

### Features
- Camera, PaddleOCR & text-diff nodes with feedback control ([#49](https://github.com/snomiao/otoji/pull/49)) *(graph)*

## [0.1.41] - 2026-06-30

### Features
- Federated multi-tracker signaling (magnet-style) + security hardening ([#46](https://github.com/snomiao/otoji/pull/46)) *(signal)*

## [0.1.40] - 2026-06-30

### Features
- Adding a Vosk node auto-pairs a mic-raw source *(graph)*

## [0.1.39] - 2026-06-30

### Features
- Streaming Vosk node + CLI pipe node shows copyable `otoji node` command *(stt)*

## [0.1.38] - 2026-06-30

### Features
- CLI pipe node (otoji-node stdio bridge) + categorized palette + draggable toolbar *(graph)*

## [0.1.37] - 2026-06-30

### Features
- Homepage hello-graph lobby (create/join a room) *(web)*

## [0.1.36] - 2026-06-30

### Features
- P2P model sharing within a room + otoji-vs blog post *(graph)*

## [0.1.35] - 2026-06-29

### Features
- Generic "Custom model" node — import any transformers.js model by repo/URL *(graph)*

## [0.1.34] - 2026-06-29

### Features
- Auto-select neural TTS model from the transcript's language *(tts)*

## [0.1.33] - 2026-06-29

### Features
- Local Text-to-Speech node (browser SpeechSynthesis) *(graph)*

## [0.1.32] - 2026-06-29

### Features
- Surface SenseVoice emotion (SER) + audio-event (AED) tags *(stt)*

## [0.1.31] - 2026-06-29

### Features
- Connect-to-empty-canvas omnibox (cmd-K style downstream picker) *(web)*

## [0.1.30] - 2026-06-29

### Features
- File-source nodes + split outputs (audio-file / .srt) *(web)*

## [0.1.29] - 2026-06-29

### Bug Fixes
- Chunk cross-device edge frames over the data channel *(web)*

## [0.1.28] - 2026-06-29

### Features
- Per-node ✕ remove button *(web)*

## [0.1.27] - 2026-06-28

### Features
- Translate target defaults to browser language (auto source) *(web)*

## [0.1.26] - 2026-06-27

### Features
- Memorable, editable random device names + word-based room codes *(web)*

## [0.1.25] - 2026-06-27

### Features
- Live per-node previews (mic waveform, STT/sink recent text) *(web)*

## [0.1.24] - 2026-06-27

### Features
- One-click pipeline, live activity meters, per-node STT model *(web)*

## [0.1.23] - 2026-06-27

### Features
- Graph editor network/status panel (debug cross-device) *(web)*

## [0.1.22] - 2026-06-27

### Features
- M3 — single-device graph runtime (mic→stt→sink) *(web)*

## [0.1.21] - 2026-06-27

### Features
- M1 — WebRTC mesh transport (signaling client + peer mesh) *(web)*

## [0.1.20] - 2026-06-27

### Features
- M0 — WebRTC signaling Worker + RoomDurableObject *(signal)*

## [0.1.19] - 2026-06-27

### Features
- Drop VAD segments with no readable transcript *(web)*

## [0.1.18] - 2026-06-27

### Features
- VAD voice segments with waveform UI and custom replay *(web)*

## [0.1.17] - 2026-06-15

### Bug Fixes
- Make `exec` Unix-only so the Windows napi build compiles *(build)*

## [0.1.16] - 2026-06-15

### Bug Fixes
- Tolerate self-referential optional-dep install failure *(release)*

## [0.1.15] - 2026-06-15

### Bug Fixes
- Rustfmt the whisper upgrade block + --no-optional bun installs *(ci)*

## [0.1.14] - 2026-06-15

### Features
- Save the spoken audio of each PTT segment as a .wav *(ptt)*

## [0.1.13] - 2026-05-14

### Features
- Default stt_polish_chain to length-gated chain *(config)*

## [0.1.12] - 2026-05-13

### Features
- Expose kws and slug modules *(lib)*

## [0.1.11] - 2026-05-11

### Features
- Add ls and read subcommands *(notes)*

## [0.1.10] - 2026-04-19

### Features
- Stop/Start otoji listen toggle + today count *(tray)*

## [0.1.9] - 2026-04-19

### Features
- Use SF Symbol mic icon instead of '音' text title *(tray)*

## [0.1.8] - 2026-04-19

### Features
- Auto-mux .wav+.srt → .webm after each final segment *(notes)*

## [0.1.7] - 2026-04-17

### Features
- Add 'Reveal latest .wav' / 'Open latest .md' shortcuts *(tray)*
- Clickable items — copy note text, open data folder *(tray)*
- Add --dump-menu diagnostic flag *(tray)*
- Populate menu with recent notes + 3s auto-refresh *(tray)*
- Add otoji-tray macOS bin (milestone 1: empty menu + Quit) *(tray)*
- JSONL store + per-segment wav/srt/md sidecars *(notes)*

## [0.1.6] - 2026-04-15

### Features
- Per-request nonce in XML tags to block prompt injection *(polish)*

## [0.1.5] - 2026-04-15

### Bug Fixes
- Prevent chat-assistant drift on short inputs *(polish)*

## [0.1.4] - 2026-04-14

### Features
- PTT control socket, polish prewarm, WebSocket server mode

## [0.1.3] - 2026-04-14

### Features
- 2-stage PTT commit with context-aware polish + TTS

## [0.1.2] - 2026-04-14

### Bug Fixes
- Install signal handlers at startup, not in drive_plain
- Flush stdout after each JSON line in plain mode
- Preserve PTT state across model lazy-load
- Overflow panic in samples_since_commit + cleanup *(listen)*
- Resolve TODO items — warnings, device selection, API improvements
- Always emit ptt_final event, lower PTT minimum to 250ms
- Ignore SIGUSR1/SIGUSR2 at startup to prevent early termination
- Remove pre-flight silence check, let OS handle permission dialog *(mic)*
- Better permission instructions — show detected terminal, explain + button *(mic)*
- Tell user exactly which app to enable in Microphone settings *(mic)*
- Auto-open System Settings microphone pane on permission error *(mic)*
- Replace Terminal.app relaunch with in-place permission error *(mic)*
- Smarter anti-premature commit (silence + buf-pressure + 2-cycle stability) *(listen)*
- Hold last sentence to prevent premature 。 commits *(listen)*
- Per-sentence dedup at EOF + lower min_commit_chars *(listen)*
- Emit Partial as full decoded text, not just trailing tail *(listen)*
- Sentence-level dedup tracking instead of char-offset *(listen)*
- Add English period to sentence-enders + auto-plain non-TTY *(listen)*
- Adaptive decode interval + commit cooldown + pre-commit anchor *(listen)*
- Rate-limit slow-track decode + realtime-paced QA *(listen)*
- Use char-offset tracking to prevent Final spam *(listen)*

### Chores
- Ignore test/sample audio files

### Documentation
- Add noise robustness test results *(qa)*

### Features
- --ptt-polish and --ptt-tts flags for PTT post-processing
- Replace signal_hook with raw signal() + atomic polling *(PTT)*
- Paced mode + Gemini GT priority + regression baseline *(qa)*
- Add PTT (push-to-talk) support via SIGUSR1/SIGUSR2
- Add ListenSession — push-based Rust crate API *(api)*
- Implement transcribe() + listen() high-level TS API *(api)*
- Design high-level TS API — transcribe() + listen() *(api)*
- Add `otoji mic` subcommand — stream mic to stdout as WAV *(mic)*
- RNNoise denoising + faster partial decode interval *(listen)*
- Noise gate + speech activity check *(listen)*
- Rewrite QA workflow + 3s VAD silence default *(qa)*
- Single-track sliding-window decode with fuzzy stability *(listen)*
- Sliding-window streaming architecture for SenseVoice *(listen)*
- Add otoji listen QA harness + matrix benchmark docs *(qa)*
- Gemini multimodal polish + sensevoice QA-driven fixes *(listen)*

## [0.1.1] - 2026-04-08

### Bug Fixes
- Publish placeholder under --tag placeholder *(bootstrap)*

### CI
- Extract reusable _build.yml + simplify ci/release; rename to @otoji/core
- Bump setup-node to latest *(release)*
- Drop NPM_TOKEN — npm OIDC trusted publishing handles auth *(release)*
- Review pass — split lint/bin/napi jobs, dedupe with release.yml
- Chain build/publish via job needs instead of tag triggers *(release)*

### Chores
- Add bootstrap-npm-packages.sh

### Features
- BYOK speech<->text web app, chrome extension, userscript *(web)*
- Add JS fallback wrapper so install works on every platform *(npm)*
- Piper / openai / elevenlabs / iflytek-pcm + auto provider *(tts)*
- Pipe-friendly TTS via `otoji say -` with Gemini provider *(say)*
- Accept WAV on stdin via `otoji listen -` *(listen)*

### Build
- Switch back to per-platform sub-packages *(npm)*
- Collapse to a single multi-arch otoji package *(npm)*

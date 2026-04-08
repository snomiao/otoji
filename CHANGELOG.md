# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.1.0] - 2026-04-08

### Bug Fixes
- Capture mic in Rust via cpal + show live RMS meter *(listen)*
- Rtasr merfged *(main)*
- Tests *(iat)*
- Ignore *(iat)*

### CI
- Add release-plz workflow + napi-rs node bindings

### Documentation
- Add whisper transcripts for sample audio
- Rename project to otoji and add RT ASR comparison docs

### Features
- Auto-relaunch in Terminal.app when mic returns silence *(listen)*
- --plain mode (no TUI, JSONL events) for headless testing *(listen)*
- Include System Settings open command in all-zero hint *(listen)*
- Show provider status in header instead of as transcript error *(tui)*
- Otoji devices shows alias section (default/mic, system/loopback) *(cli)*
- Otoji listen [device] and otoji devices *(cli)*
- Zero-config setup — auto-download model + uv-managed deps *(sensevoice)*
- Add SenseVoice provider via sherpa-onnx Python helper *(asr)*
- Rewrite otoji as a Rust workspace with ratatui TUI

### Refactor
- Merge workspace into single otoji crate

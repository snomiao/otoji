# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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

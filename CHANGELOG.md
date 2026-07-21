# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.1.60] - 2026-07-21

### Bug Fixes
- Drop the service worker's huggingface route (redirect replay broke fetches) ([#154](https://github.com/snomiao/otoji/pull/154)) *(web)*
- Codex review batch — revision identity, buffer bounds, flush loss, bench realism ([#135](https://github.com/snomiao/otoji/pull/135)) *(web)*

### CI
- Redeploy the web app on lib/rgui submodule bumps ([#139](https://github.com/snomiao/otoji/pull/139))
- Build with the local vite entry, not bun x vite ([#137](https://github.com/snomiao/otoji/pull/137))
- Fix web deploy — bun install/build (pnpm rejected the bun packageManager spec) ([#136](https://github.com/snomiao/otoji/pull/136))

### Documentation
- Record 2-device (2-tab rech) end-to-end verification ([#155](https://github.com/snomiao/otoji/pull/155))
- Check off voice→graph editing ([#150](https://github.com/snomiao/otoji/pull/150)) and group v1 ([#151](https://github.com/snomiao/otoji/pull/151)) ([#152](https://github.com/snomiao/otoji/pull/152))
- Check off two-finger touch navigation (rgui#6 / #133) ([#134](https://github.com/snomiao/otoji/pull/134))
- Touch gesture edge-case matrix — two-finger nav vs one-finger select ([#132](https://github.com/snomiao/otoji/pull/132))
- Research note — otoji interconnect over Bluetooth / offline mesh ([#131](https://github.com/snomiao/otoji/pull/131))
- Spec mobile multi-select + shared long-press menu (bulk remove) ([#130](https://github.com/snomiao/otoji/pull/130))
- CLI pipe recipes (otoji node patterns) ([#128](https://github.com/snomiao/otoji/pull/128))

### Features
- Featured demo templates + wake-word gate (hey otoji assistant) ([#156](https://github.com/snomiao/otoji/pull/156)) *(web)*
- Cloudflare TURN — /signal/turn mints short-lived ICE servers ([#153](https://github.com/snomiao/otoji/pull/153)) *(signal+web)*
- Group — snap the selection into one stack (subgraph v1) ([#151](https://github.com/snomiao/otoji/pull/151)) *(web)*
- Voice→graph editing — graph-edit node applies LLM commands ([#150](https://github.com/snomiao/otoji/pull/150)) *(web)*
- Serverless direct pairing — SDP over copy-paste, links, and QR ([#149](https://github.com/snomiao/otoji/pull/149)) *(web)*
- Feat(web)+docs: goal-sweep close — tap-tap bump, iOS input-zoom guard, TODO reconciliation ([#148](https://github.com/snomiao/otoji/pull/148))
- Never auto-assign mic nodes to devices without a microphone ([#147](https://github.com/snomiao/otoji/pull/147)) *(web)*
- PCM16 wire encoding for cross-device audio (half the bytes) ([#146](https://github.com/snomiao/otoji/pull/146)) *(web)*
- Otoji signal --offline — native LAN signaling relay ([#145](https://github.com/snomiao/otoji/pull/145)) *(cli)*
- Adopt rgui signal-algebra predicates (unblocked) ([#144](https://github.com/snomiao/otoji/pull/144)) *(web)*
- Shared context menu for multi-selections (touch long-press + right-click) ([#143](https://github.com/snomiao/otoji/pull/143)) *(web)*
- Mobile install nudge — small bottom sheet suggesting the PWA ([#142](https://github.com/snomiao/otoji/pull/142)) *(web)*
- Proper PWA logo — waveform→captions mark, full icon set ([#141](https://github.com/snomiao/otoji/pull/141)) *(web)*
- Rgui bump — double-tap/double-click a node maximizes the viewport ([#138](https://github.com/snomiao/otoji/pull/138)) *(web)*
- Rgui bump — two-finger touch pan/pinch on the graph canvas ([#133](https://github.com/snomiao/otoji/pull/133)) *(web)*
- Feat(web)+docs: M6.5 interpreter-booth template + TODO sweep (all items shipped or triaged) ([#129](https://github.com/snomiao/otoji/pull/129))
- Per-edge throughput labels on cross-device edges ([#127](https://github.com/snomiao/otoji/pull/127)) *(web)*
- M6.2 stt buffers continuous input into VAD utterances ([#126](https://github.com/snomiao/otoji/pull/126)) *(web)*
- M6.3 explicit two-pass ASR via utterance port (provisional → final replace) ([#125](https://github.com/snomiao/otoji/pull/125)) *(web)*
- M6.1 in-browser streaming ASR (zipformer transducer, stream-asr node) ([#123](https://github.com/snomiao/otoji/pull/123)) *(web)*

## [0.1.59] - 2026-07-20

### Features
- Installable PWA with offline app shell ([#122](https://github.com/snomiao/otoji/pull/122)) *(web)*
- Categorized template palette (accordion, emoji groups, native badge) ([#120](https://github.com/snomiao/otoji/pull/120)) *(web)*

## [0.1.58] - 2026-07-19

### Bug Fixes
- Cap the vibevoice-asr pending buffer under continuous input ([#113](https://github.com/snomiao/otoji/pull/113)) *(web)*

### Documentation
- M6.-1 gate PASSED — zipformer RTF 0.23 on wasm; concretize dynamic cache dims ([#119](https://github.com/snomiao/otoji/pull/119)) *(web)*
- Check off M6.0 + vibevoice cap, note M6.-1 spike progress ([#117](https://github.com/snomiao/otoji/pull/117))

### Features
- M6.0 transcript revision protocol (partial/provisional/final) ([#112](https://github.com/snomiao/otoji/pull/112)) *(web)*
- ORT-web streaming-zipformer benchmark harness (M6.-1 spike) ([#116](https://github.com/snomiao/otoji/pull/116)) *(web)*
- Streaming incremental fbank frontend (createStreamingFbank) ([#115](https://github.com/snomiao/otoji/pull/115)) *(web)*
- AudioWorklet mic capture for mic-raw (steady sub-250ms frames) ([#114](https://github.com/snomiao/otoji/pull/114)) *(web)*

## [0.1.57] - 2026-07-18

### Bug Fixes
- Node config card fills the node width instead of fixed 190px *(web)*

### Documentation
- M6 realtime streaming pipeline roadmap (partial/final, streaming ASR, two-pass) ([#111](https://github.com/snomiao/otoji/pull/111))
- Check off vision narrator in backlog

### Features
- OCR node accepts a Model provider override (PaddleOCR stays default) ([#110](https://github.com/snomiao/otoji/pull/110)) *(web)*
- Vision narrator template, omnibox template search, lang-code fixes *(web)*
- AR sticky notes node + per-node profiler debug panel *(web)*
- Graph share links, slash node search, faster depth, node metrics *(web)*

## [0.1.56] - 2026-07-13

### Features
- Spatial pipeline, image-match node, single-palette UX, WebGPU depth *(web)*

## [0.1.55] - 2026-07-10

### Chores
- Bump lib/rgui pin to federation rgui (99133d0)

### Features
- Cross-app federation with agent-yes — live codex node, feeds both ways *(web)*
- Serve the room's federation envelope at GET /signal/{room}/graph *(signal)*

## [0.1.54] - 2026-07-09

### Bug Fixes
- Screen-share survives runtime restarts — no re-prompt on graph edits ([#99](https://github.com/snomiao/otoji/pull/99)) *(web)*

### Chores
- Bump rgui — overlay options survive re-map; live drag survives setGraph *(web)*

### Documentation
- Signal-algebra agreement with rgui — ownership 4-valued, adoption backlog *(todo)*

### Features
- Full-bleed textarea/screen-share nodes; previews survive merged blocks ([#98](https://github.com/snomiao/otoji/pull/98)) *(web)*
- Textarea node — Monaco-backed text source ([#97](https://github.com/snomiao/otoji/pull/97)) *(web)*
- Signal-algebra edit-time validation — flag share-signal edges that cross devices ([#96](https://github.com/snomiao/otoji/pull/96)) *(web)*
- Adopt rgui resize ⇄ rescale — persist node w/h/scale, typed overlay ([#94](https://github.com/snomiao/otoji/pull/94)) *(web)*

## [0.1.53] - 2026-07-08

### Bug Fixes
- Bump rgui — overlay clip window no longer double-scales (node×k²) *(web)*

### Chores
- Preview:fresh script — build-first strict-port preview *(web)*
- Bump rgui — keyboard navigation (WASD pan, R/F zoom, N/P focus, ? help) *(web)*
- Bump rgui — container nodes (declared containment scopes the RG hierarchy) *(web)*
- Bump rgui — RG monotonicity (zoom-out never releases merged children) *(web)*
- Bump rgui d350591->98095ae + declare device field merge rule *(web)*

### Features
- Text-diff node gains inline word-diff style *(web)*
- The toolbar is an rgui canvas panel — last floating card gone *(web)*
- Draggable palettes with persisted positions (rgui bc0e496) *(web)*
- Move sink output into the sink node, drop the floating card *(web)*
- Show node controls whenever the node is readable-scaled *(web)*
- Contracted blocks preview their children's live values *(web)*
- Merged blocks with mics show the superposed level wave *(web)*

### Performance
- Camera preview via compositor <video>, canvas repaints per frame *(web)*

## [0.1.52] - 2026-07-07

### Bug Fixes
- Show live transcript preview on STT (and other text) nodes *(web)*
- No "no compatible GPU" error on WebGPU-less machines *(web)*
- Force rgui canvas2d renderer (WebGPU "no compatible GPU" + lag) *(web)*
- Stop touchpad pan from triggering browser back/forward *(web)*
- Keep nodes draggable under their config overlay *(web)*

### Chores
- Bump rgui submodule to v1.7 (chevron ports, snap unify, overlay UX) *(web)*
- DEV-only window.__otoji QA hook (add/select/inspect nodes from e2e) ([#92](https://github.com/snomiao/otoji/pull/92)) *(web)*
- Bump rgui submodule to 9727607 (solder joints + grid field) ([#91](https://github.com/snomiao/otoji/pull/91)) *(web)*
- Bump rgui submodule to dd242b7 (no-overlap flush snap + border dissolution) ([#84](https://github.com/snomiao/otoji/pull/84)) *(web)*

### Documentation
- Mark React Flow -> rgui migration complete (18/18)

### Features
- Snap generated graphs to rgui's main grid (viewer.snapGraph) *(web)*
- Draw run-status (mic level / counts / state) natively on the canvas *(web)*
- Draw the otoji title wordmark natively on the rgui canvas *(web)*
- 3-D billboard tilt gizmo — drag the mic handle to rotate the plane *(web)*
- Rgui overlay clips to node + native click-through; bump submodule *(web)*
- Host summarize rule — compact node/group summaries on rgui *(web)*
- Config overlay scales with zoom (scale:"zoom") *(web)*
- Persist the local-mode graph across refreshes *(web)*
- Render only the config controls over the node (no HTML card) *(web)*
- Per-node config overlays glued by rgui (every readable node) *(web)*
- Snap dropped nodes/workflows to the rgui grid *(web)*
- Rgui-native palettes — node + template panels on the canvas ([#90](https://github.com/snomiao/otoji/pull/90)) *(web)*
- Remove React Flow — rgui is the only graph renderer ([#89](https://github.com/snomiao/otoji/pull/89)) *(web)*
- Live node body on the rgui canvas + save-template via rgui selection ([#88](https://github.com/snomiao/otoji/pull/88)) *(web)*
- Rgui-native node inspector (device + per-type config) ([#87](https://github.com/snomiao/otoji/pull/87)) *(web)*
- Rgui edges, viewport controls, full-screen, visible panels ([#86](https://github.com/snomiao/otoji/pull/86)) *(web)*
- Rgui node selection — click/box select, Ctrl+A, Delete ([#85](https://github.com/snomiao/otoji/pull/85)) *(web)*
- Make @snomiao/rgui the default graph renderer (editable, source-linked) ([#83](https://github.com/snomiao/otoji/pull/83)) *(web)*
- Opt-in @snomiao/rgui graph renderer (?renderer=rgui) ([#81](https://github.com/snomiao/otoji/pull/81)) *(web)*
- Toggle pinning of floating panels (screen ↔ graph) ([#80](https://github.com/snomiao/otoji/pull/80)) *(web)*
- Auto-join shareable room links; dedupe join gate ([#78](https://github.com/snomiao/otoji/pull/78)) *(web)*

## [0.1.51] - 2026-07-02

### Testing
- Self-contained multi-device e2e for cross-device preview ([#76](https://github.com/snomiao/otoji/pull/76)) *(web)*

## [0.1.50] - 2026-07-01

### Bug Fixes
- Approve workerd build script so deploy-web can install wrangler *(ci)*

### CI
- Skip napi build matrix on release-plz version-bump PRs
- Batch releases daily instead of per-commit *(release)*

### Documentation
- Add release/publish ops playbook (CLAUDE.md) + TODO ops section
- Note live two-mic Mix-audio verification (no 2nd device on hand) ([#70](https://github.com/snomiao/otoji/pull/70)) *(todo)*

### Features
- Cross-device live preview (opt-in, streamed over the mesh) ([#75](https://github.com/snomiao/otoji/pull/75)) *(graph)*
- Native sherpa-onnx STT node (bridge to `otoji server`) ([#74](https://github.com/snomiao/otoji/pull/74)) *(web)*
- Connection-type badge ([wan]/[lan]/[browser]) + toolbar toggle *(peers)*
- "Screen depth" — depth map of the shared screen ([#73](https://github.com/snomiao/otoji/pull/73)) *(templates)*
- "Screen YOLO" — detect objects on the shared screen ([#72](https://github.com/snomiao/otoji/pull/72)) *(templates)*
- "Screen audio → STT" — transcribe tab/system audio ([#71](https://github.com/snomiao/otoji/pull/71)) *(templates)*
- "Mix two mics" — two mics → time-aligned mix → STT ([#69](https://github.com/snomiao/otoji/pull/69)) *(templates)*
- Explicit echo-cancellation / denoise toggle on the Mic nodes ([#68](https://github.com/snomiao/otoji/pull/68)) *(mic)*
- Mix audio node — wall-clock-aligned additive mixing ([#67](https://github.com/snomiao/otoji/pull/67)) *(graph)*
- Screen share node (getDisplayMedia → frames + system audio) ([#66](https://github.com/snomiao/otoji/pull/66)) *(graph)*

## [0.1.49] - 2026-06-30

### Performance
- Prewarm MediaPipe shaders at the camera's actual resolution ([#63](https://github.com/snomiao/otoji/pull/63)) *(vision)*

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

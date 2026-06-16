# otoji desktop app (Tauri v2)

A fully-local, offline macOS app for realtime SenseVoice speech-to-text. The
React UI in `web/` is the frontend; the `otoji server` WebSocket backend runs
bundled inside the app as a Tauri **sidecar** — no API keys, no cloud.

## How it fits together

```
otoji.app
├─ Contents/MacOS/otoji-app   ← Tauri shell (embeds the built React UI)
└─ Contents/MacOS/otoji       ← sidecar: `otoji server` (ws://127.0.0.1:8080)
```

On launch, `src-tauri/src/lib.rs` spawns `otoji server` as a sidecar and kills
it on quit. The UI connects via the **`otoji_local`** STT provider
(`web/src/providers/stt/otoji_local.ts`), which is registered as the default
provider in `web/src/ui/App.tsx`. The app captures the mic, downsamples to
16 kHz mono s16le (`web/src/lib/mic.ts`), and streams PCM to the server, which
returns `AsrEvent` JSON frames.

## Build the .app (single command)

```bash
cd web
npm install        # or: bun install
npm run tauri:build
```

`tauri:build` first runs `npm run sidecar` (builds the `otoji` release binary
and stages it at `src-tauri/binaries/otoji-<target-triple>`), then builds the
React UI and bundles everything into:

```
web/src-tauri/target/release/bundle/macos/otoji.app
```

Double-click it, or `open` it. To also produce a `.dmg`, add `"dmg"` to
`bundle.targets` in `src-tauri/tauri.conf.json` (DMG bundling needs an
interactive Finder session, so it can fail in headless shells).

## Dev mode

```bash
cd web
npm run tauri:dev
```

## Offline / model requirement

The app is fully offline at runtime. The SenseVoice model lives in
`~/.cache/otoji/<variant>` (default
`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`). It is **not**
bundled in the .app (it is ~hundreds of MB). On a fresh machine, download it
once — the otoji tray app's 設定 → SenseVoice モデル does this, or:

```bash
VARIANT=sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
mkdir -p ~/.cache/otoji/$VARIANT && \
  curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$VARIANT.tar.bz2 \
  | tar xj -C ~/.cache/otoji/$VARIANT --strip-components=1
```

If the model is missing the server emits an `error` AsrEvent, which the UI
surfaces in its status line.
```

# otoji.app — floating local-SenseVoice mic overlay (macOS)

A double-clickable macOS app that shows a small, transparent, always-on-top
floating widget with a **live mic waveform + live transcript**. Speech is
captured **natively** (VoiceProcessingIO / AEC) and transcribed locally by
SenseVoice — no API keys, no cloud, no browser `getUserMedia`.

## Build (single command)

```bash
./scripts/bundle-macos-app.sh
```

Produces `dist/otoji.app` (and `dist/otoji.app.zip` for sharing). The script
builds the `otoji` release binary, assembles the `.app`, writes the
`Info.plist` (with `NSMicrophoneUsageDescription` so macOS prompts for mic
access), and ad-hoc code-signs with the stable identifier `com.snomiao.otoji`
so the Microphone (TCC) grant persists across rebuilds.

## Run

Double-click `dist/otoji.app`, or `open dist/otoji.app`. On first launch macOS
asks for **Microphone** permission — allow it. The overlay appears at top-center
and starts transcribing.

The app is a UI agent (`LSUIElement`): no Dock icon, just the floating overlay.

Equivalent CLI (no bundle needed):

```bash
otoji listen --aec --overlay
```

## How it works

- `otoji listen --aec --overlay` opens the mic with VoiceProcessingIO (echo
  cancellation), runs SenseVoice + the whisper-upgrade / language gate, and
  emits `AsrEvent`s.
- The Cocoa event loop owns the main thread (`src/overlay.rs::run_event_loop`);
  the mic→ASR pipeline runs on a background thread.
- The audio is tee'd to drive the waveform (RMS bars + VAD); every emitted
  `AsrEvent` updates the subtitle (`overlay_push_event` in `src/main.rs`).
- The overlay (`src/overlay.rs`) is a pure Cocoa + Core Graphics `NSView`
  subclass — no WKWebView. Ported and slimmed from CapsLockX's `voice_overlay`.

## Quit

It's an agent app with no menu, so quit from a terminal:

```bash
pkill -f "otoji.app/Contents/MacOS/otoji"   # or: pkill -f "otoji listen"
```

(or kill it from Activity Monitor). A menu-bar Quit item is a future nicety.

## Requirements

The SenseVoice model lives in `~/.cache/otoji/<variant>` (e.g.
`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`); it is not bundled.
On a fresh machine, download it once via the otoji tray (設定 → SenseVoice
モデル) or `curl` from the sherpa-onnx model releases.

#!/usr/bin/env bash
# Build a double-clickable, self-contained macOS otoji.app.
#
# The app launches the floating native voice overlay (otoji listen --aec
# --overlay) — a transparent, always-on-top mic-waveform + live-transcript
# widget powered by local SenseVoice. Everything runs offline; no API keys.
#
# Usage:  ./scripts/bundle-macos-app.sh
# Output: dist/otoji.app  (and a .zip next to it for sharing)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(grep -m1 '^version' Cargo.toml | sed -E 's/version *= *"([^"]+)".*/\1/')"
APP="dist/otoji.app"
BIN_SRC="target/release/otoji"
IDENT="com.snomiao.otoji"

echo "[bundle] building otoji release binary…"
cargo build --release --bin otoji

echo "[bundle] assembling $APP (v$VERSION)…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN_SRC" "$APP/Contents/MacOS/otoji"
chmod +x "$APP/Contents/MacOS/otoji"

# App icon (reuse the project icon).
if [[ -f assets/icon.icns ]]; then
  cp assets/icon.icns "$APP/Contents/Resources/icon.icns"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>            <string>otoji</string>
  <key>CFBundleDisplayName</key>     <string>otoji</string>
  <key>CFBundleIdentifier</key>      <string>${IDENT}</string>
  <key>CFBundleExecutable</key>      <string>otoji</string>
  <key>CFBundleIconFile</key>        <string>icon</string>
  <key>CFBundlePackageType</key>     <string>APPL</string>
  <key>CFBundleShortVersionString</key> <string>${VERSION}</string>
  <key>CFBundleVersion</key>         <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>  <string>11.0</string>
  <key>NSHighResolutionCapable</key> <true/>
  <!-- Agent app: no Dock icon — the floating overlay is the only UI. -->
  <key>LSUIElement</key>             <true/>
  <!-- Required so macOS shows a mic (TCC) permission prompt and grants
       native VoiceProcessingIO capture. -->
  <key>NSMicrophoneUsageDescription</key>
  <string>otoji transcribes your speech locally with SenseVoice. Audio never leaves your Mac.</string>
</dict>
</plist>
PLIST

# Ad-hoc code-sign with a stable identifier so the Microphone (TCC) grant
# persists across rebuilds.
echo "[bundle] code-signing (ad-hoc, identifier=$IDENT)…"
codesign --force --deep --sign - --identifier "$IDENT" "$APP"
codesign --verify --deep --strict "$APP" && echo "[bundle] signature OK"

# Zip for sharing with the team.
echo "[bundle] zipping…"
( cd dist && rm -f otoji.app.zip && ditto -c -k --sequesterRsrc --keepParent otoji.app otoji.app.zip )

echo "[bundle] done → $APP"
echo "[bundle]        $ROOT/dist/otoji.app.zip"

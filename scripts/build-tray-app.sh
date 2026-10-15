#!/bin/bash
# Wrap the otoji-tray binary in a macOS .app bundle so it has the
# calligraphy icon in Finder / Spotlight / app switcher. The bundle is
# Accessory (LSUIElement = true) so no Dock entry — same UX as today.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/target/release/otoji-tray"
CLI="$ROOT/target/release/otoji"
ICON="$ROOT/assets/icon.icns"
DEST="${1:-/Applications}"
APP="$DEST/otoji.app"

[ -x "$BIN" ] || { echo "missing $BIN — run: cargo build --release --bin otoji-tray" >&2; exit 1; }
[ -x "$CLI" ] || { echo "missing $CLI — run: cargo build --release --bin otoji" >&2; exit 1; }
[ -f "$ICON" ] || { echo "missing $ICON" >&2; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# The tray is the bundle executable; the `otoji` CLI sits next to it so the
# tray spawns the bundled `otoji listen` (inheriting the app's mic grant).
cp "$BIN" "$APP/Contents/MacOS/otoji-tray"
cp "$CLI" "$APP/Contents/MacOS/otoji"
cp "$ICON" "$APP/Contents/Resources/icon.icns"
for f in \
    tray-icon.png tray-icon@2x.png \
    tray-icon-off.png tray-icon-off@2x.png \
    tray-icon-starting.png tray-icon-starting@2x.png \
    tray-icon-voice.png tray-icon-voice@2x.png \
    tray-icon-processing.png tray-icon-processing@2x.png \
    tray-icon-polish.png tray-icon-polish@2x.png \
    tray-icon-saved.png tray-icon-saved@2x.png; do
    [ -f "$ROOT/assets/$f" ] && cp "$ROOT/assets/$f" "$APP/Contents/Resources/$f"
done

cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>otoji</string>
    <key>CFBundleDisplayName</key><string>otoji</string>
    <key>CFBundleExecutable</key><string>otoji-tray</string>
    <key>CFBundleIdentifier</key><string>com.snomiao.otoji</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundleIconFile</key><string>icon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>LSMinimumSystemVersion</key><string>11.0</string>
    <key>LSUIElement</key><true/>
    <key>NSMicrophoneUsageDescription</key><string>otoji captures audio for speech-to-text transcription.</string>
    <key>NSAccessibilityUsageDescription</key><string>otoji listens for the hold-to-talk hotkey.</string>
</dict>
</plist>
PLIST

# Ad-hoc signatures default to a cdhash designated requirement, so every
# rebuild looks like a new app to TCC and drops the Microphone/Accessibility
# grants. Pin the requirement to the bundle identifier so grants survive.
codesign -s - --force --deep --identifier "com.snomiao.otoji" \
    -r='designated => identifier "com.snomiao.otoji"' "$APP"
echo "built: $APP"

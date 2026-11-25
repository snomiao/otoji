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

# Permission guide (Swift, PermissionFlow): floats a "drag otoji into this
# list" card beside System Settings. Optional — the tray falls back to the
# system prompt without it. CommandLineTools ships no SwiftUI macro plugin
# for the macOS 27 SDK, so prefer an older SDK when one is installed.
GUIDE_DIR="$ROOT/macos/permission-guide"
if command -v swift >/dev/null 2>&1; then
    GUIDE_SDK="$(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX26*.sdk 2>/dev/null | sort -V | tail -1)"
    if (cd "$GUIDE_DIR" && SDKROOT="${GUIDE_SDK:-$SDKROOT}" swift build -c release >/dev/null); then
        cp "$GUIDE_DIR/.build/release/otoji-permission-guide" "$APP/Contents/MacOS/"
        cp -R "$GUIDE_DIR/.build/release/PermissionFlow_PermissionFlow.bundle" "$APP/Contents/Resources/"
        cp "$GUIDE_DIR/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/"
    else
        echo "note: permission guide build failed — bundling without it" >&2
    fi
fi
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

# Sign with the local "otoji Local Signing" identity when present
# (scripts/create-signing-cert.sh): its designated requirement is stable
# across rebuilds, so macOS keeps the Microphone/Accessibility grants.
# Otherwise fall back to ad-hoc, which needs re-granting after each rebuild.
SIGN_ID="${OTOJI_SIGN_IDENTITY:-otoji Local Signing}"
SIGN_KC="$HOME/Library/Keychains/otoji-signing.keychain-db"
SIGN_PASS="${XDG_CONFIG_HOME:-$HOME/.config}/otoji/signing-keychain.pass"
if [ -f "$SIGN_KC" ] && [ -f "$SIGN_PASS" ] \
    && security find-certificate -c "$SIGN_ID" "$SIGN_KC" >/dev/null 2>&1; then
    security unlock-keychain -p "$(cat "$SIGN_PASS")" "$SIGN_KC"
    codesign -s "$SIGN_ID" --keychain "$SIGN_KC" --force --deep \
        --identifier "com.snomiao.otoji" "$APP"
else
    echo "note: no '$SIGN_ID' identity — ad-hoc signing (run scripts/create-signing-cert.sh)" >&2
    codesign -s - --force --deep --identifier "com.snomiao.otoji" "$APP"
fi
echo "built: $APP"

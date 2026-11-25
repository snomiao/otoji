#!/bin/bash
# Run otoji.app as a per-user LaunchAgent: starts at login and relaunches the
# tray within ~10 s when it crashes or is killed (e.g. when WindowServer
# restarts, which takes every GUI app down with it). A clean exit stays down.
#
#   scripts/install-launch-agent.sh [app-dir]   install + start (default ~/Applications)
#   scripts/install-launch-agent.sh --uninstall stop + remove
#
# `pkill -f otoji-tray` (a signal) only restarts it. The tray menu's "Quit otoji"
# keeps it quit, also across logins, until otoji.app is opened again; or stop it with:
#   launchctl bootout gui/$(id -u)/com.snomiao.otoji
set -euo pipefail

LABEL="com.snomiao.otoji"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "removed: $PLIST"
    exit 0
fi

APP_DIR="${1:-$HOME/Applications}"
EXE="$APP_DIR/otoji.app/Contents/MacOS/otoji-tray"
[ -x "$EXE" ] || { echo "missing $EXE — run scripts/build-tray-app.sh $APP_DIR" >&2; exit 1; }

mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array><string>$EXE</string></array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>LimitLoadToSessionType</key><string>Aqua</string>
    <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

# Replace any running copy (a manually opened tray, or an older agent).
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
pkill -f "otoji.app/Contents/MacOS/otoji-tray" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "installed: $PLIST (stop: launchctl bootout $DOMAIN/$LABEL)"

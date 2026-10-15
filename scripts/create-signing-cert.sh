#!/bin/bash
# Create a local self-signed code-signing identity ("otoji Local Signing") in
# a dedicated keychain. build-tray-app.sh signs otoji.app with it when present,
# giving the bundle a stable designated requirement so macOS keeps the
# Microphone/Accessibility grants across rebuilds (ad-hoc signatures don't).
#
# A dedicated keychain (random password in a 0600 file) lets builds sign
# headlessly — the login keychain refuses codesign without a GUI prompt.
# It only ever holds this untrusted, local-only signing key.
set -euo pipefail

NAME="otoji Local Signing"
DIR="${XDG_CONFIG_HOME:-$HOME/.config}/otoji"
KC="$HOME/Library/Keychains/otoji-signing.keychain-db"
PASS_FILE="$DIR/signing-keychain.pass"

if [ -f "$KC" ] && security find-certificate -c "$NAME" "$KC" >/dev/null 2>&1; then
    echo "already present: $NAME in $KC"
    exit 0
fi

mkdir -p "$DIR"
umask 077
[ -f "$PASS_FILE" ] || openssl rand -hex 24 > "$PASS_FILE"
KCPASS="$(cat "$PASS_FILE")"
[ -f "$KC" ] || security create-keychain -p "$KCPASS" "$KC"
security set-keychain-settings "$KC" # no auto-lock timeout
security unlock-keychain -p "$KCPASS" "$KC"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/openssl.cnf" << EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/openssl.cnf" \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
P12PASS="$(openssl rand -hex 16)"
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" \
    -out "$TMP/id.p12" -passout "pass:$P12PASS"
security import "$TMP/id.p12" -k "$KC" -P "$P12PASS" -T /usr/bin/codesign
# Let Apple's codesign use the key without a GUI prompt.
security set-key-partition-list -S apple-tool:,apple: -s -k "$KCPASS" "$KC" >/dev/null
echo "created: $NAME in $KC (valid 10 years)"

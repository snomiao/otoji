#!/usr/bin/env bash
#
# Create the 5 npm package names that release.yml will publish into:
#   - @otoji/core                       (umbrella)
#   - @otoji/core-darwin-arm64          (per-platform binary)
#   - @otoji/core-darwin-x64
#   - @otoji/core-linux-x64-gnu
#   - @otoji/core-win32-x64-msvc
#
# npm doesn't expose an API to "reserve" a package name — the only way to
# claim it is to publish at least one version. This script publishes a
# minimal `0.0.0-placeholder` for each name so the package exists on the
# registry, after which you can:
#   1. Visit each package's Settings → Trusted Publisher page
#   2. Add a GitHub Actions trusted publisher pointing at:
#         repo:  snomiao/otoji
#         workflow file: release.yml
#         (leave environment empty)
#   3. Merge release-plz's PR → release.yml will publish the real version
#      via OIDC, no NPM_TOKEN required.
#
# Usage:
#   npm login                         # one-time, must be a member of @otoji
#   ./scripts/bootstrap-npm-packages.sh
#
# Re-running is safe: existing packages just get a "cannot publish over
# the previously published version" error which the script ignores.

set -euo pipefail

PACKAGES=(
  "@otoji/core"
  "@otoji/core-darwin-arm64"
  "@otoji/core-darwin-x64"
  "@otoji/core-linux-x64-gnu"
  "@otoji/core-win32-x64-msvc"
)

PLACEHOLDER_VERSION="0.0.0-placeholder"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for name in "${PACKAGES[@]}"; do
  echo
  echo "── $name ──────────────────────────────────────────"

  # Skip if a published version already exists.
  if npm view "$name" version >/dev/null 2>&1; then
    existing=$(npm view "$name" version)
    echo "  already on registry (version $existing) — skipping publish"
    continue
  fi

  dir="$TMP/$(echo "$name" | tr '/@' '__')"
  mkdir -p "$dir"
  cat > "$dir/package.json" <<JSON
{
  "name": "$name",
  "version": "$PLACEHOLDER_VERSION",
  "description": "Placeholder for otoji native bindings — will be replaced by the next release.yml run.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/snomiao/otoji.git"
  },
  "homepage": "https://github.com/snomiao/otoji"
}
JSON
  cat > "$dir/README.md" <<MD
# $name

Placeholder so the npm name exists. The real binding will be published by
[release.yml](https://github.com/snomiao/otoji/blob/main/.github/workflows/release.yml)
on the next conventional-commits release.
MD

  (cd "$dir" && npm publish --access public)
  echo "  ✓ published $name@$PLACEHOLDER_VERSION"
done

echo
echo "════════════════════════════════════════════════════════════"
echo "All packages created. Configure Trusted Publishers next:"
echo
for name in "${PACKAGES[@]}"; do
  echo "  https://www.npmjs.com/package/${name}/access"
done
echo
echo "On each page → 'Trusted Publisher' → 'GitHub Actions' →"
echo "  Organization or user: snomiao"
echo "  Repository:           otoji"
echo "  Workflow filename:    release.yml"
echo "  Environment name:     (leave empty)"

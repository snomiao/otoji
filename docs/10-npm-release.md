# NPM Release Playbook

`otoji` is published to npm as two layers:

1. **`@otoji/core`** — umbrella package, picks the right native binding
   per platform at install time.
2. **`@otoji/core-{os}-{arch}`** — per-target prebuilt `.node` binary
   (napi-rs convention). Users never depend on these directly;
   `@otoji/core` lists them all in `optionalDependencies`.

## Automated release (recommended)

The pipeline lives in `.github/workflows/release.yml`:

1. Conventional-commit messages land on `main`.
2. `release-plz` opens a release PR that bumps `Cargo.toml` + CHANGELOG.
3. Merging the PR:
   - Publishes the source crate to crates.io (`cargo publish --no-verify`).
   - Pushes a `vX.Y.Z` git tag.
4. The reusable `_build.yml` matrix builds the napi artifacts
   (`darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`,
   `win32-x64-msvc`).
5. The publish job `napi artifacts`s the pre-built `.node` files into
   per-target sub-packages and runs `npm publish --provenance` for each
   `@otoji/core-<triple>` plus the umbrella `@otoji/core`.

### Required repo secrets / settings

| Item                            | Purpose                                        |
|---------------------------------|------------------------------------------------|
| `CARGO_REGISTRY_TOKEN` (secret) | `release-plz` publishing to crates.io          |
| Actions → Workflow permissions  | Read + write, allow PR creation & approval     |
| npm Trusted Publisher           | Per package, points to this repo + workflow    |

No `NPM_TOKEN` is needed — npm OIDC (trusted publishing) handles auth.

## Manual local release

For one-off manual publishes (testing, emergency patches):

```bash
# 0. Prereqs
brew install zig                           # cross-compiling linker
cargo install cargo-zigbuild
npm install                                # @napi-rs/cli
rustup target add x86_64-apple-darwin aarch64-apple-darwin \
  x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu \
  x86_64-pc-windows-msvc

# 1. Bump versions (Cargo.toml + package.json + optionalDependencies)
cargo set-version 0.1.4                    # or edit by hand
npm version 0.1.4 --no-git-tag-version

# 2. Build napi for the current host
npm run build:release

# 3. Smoke test
npm run test:smoke

# 4. Build all targets (or skip and rely on CI)
npx napi build --platform --release --features node --target aarch64-apple-darwin
npx napi build --platform --release --features node --target x86_64-apple-darwin
# … repeat for each target, or use `--strip --cross-compile` …

# 5. Stage artifacts into npm/ subpackages
npx napi artifacts --npm-dir npm

# 6. Prepublish (moves triples into npm/<triple>, updates each package.json)
npx napi prepublish -t npm

# 7. Publish
npm publish --access public                # umbrella
for d in npm/*/; do (cd "$d" && npm publish --access public); done
```

## Development workflow

- `npm run build` — debug build, current host
- `npm run build:release` — release build, current host (what `prepack` runs)
- `npm run test:smoke` — verify `require('./main.js')` succeeds
- `npm run clean` — wipe `.node` files + generated JS

The `prepare` script runs `npm run build` unless a built artifact already
exists (`index.js` present). This lets `npm install` from a git URL
build the binary automatically.

## Subpackage matrix

| Platform              | Package name                      | Triple                         |
|-----------------------|-----------------------------------|--------------------------------|
| macOS Apple Silicon   | `@otoji/core-darwin-arm64`        | `aarch64-apple-darwin`         |
| macOS Intel           | `@otoji/core-darwin-x64`          | `x86_64-apple-darwin`          |
| Linux x86_64 (glibc)  | `@otoji/core-linux-x64-gnu`       | `x86_64-unknown-linux-gnu`     |
| Linux arm64 (glibc)   | `@otoji/core-linux-arm64-gnu`     | `aarch64-unknown-linux-gnu`    |
| Windows x64           | `@otoji/core-win32-x64-msvc`      | `x86_64-pc-windows-msvc`       |

All must stay at the same version as the umbrella `@otoji/core`.

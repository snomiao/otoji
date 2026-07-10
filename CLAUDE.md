# CLAUDE.md — operating notes for this repo (snomiao/otoji)

Project context lives in [`README.md`](./README.md) (what otoji is) and
[`TODO.md`](./TODO.md) (distributed voice-graph design + milestones). This file
is the **operational playbook** — the non-obvious things needed to work on the
build/release/publish machinery without rediscovering them each time.

## Package management: use bun

This repo uses **bun** for local install/build, **not npm**.
- `bun install`, `bun run build` — never `npm install` locally.
- Do **not** create or commit `package-lock.json`; use `bun.lock`.
- `npm` is acceptable ONLY for the actual registry publish (`npm publish
  --provenance`), since OIDC trusted-publishing/provenance is npm-specific.
- Subdirs `web/` and `signal/` use **bun** (`bun.lock`).

## Layout

- `src/`, `Cargo.toml` — single Rust crate `otoji` (binaries `otoji`,
  `otoji-tray`; `node` feature builds napi-rs bindings). Build: `cargo run --
  listen`.
- napi bindings ship as **`@otoji/core`** (umbrella) + per-triple
  `@otoji/core-<triple>` subpackages. Umbrella `main.js` is a hand-written
  fallback wrapper that requires the napi-generated `index.js` loader.
- `cli/` — standalone **zero-dep `otoji` CLI** (`bin otoji` → `otoji-node.mjs`),
  a stdio↔graph bridge over the signaling WebSocket. Published as the bare
  `otoji` npm package so `npx otoji node <room>` works.
- `web/` (React Flow app), `signal/` (Cloudflare Worker + Durable Object).

## Release & publishing

**Releases are batched DAILY, not per-commit** (set up 2026-06-30 to avoid ~18
full build+publish cycles/day):

- `release.yml` triggers: `push` (main), `schedule` (`0 18 * * *` = 03:00 JST),
  `workflow_dispatch`.
- **On push:** only `release-plz release-pr` runs — refreshes the accumulating
  "chore: release vX.Y.Z" PR. No build, no publish.
- **On the daily cron** (or `workflow_dispatch -f release_now=true`): the release
  PR is squash-merged, the workspace is `git reset --hard origin/main` (so the
  merged version is seen *this run* — a GITHUB_TOKEN merge does not self-trigger
  a workflow), `release-plz release` publishes the crate + tags `vX.Y.Z`, then
  the napi matrix builds and the publish job ships every npm package.
- **Ship now:** `gh workflow run release.yml -f release_now=true` (needs repo
  admin rights on the token; a plain `gh` token may get HTTP 403).
- Conventional commits drive bumps: `feat`=minor, `fix`=patch; `docs/chore/ci`
  appear in the changelog but don't bump.

**`_build.yml`** is the reusable napi matrix (5 targets incl. native
`ubuntu-24.04-arm` for aarch64-linux). It also has `workflow_dispatch` so you can
produce fresh `.node` artifacts on demand (`gh workflow run _build.yml`). Each job
uploads `*.node` + the napi `index.js`/`index.d.ts` loader.

**`ci.yml`** runs lint on every push; the napi matrix runs on **real PRs only**
(excludes `release-plz-*` branches and main pushes — those are covered by
`release.yml`).

### npm = OIDC trusted publishing (no NPM_TOKEN)

Every `@otoji/core*` package on npmjs.com must have a **Trusted Publisher**
(GitHub Actions → org `snomiao`, repo `otoji`, workflow `release.yml`, "Allow npm
publish"). The publish job uses `--provenance --ignore-scripts`.

- `--ignore-scripts` is **required** for the umbrella: its `prepublishOnly`
  (`napi prepublish && bun run build:release`) would otherwise re-publish the
  platform packages (403) and rebuild on the publish-only runner — this froze
  `@otoji/core` at 0.1.1 for a long time.
- The publish loop is resilient: an already-published version (403) is treated as
  success; a 404 means the package name was never bootstrapped.

### Bootstrapping a NEW platform package (OIDC cannot create packages)

OIDC trusted-publishing can only publish to an **existing** package name. To add a
new `@otoji/core-<triple>`:
1. Build the `.node` (`gh workflow run _build.yml`, then `gh run download <id> -n
   bindings-<target>`).
2. Lay out a package dir (mirror an existing subpackage's `package.json`: set
   `os`/`cpu`/`libc`/`main`/`files`/`version`), drop in the `.node`.
3. `npm publish --access public --tag latest` as user `snomiao`. This needs an
   interactive web login (`npm login` in a tmux session) + a **WebAuthn / Touch
   ID** tap — drive the browser with `rech` up to the auth page, but the user must
   physically complete Touch ID (it can't be automated).
4. Configure that package's **Trusted Publisher** on npmjs.com (use `rech`) so all
   future releases publish it via OIDC.

### Health check (any time)

```bash
for p in "" -darwin-arm64 -darwin-x64 -linux-x64-gnu -linux-arm64-gnu -win32-x64-msvc; do
  echo -n "@otoji/core$p: "; npm view "@otoji/core$p" version; done
npm view otoji version            # the CLI
```
All `@otoji/core*` versions (incl. the umbrella) should match. `otoji` rides the
same version line.

## CI cost

Repo is **public → all GitHub-hosted runners are free ($0)**, macOS included. The
10×/2×/1× multipliers only bill against private-repo quota. Optimizations here are
about **noise/throughput** (fewer redundant builds), not money.

## Doc language

Committed docs / commit messages / PR bodies / code comments: this repo's
technical docs are **English** (README, TODO, this file, code comments). No
furigana anywhere. (Design archive under `docs/` is Japanese, no furigana.)

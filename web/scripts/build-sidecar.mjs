#!/usr/bin/env node
// Build the `otoji` release binary and stage it as a Tauri sidecar.
//
// Tauri's `externalBin` looks for `binaries/<name>-<target-triple>`, so we
// build the backend with cargo and copy it to that exact path. This makes the
// packaged .app self-contained: it ships its own `otoji server`.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const otojiRoot = resolve(webDir, "..");
const binariesDir = join(webDir, "src-tauri", "binaries");

// Resolve the host target triple (e.g. aarch64-apple-darwin).
const rustcInfo = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const triple = rustcInfo.match(/^host:\s*(.+)$/m)?.[1]?.trim();
if (!triple) {
  console.error("[build-sidecar] could not determine rust host triple");
  process.exit(1);
}

console.log(`[build-sidecar] building otoji release binary (target: ${triple})…`);
execFileSync("cargo", ["build", "--release", "--bin", "otoji"], {
  cwd: otojiRoot,
  stdio: "inherit",
});

const ext = process.platform === "win32" ? ".exe" : "";
const builtBin = join(otojiRoot, "target", "release", `otoji${ext}`);
if (!existsSync(builtBin)) {
  console.error(`[build-sidecar] expected binary not found: ${builtBin}`);
  process.exit(1);
}

mkdirSync(binariesDir, { recursive: true });
const dest = join(binariesDir, `otoji-${triple}${ext}`);
copyFileSync(builtBin, dest);
chmodSync(dest, 0o755);
console.log(`[build-sidecar] staged sidecar → ${dest}`);

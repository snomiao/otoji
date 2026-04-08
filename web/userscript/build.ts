import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const header = `// ==UserScript==
// @name         otoji
// @namespace    https://github.com/snomiao/otoji
// @version      0.0.1
// @description  Streaming speech-to-text with LLM polish. BYOK.
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
`;

async function main() {
  const outDir = resolve("dist-userscript");
  mkdirSync(outDir, { recursive: true });
  const outfile = resolve(outDir, "otoji.user.js");
  await build({
    entryPoints: [resolve("userscript/entry.tsx")],
    bundle: true,
    format: "iife",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    outfile,
    logLevel: "info",
  });
  const body = readFileSync(outfile, "utf8");
  writeFileSync(outfile, header + body);
  console.log("built", outfile);
}

main().catch((e) => { console.error(e); process.exit(1); });

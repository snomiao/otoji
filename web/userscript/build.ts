import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

export function micUserscriptHeader(development = false): string {
  return `// ==UserScript==
// @name         otoji mic
// @namespace    https://otoji.org/mic
// @version      0.1.1
// @description  Private, device-first dictation in editable fields.${development ? " Local development loader." : ""}
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      otoji.org
${development ? "// @connect      localhost\n// @connect      127.0.0.1\n" : ""}// @updateURL    ${development ? "none" : "https://otoji.org/mic.user.js"}
// @downloadURL  ${development ? "http://localhost:5185/mic/loader.user.js" : "https://otoji.org/mic.user.js"}
// ==/UserScript==
`;
}

/** The direct eval stays inside the manager sandbox, with the granted GM APIs in scope. */
export function micDevelopmentLoader(): string {
  return micUserscriptHeader(true) + `(function () {
  "use strict";
  if (window.top !== window.self) return;
  GM_xmlhttpRequest({
    method: "GET",
    url: "http://localhost:5185/mic.user.js",
    timeout: 15000,
    headers: { "Cache-Control": "no-cache" },
    onload: function (response) {
      if (response.status !== 200 || !response.responseText.startsWith("// ==UserScript==")) {
        console.error("otoji mic: local development bundle unavailable");
        return;
      }
      eval(response.responseText + "\\n//# sourceURL=otoji-mic-local.user.js");
    },
    onerror: function () { console.error("otoji mic: start the local server at http://localhost:5185"); },
    ontimeout: function () { console.error("otoji mic: local development server timed out"); }
  });
})();\n`;
}

export async function bundleMicUserscript(): Promise<string> {
  const result = await build({
    entryPoints: [resolve(webRoot, "mic/entry.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
    write: false,
    logLevel: "warning",
  });
  return micUserscriptHeader() + result.outputFiles[0].text;
}

export async function buildMicUserscript(outDir = resolve(webRoot, "dist")): Promise<void> {
  const body = await bundleMicUserscript();
  mkdirSync(resolve(outDir, "mic"), { recursive: true });
  writeFileSync(resolve(outDir, "mic.user.js"), body);
  writeFileSync(resolve(outDir, "mic/loader.user.js"), micDevelopmentLoader());
}

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
  await buildMicUserscript(outDir);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

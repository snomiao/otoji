import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { dirname, join } from "node:path";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rguiAlias, rguiAliases } from "./rgui-alias";

// onnxruntime-web ships a ~26MB wasm that Vite would emit into dist/. We load
// the wasm from the jsdelivr CDN at runtime (ort.env.wasm.wasmPaths), so the
// bundled copy is dead weight AND exceeds Cloudflare Pages' 25MB file limit.
// Drop any emitted .wasm asset from the bundle.
const dropWasmAssets = {
  name: "drop-wasm-assets",
  generateBundle(_options: unknown, bundle: Record<string, { type: string }>) {
    for (const file of Object.keys(bundle)) {
      if (file.endsWith(".wasm")) delete bundle[file];
    }
  },
};

// otoji.org/editor/ — the Patchbay (demos/patchbay: editor, player, instruments) is
// plain static files; copy them into the build so Pages serves them before the
// SPA fallback. Its checkers (*.mjs), notes (*.md), src.html and build.sh stay out.
const copyEditor = {
  name: "copy-editor",
  closeBundle() {
    const from = fileURLToPath(new URL("../demos/patchbay/", import.meta.url)), to = fileURLToPath(new URL("./dist/editor/", import.meta.url));
    if (!existsSync(join(from, "index.html"))) return;
    mkdirSync(to, { recursive: true });
    for (const f of ["index.html", "matrix.js", "instruments.js", "pm-worklet.js"]) cpSync(join(from, f), join(to, f));
    cpSync(join(from, "cultures"), join(to, "cultures"), { recursive: true, filter: (src) => !/\.(mjs|md)$/.test(src) });
  },
};

// @snomiao/rgui resolution (live local source — sibling worktree → submodule →
// stub, no npm wait) lives in ./rgui-alias.ts, shared with vitest.config.ts.
const url = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    dropWasmAssets,
    copyEditor,
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "otoji",
        short_name: "otoji",
        description: "realtime speech ⇄ text — wire mic → STT → translate → speech as a voice graph",
        start_url: "/",
        display: "standalone",
        theme_color: "#0d1117",
        background_color: "#0d1117",
        icons: [
          { src: "/otoji.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // full-bleed variant: the artwork sits in the 80% safe zone so
          // Android mask shapes never clip it
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/signal(?:\/|$)/, /^\/editor(?:\/|$)/, /\/[^/?]+\.[^/?]+(?:\?.*)?$/],
        globIgnores: ["editor/**"], // the Patchbay loads its own files; don't precache them with the app
        // NOTE: no huggingface.co route here on purpose — HF `resolve` URLs
        // 302 to cdn-lfs, and a CacheFirst replay of a redirected response
        // makes the SECOND fetch throw "Failed to fetch" (hit live). Model
        // bytes are cached app-side in otoji-models-v1 instead.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
            handler: "CacheFirst",
            options: {
              cacheName: "otoji-cdn-assets-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "otoji-cdn-assets-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: rguiAliases },
  // rgui source lives outside web/ (submodule / sibling worktree); let the dev
  // server read it.
  server: { fs: { allow: [url("."), dirname(rguiAlias)] } },
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
  },
} as any);

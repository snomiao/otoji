import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
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

// @snomiao/rgui resolution (live local source — sibling worktree → submodule →
// stub, no npm wait) lives in ./rgui-alias.ts, shared with vitest.config.ts.
const url = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [react(), dropWasmAssets],
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

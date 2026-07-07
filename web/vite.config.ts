import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

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

// @snomiao/rgui is consumed as LIVE SOURCE (not npm — it's under heavy
// co-development). Resolution priority for the `@snomiao/rgui` import:
//   1. RGUI_PATH env (explicit override)
//   2. the sibling worktree src — picks up rgui-agent's UNCOMMITTED edits live
//   3. the pinned git submodule at lib/rgui/src — reproducible in CI / prod
//   4. an in-repo stub (src/vendor/rgui-stub.ts) — build never breaks; the
//      renderer shows a "unavailable" notice (submodule not checked out)
// tsconfig `paths` points typecheck at the stub's typed API shim so `tsgo`
// stays stable regardless of which source the runtime resolves.
const url = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const rguiCandidates = [
  process.env.RGUI_PATH,
  url("../../../../rgui/tree/main/src/index.ts"), // sibling worktree (live)
  url("../lib/rgui/src/index.ts"), // git submodule (pinned)
].filter((p): p is string => !!p && existsSync(p));
const rguiStub = url("./src/vendor/rgui-stub.ts");
const rguiAlias = rguiCandidates[0] ?? rguiStub;

export default defineConfig({
  plugins: [react(), dropWasmAssets],
  // rgui source imports d3 bare; when consuming it from the submodule (no
  // node_modules up-tree) or the sibling worktree, pin d3 to web's own copies so
  // resolution works regardless of where the source lives.
  resolve: {
    alias: {
      "@snomiao/rgui": rguiAlias,
      "d3-selection": require.resolve("d3-selection"),
      "d3-zoom": require.resolve("d3-zoom"),
    },
  },
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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

// @snomiao/rgui is an OPTIONAL local dependency (not yet published). When the
// built lib is present locally, `?renderer=rgui` uses it; otherwise (CI /
// production) the import resolves to an in-repo stub so the build still passes.
// Override the path with RGUI_PATH; default is the sibling checkout.
const rguiPath =
  process.env.RGUI_PATH ?? fileURLToPath(new URL("../../../../rgui/tree/main/dist/rgui.js", import.meta.url));
const rguiStub = fileURLToPath(new URL("./src/vendor/rgui-stub.ts", import.meta.url));
const rguiAlias = existsSync(rguiPath) ? rguiPath : rguiStub;

export default defineConfig({
  plugins: [react(), dropWasmAssets],
  resolve: { alias: { "@snomiao/rgui": rguiAlias } },
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
  },
} as any);

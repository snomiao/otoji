import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync } from "node:fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        mkdirSync("dist-extension", { recursive: true });
        copyFileSync("extension/manifest.json", "dist-extension/manifest.json");
      },
    },
  ],
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: resolve(__dirname, "extension/popup.html") },
    },
  },
});

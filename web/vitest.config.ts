import { defineConfig } from "vitest/config";
import { rguiAliases } from "./rgui-alias";

export default defineConfig({
  // Same live-local @snomiao/rgui resolution as vite.config.ts, so tests of
  // modules importing rgui (federation, rgui-adapter, …) run against the real
  // sibling-worktree / submodule source instead of failing on the bare import.
  resolve: { alias: rguiAliases },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
  },
});

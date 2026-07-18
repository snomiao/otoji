// Shared @snomiao/rgui resolution for vite.config.ts AND vitest.config.ts —
// rgui is consumed as LIVE LOCAL SOURCE (no npm release needed). Priority:
//   1. RGUI_PATH env (explicit override)
//   2. the sibling worktree src (~/ws/snomiao/rgui/tree/main) — picks up
//      rgui-agent's UNCOMMITTED edits live
//   3. the pinned git submodule at lib/rgui/src — reproducible in CI / prod
//   4. an in-repo stub (src/vendor/rgui-stub.ts) — build never breaks; the
//      renderer shows an "unavailable" notice (submodule not checked out)
// tsconfig `paths` mirrors the same 2→3→4 chain for tsgo.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const url = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const rguiCandidates = [
  process.env.RGUI_PATH,
  url("../lib/rgui/src/index.ts"), // git submodule (pinned)
  url("../../../../rgui/tree/main/src/index.ts"), // sibling worktree (live)
].filter((p): p is string => !!p && existsSync(p));

export const rguiStub = url("./src/vendor/rgui-stub.ts");
export const rguiAlias = rguiCandidates[0] ?? rguiStub;

// rgui source imports d3 bare; when consuming it from the submodule (no
// node_modules up-tree) the bare import can't resolve, so pin d3 to web's own
// copies regardless of where the source lives.
export const rguiAliases = {
  "@snomiao/rgui": rguiAlias,
  "d3-selection": require.resolve("d3-selection"),
  "d3-zoom": require.resolve("d3-zoom"),
};

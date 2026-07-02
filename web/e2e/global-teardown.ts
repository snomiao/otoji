import { rmSync } from "node:fs";

// Remove the local-signaling override that the vite webServer command wrote, so
// a subsequent manual `pnpm dev` goes back to the default (production) signaling.
export default function globalTeardown() {
  rmSync(".env.development.local", { force: true });
}

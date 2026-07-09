import { defineConfig } from "@playwright/test";

// E2E config for the multi-session (multi-device) graph tests. Self-contained:
// Playwright boots the local signaling Worker (signal/, via wrangler dev) and a
// vite dev server pointed at it (VITE_SIGNAL_BASE), so room presence + the
// WebRTC mesh run entirely on localhost — deterministic, no dependency on the
// live otoji.org edge (whose ICE round-trips are slow/flaky from CI sandboxes).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: [
    {
      // Local signaling Worker (Durable Object) on :8787.
      command: "bun --cwd ../signal run wrangler dev --port 8787",
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Vite dev server pointed at the local signaling Worker.
      command: 'echo VITE_SIGNAL_BASE=ws://localhost:8787/signal > .env.development.local && bun run dev',
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

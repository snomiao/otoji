import { defineConfig } from "@playwright/test";

// E2E config for the multi-session (multi-device) graph tests. Assumes a dev
// server on :5173 (run `npm run dev`) and reaches the live otoji.org signaling
// Worker for room presence + WebRTC mesh.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
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
});

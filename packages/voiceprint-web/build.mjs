import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await rm(".types", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "browser",
  format: "esm",
  external: ["onnxruntime-web/wasm"],
  sourcemap: "external",
});
if (!result.success) throw new Error("SDK bundle failed.");
const types = Bun.spawn(["./node_modules/.bin/tsrs", "-p", "tsconfig.build.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await types.exited) throw new Error("SDK declaration build failed.");
await cp(".types", "dist", { recursive: true });
const consumer = Bun.spawn(["./node_modules/.bin/tsrs", "-p", "tsconfig.consumer.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await consumer.exited)
  throw new Error("Built SDK public declarations failed the consumer check.");

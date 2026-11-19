import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await rm(".types", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const built = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "browser",
  format: "esm",
  sourcemap: "external",
});
if (!built.success) throw new Error("Meeting SDK bundle failed.");
for (const project of ["tsconfig.build.json", "tsconfig.consumer.json"]) {
  if (project === "tsconfig.consumer.json") await cp(".types", "dist", { recursive: true });
  const child = Bun.spawn(["./node_modules/.bin/tsrs", "-p", project], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited) throw new Error("Meeting SDK declarations failed.");
}

import { chromium } from "@playwright/test";
const base = new URL(process.argv[2]);
if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname))
  throw new Error("Pass the loopback benchmark URL.");
const browser = await chromium.launch({
  headless: true,
  args: ["--mute-audio", "--use-fake-device-for-media-stream"],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
try {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage(),
    requests = [],
    errors = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
  page.on("pageerror", () => errors.push("page-error"));
  await page.goto(base.href);
  await page.waitForFunction(() => window.__voiceprintBench, {}, { timeout: 120000 });
  const result = await page.evaluate(() => window.__voiceprintBench);
  const offDevice = requests.filter(
    (r) => !r.url.startsWith("blob:") && new URL(r.url).origin !== base.origin,
  ).length;
  const writes = requests.filter((r) => r.method !== "GET").length;
  console.log(
    JSON.stringify({ ...result, offDeviceRequests: offDevice, writeRequests: writes, errors }),
  );
  if (
    !result.ok ||
    result.trust !== "device" ||
    result.dimension !== 192 ||
    !Number.isFinite(result.norm) ||
    Math.abs(result.norm - 1) > 0.001 ||
    result.callerBytes !== 192000 ||
    offDevice ||
    writes ||
    errors.length ||
    (result.nativeCosine !== null &&
      (!Number.isFinite(result.nativeCosine) || result.nativeCosine < 0.999))
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}

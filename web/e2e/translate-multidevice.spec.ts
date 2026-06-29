import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Multi-session (multi-device) proof for the in-browser-LLM translate node.
//
// Two independent browser sessions join the SAME room via the live otoji.org
// signaling Worker, form a WebRTC mesh, and share one authoritative graph. We
// then prove the new behavior: a translate node assigned to session B causes
// session B — and ONLY session B — to instantiate the in-browser LLM engine on
// its own device. The actual translation math (A→B→A routing) is covered
// deterministically by src/__tests__/translate-distributed.test.ts; here we
// exercise the real browser stack: signaling, mesh, graph sync, node ownership.
//
// WebGPU is unavailable in headless Chromium, so we intercept the WebLLM CDN
// import (esm.run) and serve a tiny stub engine — no GPU, no model download.

const DEFAULT_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

const WEBLLM_STUB = `
globalThis.__webllm = globalThis.__webllm || { created: 0 };
export function CreateMLCEngine(model, opts) {
  globalThis.__webllm.created += 1;
  globalThis.__webllm.model = model;
  try { opts && opts.initProgressCallback && opts.initProgressCallback({ progress: 1, text: "ready" }); } catch {}
  return Promise.resolve({
    chat: { completions: { create: async ({ messages }) => {
      const u = [...messages].reverse().find((m) => m.role === "user");
      return { choices: [{ message: { content: "[translated] " + (u ? u.content : "") } }] };
    } } },
  });
}
`;

async function prepare(ctx: BrowserContext) {
  // Make the in-browser LLM "available" without a real GPU.
  await ctx.addInitScript(() => {
    if (!("gpu" in navigator)) {
      Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
    }
  });
  // Serve the stub for any WebLLM import (esm.run/@mlc-ai/web-llm).
  await ctx.route(
    (url) => url.href.includes("web-llm"),
    (route) => route.fulfill({ contentType: "text/javascript", body: WEBLLM_STUB }),
  );
}

async function join(page: Page, room: string, name: string) {
  await page.goto("/?graph");
  await page.getByPlaceholder("room code").fill(room);
  await page.getByPlaceholder("your name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  // Joined toolbar shows the "Share link" action (title was shortened to "otoji").
  await expect(page.getByRole("button", { name: /Share link|link copied/ })).toBeVisible();
}

test("translate node runs the in-browser LLM on its assigned remote device", async ({ browser }) => {
  const ctxA = await browser.newContext({ permissions: ["microphone"] });
  const ctxB = await browser.newContext({ permissions: ["microphone"] });
  await prepare(ctxA);
  await prepare(ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // Unique room so we never collide with other live users.
  const room = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Session A creates the room first, then B joins it.
  await join(a, room, "alice");
  await join(b, room, "bob");

  // Both sessions see each other through the live signaling Worker.
  await expect(a.getByText(/2 device\(s\)/)).toBeVisible();
  await expect(b.getByText(/2 device\(s\)/)).toBeVisible();

  // Session A adds a translate node — palette entries are draggable cards now;
  // clicking one adds the node at a default position.
  await a.locator('[draggable="true"]').filter({ hasText: "Translate (in-browser LLM)" }).click();
  const aNode = a.locator(".react-flow__node").filter({ hasText: "Translate (in-browser LLM)" });
  await expect(aNode).toBeVisible();

  // ...and it syncs to session B through the shared (Durable Object) graph.
  await expect(b.locator(".react-flow__node").filter({ hasText: "Translate (in-browser LLM)" })).toBeVisible();

  // Assign the node to device "bob" from session A (assignment syncs to B).
  await aNode.locator("select").first().selectOption({ label: "bob" });

  // Session B (the owner) instantiates the in-browser LLM engine for that model.
  await expect
    .poll(async () => a.evaluate(() => (window as any).__webllm?.created ?? 0), { timeout: 30_000 })
    .toBe(0); // session A owns no node here → never loads a model
  await expect
    .poll(async () => b.evaluate(() => (window as any).__webllm?.created ?? 0), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  expect(await b.evaluate(() => (window as any).__webllm?.model)).toBe(DEFAULT_MODEL);

  await ctxA.close();
  await ctxB.close();
});

import { test, expect, type BrowserContext, type Page, type Locator } from "@playwright/test";

// Multi-session proof for cross-device live preview (PR #75, graph/preview-sync.ts).
//
// Two independent browser sessions join the SAME room via the live otoji.org
// signaling Worker and form a WebRTC mesh. Session A owns a Camera node (fake
// webcam via the --use-fake-device-for-media-stream chromium flags), so only A
// has the frames. We then prove: B shows NOTHING by default (preview is
// owner-only), and turning the node's preview ON in B subscribes to A, which
// streams the frames over the mesh so B's preview canvas lights up.
//
// Preview rides the P2P data channel, so we wait for the mesh to actually
// connect before driving the toggle — against the live edge ICE can take
// ~10-15s, and toggling before the channel is open would just be a race.

// Flag when a data channel opens on this page, so the test can wait for the mesh.
const MESH_PROBE = () => {
  const w = window as any;
  w.__meshReady = false;
  const Orig = window.RTCPeerConnection;
  class Wrapped extends Orig {
    constructor(...args: any[]) {
      // @ts-ignore
      super(...args);
      this.addEventListener("datachannel", (e: any) => {
        e.channel.addEventListener("open", () => (w.__meshReady = true));
      });
    }
    createDataChannel(...a: any[]) {
      // @ts-ignore
      const dc = super.createDataChannel(...a);
      dc.addEventListener("open", () => (w.__meshReady = true));
      return dc;
    }
  }
  // @ts-ignore
  window.RTCPeerConnection = Wrapped;
};

async function join(page: Page, room: string, name: string) {
  await page.goto("/?graph");
  await page.getByPlaceholder("room code").fill(room);
  await page.getByPlaceholder("your name").fill(name);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("button", { name: /Share link|link copied/ })).toBeVisible();
}

// Count canvas pixels that differ from the preview's #1a202c (rgb 26,32,44)
// background — i.e. how much real image content has been drawn.
async function contentPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx || !c.width) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 26) + Math.abs(d[i + 1] - 32) + Math.abs(d[i + 2] - 44) > 30) n++;
    }
    return n;
  });
}

test("camera preview only crosses devices when the remote turns it on", async ({ browser }) => {
  const ctxA = await browser.newContext({ permissions: ["camera", "microphone"] });
  const ctxB = await browser.newContext({ permissions: ["camera", "microphone"] });
  await ctxA.addInitScript(MESH_PROBE);
  await ctxB.addInitScript(MESH_PROBE);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on("pageerror", (e) => console.log("[A pageerror]", e.message));
  b.on("pageerror", (e) => console.log("[B pageerror]", e.message));

  const room = `e2e-pv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await join(a, room, "alice");
  await join(b, room, "bob");

  await expect(a.getByText(/2 device\(s\)/)).toBeVisible();
  await expect(b.getByText(/2 device\(s\)/)).toBeVisible();

  // Wait for the WebRTC mesh (data channel) to be up on both sides, so the
  // preview subscription/frames aren't dropped before a channel exists.
  await expect.poll(() => a.evaluate(() => (window as any).__meshReady), { timeout: 60_000, message: "mesh (data channel) never opened on A" }).toBe(true);
  await expect.poll(() => b.evaluate(() => (window as any).__meshReady), { timeout: 60_000, message: "mesh (data channel) never opened on B" }).toBe(true);

  // A adds a Camera node; it syncs to B through the shared graph.
  await a.locator('[draggable="true"]').filter({ hasText: "Camera" }).first().click();
  const aNode = a.locator(".react-flow__node").filter({ hasText: "Camera" });
  const bNode = b.locator(".react-flow__node").filter({ hasText: "Camera" });
  await expect(aNode).toBeVisible();
  await expect(bNode).toBeVisible();

  // Assign the camera to alice (A) so A is the deterministic owner / capturer.
  // The local device is labelled "alice (me)", so resolve the option by value.
  const assign = aNode.locator("select").first();
  const aliceValue = await assign.evaluate((sel: HTMLSelectElement) => {
    const opt = [...sel.options].find((o) => (o.textContent ?? "").trim().startsWith("alice"));
    return opt?.value ?? "";
  });
  expect(aliceValue).not.toBe("");
  await assign.selectOption(aliceValue);

  // A owns it → preview shown by default → A's own canvas fills with the fake
  // webcam (proves the node is actually capturing on the owner).
  const aCanvas = aNode.locator("canvas").first();
  await expect(aCanvas).toBeVisible();
  await expect.poll(() => contentPixels(aCanvas), { timeout: 30_000, message: "owner A canvas never showed camera frames" }).toBeGreaterThan(200);

  // B is a NON-owner → preview is OFF by default: the toggle reads "show preview"
  // and there is no preview canvas rendered yet.
  const bToggle = bNode.locator('button[title="show preview"]');
  await expect(bToggle).toBeVisible();
  expect(await bNode.locator("canvas").count()).toBe(0);

  // Turn preview ON in B → subscribe to A → A streams frames over the mesh.
  await bToggle.click();
  const bCanvas = bNode.locator("canvas").first();
  await expect(bCanvas).toBeVisible();
  await expect.poll(() => contentPixels(bCanvas), { timeout: 30_000, message: "B never received A's camera preview after opting in" }).toBeGreaterThan(200);

  // PROBE: turn preview OFF in B → owner stops streaming, canvas unmounts.
  await bNode.locator('button[title="hide preview"]').click();
  await expect(bNode.locator("canvas")).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

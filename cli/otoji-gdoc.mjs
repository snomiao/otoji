// otoji gdoc — realtime Google Docs bridge for the web app's google-doc-live node.
//
//   npx otoji gdoc [doc-url-or-id] [--port 8992] [--chrome <path>] [-d]
//
// Runs a headless Chrome (raw CDP over the DevTools WebSocket — no Playwright,
// keeping the CLI zero-dep) with one tab per requested doc. A pre-load XHR hook
// watches the Docs realtime sync channel (/bind); whenever content-mutation ops
// arrive, the bridge re-exports the doc as text *inside the page* (same-origin,
// so the tab's cookies apply) and pushes it to subscribers over SSE:
//
//   GET /live?doc=<docId>   → text/event-stream of {"text","docId","ts"} frames
//   GET /                   → status JSON
//
// Docs served this way must be readable by the headless profile — public
// ("anyone with link") docs work out of the box; for private docs sign in once
// with --headed (the profile at ~/.otoji/gdoc-chrome persists).
//
// Requires Node 22+ (global WebSocket + fetch).

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PORT = 8992;
// Re-export at most ~1/s under bursts, and refresh every 60s as a safety net
// for ops the sniffer misses (e.g. a bind channel reconnect).
const DEBOUNCE_MS = 400;
const MIN_FETCH_GAP_MS = 1000;
const SAFETY_REFRESH_MS = 60_000;

// Pre-load hook: count content mutations ("is"=insert, "ds"=delete, "mlti"=
// batch) on the /bind long-poll stream. The bridge polls __otojiGdocDrain and
// treats any nonzero count as "doc changed, re-export now".
const HOOK_JS = `(() => {
  if (!/docs\\.google\\.com$/.test(location.hostname)) return;
  window.__otojiGdocOps = 0;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__otojiUrl = String(u); return origOpen.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function (...a) {
    if (this.__otojiUrl && this.__otojiUrl.includes("/bind")) {
      let seen = 0;
      const tap = () => {
        try {
          if (this.readyState >= 3 && this.responseText.length > seen) {
            const chunk = this.responseText.slice(seen);
            seen = this.responseText.length;
            const n = (chunk.match(/"ty":"(?:is|ds|mlti)"/g) || []).length;
            if (n) window.__otojiGdocOps += n;
          }
        } catch {}
      };
      this.addEventListener("progress", tap);
      this.addEventListener("load", tap);
    }
    return origSend.apply(this, a);
  };
  window.__otojiGdocDrain = () => { const n = window.__otojiGdocOps; window.__otojiGdocOps = 0; return n; };
})();`;

function findChrome(explicit) {
  if (explicit) return explicit;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : process.platform === "win32"
      ? [join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Google/Chrome/Application/chrome.exe")]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found — pass --chrome <path> or set $CHROME_PATH");
  return found;
}

/** Minimal CDP client over the DevTools WebSocket (flat session mode). */
class Cdp {
  constructor(ws, log) {
    this.ws = ws;
    this.log = log;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  /** Evaluate an expression in a tab; returns the value (awaits promises). */
  async eval(sessionId, expression, { awaitPromise = false } = {}) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId);
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  }
}

async function launchChrome(chromePath, { headed, log }) {
  const profile = join(homedir(), ".otoji", "gdoc-chrome");
  mkdirSync(profile, { recursive: true });
  const args = [
    ...(headed ? [] : ["--headless=new"]),
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "about:blank",
  ];
  const child = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    const timeout = setTimeout(() => reject(new Error("Chrome did not print a DevTools URL in 20s")), 20_000);
    child.stderr.on("data", (d) => {
      buf += d.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(timeout); resolve(m[1]); }
    });
    child.on("exit", (code) => { clearTimeout(timeout); reject(new Error(`Chrome exited early (code ${code})`)); });
  });
  log("chrome devtools:", wsUrl);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("DevTools WebSocket failed")); });
  return { child, cdp: new Cdp(ws, log) };
}

export async function gdocServe(argv) {
  const args = [...argv];
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    if (i === -1) return fallback;
    const v = args.splice(i, 2)[1];
    return v ?? fallback;
  };
  const debug = args.includes("-d") || args.includes("--debug");
  const headed = args.includes("--headed");
  const port = Number(flag("--port", DEFAULT_PORT)) || DEFAULT_PORT;
  const chromePath = findChrome(flag("--chrome"));
  const log = (...a) => debug && console.error("[otoji gdoc]", ...a);
  const positional = args.filter((a) => !a.startsWith("-"));

  const parseDocId = (s) => {
    const m = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(s ?? "");
    return m ? m[1] : /^[\w-]{20,}$/.test(s ?? "") ? s : null;
  };

  const { child, cdp } = await launchChrome(chromePath, { headed, log });
  const docs = new Map(); // docId → { sessionId, text, subscribers:Set<res>, timers }

  const broadcast = (doc, payload) => {
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of doc.subscribers) res.write(frame);
  };

  const exportText = async (docId, doc) => {
    doc.lastFetch = Date.now();
    // Fetch from Node with the headless profile's cookies (the docs page's CSP
    // blocks an in-page fetch of the export endpoint).
    const { cookies } = await cdp.send("Storage.getCookies", {});
    const cookie = cookies.filter((c) => c.domain.endsWith("google.com")).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, { headers: cookie ? { cookie } : {} });
    if (!res.ok) throw new Error(`export HTTP ${res.status}`);
    const raw = await res.text();
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
    if (/^\s*</.test(text)) throw new Error("doc not readable (login or link-sharing required)");
    if (text !== doc.text) {
      doc.text = text;
      log(`doc ${docId}: ${text.length} chars`);
      broadcast(doc, { docId, text, ts: Date.now() });
    }
  };

  const ensureDoc = async (input) => {
    const docId = parseDocId(input);
    if (!docId) throw new Error(`not a Google Docs URL or id: ${input}`);
    if (docs.has(docId)) return docs.get(docId);
    const doc = { sessionId: null, text: null, subscribers: new Set(), pending: null };
    docs.set(docId, doc);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    doc.sessionId = sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK_JS }, sessionId);
    await cdp.send("Page.navigate", { url: `https://docs.google.com/document/d/${docId}/edit` }, sessionId);
    log(`doc ${docId}: tab opened`);

    // Change-driven export with burst debounce; periodic safety refresh.
    let lastSafety = 0;
    const tick = async () => {
      try {
        const ops = await cdp.eval(sessionId, "window.__otojiGdocDrain ? window.__otojiGdocDrain() : 0");
        const now = Date.now();
        const due = ops > 0 || doc.text === null || now - lastSafety > SAFETY_REFRESH_MS;
        if (due && now - (doc.lastFetch ?? 0) >= MIN_FETCH_GAP_MS) {
          lastSafety = now;
          await exportText(docId, doc);
        }
      } catch (e) {
        log(`doc ${docId}:`, e.message);
        if (doc.text === null) broadcast(doc, { docId, error: e.message, ts: Date.now() });
      }
      doc.pending = setTimeout(tick, DEBOUNCE_MS);
    };
    doc.pending = setTimeout(tick, 2000); // let the editor boot before the first export
    return doc;
  };

  if (positional[0]) await ensureDoc(positional[0]);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
    if (url.pathname === "/live") {
      try {
        const doc = await ensureDoc(url.searchParams.get("doc") ?? "");
        res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", Connection: "keep-alive" });
        doc.subscribers.add(res);
        if (doc.text !== null) res.write(`data: ${JSON.stringify({ text: doc.text, ts: Date.now() })}\n\n`);
        const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
        req.on("close", () => { clearInterval(ping); doc.subscribers.delete(res); });
      } catch (e) {
        res.writeHead(400, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    res.writeHead(url.pathname === "/" ? 200 : 404, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, docs: [...docs.keys()], subscribers: [...docs.values()].reduce((n, d) => n + d.subscribers.size, 0) }));
  });
  server.listen(port, "127.0.0.1", () => {
    console.error(`otoji gdoc bridge on http://127.0.0.1:${port}/live?doc=<docId>  (Chrome ${headed ? "headed" : "headless"})`);
  });

  const shutdown = () => { try { child.kill(); } catch {} process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", () => { console.error("otoji gdoc: Chrome exited"); process.exit(1); });
  await new Promise(() => {}); // serve until killed
}

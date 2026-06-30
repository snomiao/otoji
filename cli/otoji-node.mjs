#!/usr/bin/env node
// otoji-node — bridge a terminal's stdio to a "CLI pipe" node in an otoji graph.
//
//   otoji-node <room> [-d]       (installed bin; or: node cli/otoji-node.mjs <room>)
//     <room>   the room code (e.g. blue-otter-7x2k), or $OTOJI_ROOM
//     -d       debug: log activity to stderr
//
// Text arriving at a pipe node in the graph is written to stdout (one line per
// message); each line read from stdin is sent into the graph's pipe node(s).
// So you can wire CLI tools into the graph, e.g.:
//
//   otoji node my-room | grep foo
//   some-producer | otoji node my-room
//   otoji node my-room -d            # interactive, with debug
//
// Connects to the signaling relay over a plain WebSocket (no WebRTC needed).
// Requires a global WebSocket (Node 22+, Bun, or Deno).

import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const debug = args.includes("-d") || args.includes("--debug");
const room = (args.find((a) => !a.startsWith("-")) || process.env.OTOJI_ROOM || "").trim();
const signal = (process.env.OTOJI_SIGNAL || "wss://otoji.org/signal").replace(/\/+$/, "");
const log = (...a) => debug && console.error("[otoji node]", ...a);

if (!room) {
  console.error("usage: otoji-node <room> [-d]   (room code, or set $OTOJI_ROOM)");
  process.exit(2);
}
if (typeof WebSocket === "undefined") {
  console.error("otoji node needs a global WebSocket — run with Node 22+, Bun, or Deno.");
  process.exit(1);
}

const deviceId = "cli-" + Math.random().toString(36).slice(2, 10);
const url = `${signal}/${encodeURIComponent(room)}?name=cli&deviceId=${deviceId}&role=general&hasMic=false`;
log("connecting", url);

let ws;
let ping;
let stopped = false;
const outbox = []; // stdin lines awaiting an open socket (so early/reconnect input isn't lost)

function flush() {
  while (ws && ws.readyState === 1 /* OPEN */ && outbox.length) {
    const text = outbox.shift();
    try { ws.send(JSON.stringify({ type: "pipe", node: "*", text, src: "cli" })); } catch { outbox.unshift(text); break; }
  }
}

function connect() {
  ws = new WebSocket(url);

  ws.onopen = () => {
    log("connected to room", room);
    ping = setInterval(() => { try { ws.send(JSON.stringify({ type: "ping" })); } catch {} }, 10000);
    flush(); // send anything queued before the socket opened
  };

  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
    // Text from a graph pipe node -> stdout.
    if (m && m.type === "pipe" && m.src === "node" && typeof m.text === "string") {
      process.stdout.write(m.text + "\n");
      log("graph →", m.text);
    }
  };

  ws.onclose = () => {
    clearInterval(ping);
    if (stopped) return;
    log("disconnected — reconnecting in 1s");
    setTimeout(connect, 1000); // simple reconnect
  };
  ws.onerror = (e) => log("ws error", e?.message ?? e);
}

connect();

// stdin lines -> graph pipe node(s). node "*" = all pipe nodes in the room. The
// line content is relayed as-is (no trimming); queued until the socket is open.
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  outbox.push(line);
  log("→ graph", line);
  flush();
});
rl.on("close", () => { stopped = true; try { ws?.close(); } catch {} process.exit(0); });

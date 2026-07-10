/**
 * otoji signaling server — Cloudflare Worker + Durable Object.
 *
 * Route: otoji.org/signal/{room}  (room == pairing code)
 *   - WebSocket upgrade -> forwarded to the room's Durable Object.
 *   - The DO tracks peer presence, relays WebRTC signaling (SDP/ICE) between
 *     peers, and holds the authoritative shared graph JSON (broadcast on edit).
 *
 * Route: otoji.org/signal/{room}/graph  (federation feed)
 *   - GET returns the room's last published org.rgui.graph.v1 envelope with
 *     open CORS, so other rgui apps (agent-yes viewer etc.) can mirror the
 *     room. Knowing the room code IS the read capability — the same code
 *     already lets anyone join the room over WS.
 *
 * Protocol (JSON over WS):
 *   server->peer: hello{peerId,peers[],graph}, peer-joined{peer}, peer-left{peerId},
 *                 signal{from,data}, graph{graph,by?}, pong
 *   peer->server: signal{to,data}, graph-patch{graph}, graph-get, ping,
 *                 fed-graph{graph} (publish the room's federation envelope)
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/signal" || url.pathname === "/signal/") {
      return Response.json({ ok: true, service: "otoji-signal", usage: "/signal/{room} (WebSocket)" }, { headers: CORS });
    }

    const m = url.pathname.match(/^\/signal\/([^/]+)(\/graph)?\/?$/);
    if (!m) return new Response("not found", { status: 404, headers: CORS });

    const room = decodeURIComponent(m[1]);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(req);
  },
};

interface PeerMeta {
  peerId: string;
  deviceId: string;
  name: string;
  role: string;
  hasMic: boolean;
  runtime: string; // "browser" | "node" — what the peer is running
  net: string; // "lan" | "wan" | "" — a node peer's link to this relay
  lastSeen: number;
  winStart: number; // rate-limit window start (ms)
  winCount: number; // messages seen in the current window
}

const STALE_MS = 30000; // prune sockets silent for >30s (client pings every ~10s)
const ALARM_MS = 15000;

// Abuse limits. The relay is unauthenticated, so bound what one room/socket can
// do: connection count (DO memory), message size + rate (flood), and graph size
// + node count (storage + broadcast amplification).
const MAX_PEERS = 32;
const MAX_MSG_BYTES = 256 * 1024;
const MAX_GRAPH_BYTES = 128 * 1024;
const MAX_GRAPH_NODES = 200;
const RATE_WINDOW_MS = 10000;
const RATE_MAX = 300; // messages per window per socket (pings + negotiation bursts)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RoomDurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Federation feed: the last envelope a room peer published via fed-graph.
    if (/\/graph\/?$/.test(url.pathname)) {
      if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS });
      const env = await this.state.storage.get("fedgraph");
      if (env == null) return new Response("no federated graph published", { status: 404, headers: CORS });
      return Response.json(env, { headers: { ...CORS, "Cache-Control": "no-store" } });
    }

    if (req.headers.get("Upgrade") !== "websocket") {
      return Response.json({ ok: true, peers: this.peers().length }, { headers: CORS });
    }

    if (this.state.getWebSockets().length >= MAX_PEERS) {
      return new Response("room full", { status: 503, headers: CORS });
    }

    const name = (url.searchParams.get("name") || "device").slice(0, 64);
    const deviceId = (url.searchParams.get("deviceId") || crypto.randomUUID()).slice(0, 100);
    const role = (url.searchParams.get("role") || "general").slice(0, 16);
    const hasMic = url.searchParams.get("hasMic") !== "0";
    // Connection-type badge: what the peer runs ("browser"/"node") and, for a
    // node CLI, whether it reaches this relay over the LAN or the WAN. Self-
    // reported (relayed verbatim) — purely advisory UI metadata.
    const runtime = (url.searchParams.get("runtime") || "browser").slice(0, 16);
    const net = (url.searchParams.get("net") || "").slice(0, 8);
    // A client may supply a stable peerId (one identity across a federated server
    // set). Only accept a well-formed UUID — a crafted/short id is replaced with
    // a server-minted one so callers can't spoof structured identities.
    const reqPeerId = url.searchParams.get("peerId") || "";
    const peerId = UUID_RE.test(reqPeerId) ? reqPeerId : crypto.randomUUID();

    // Never let two live sockets share a peerId: that would let signal{to:id}
    // be misrouted to whichever socket enumerates first (impersonation). Close
    // any prior socket with this id — this is also the clean reconnect path.
    for (const old of this.state.getWebSockets(peerId)) {
      try {
        old.close(1000, "replaced");
      } catch {
        /* already gone */
      }
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, deviceId, name, role, hasMic, runtime, net, lastSeen: Date.now(), winStart: Date.now(), winCount: 0 } satisfies PeerMeta);

    server.send(JSON.stringify({ type: "hello", peerId, peers: this.peers(peerId), graph: await this.getGraph() }));
    this.broadcast({ type: "peer-joined", peer: { peerId, deviceId, name, role, hasMic, runtime, net } }, peerId);
    await this.ensureAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const self = ws.deserializeAttachment() as PeerMeta | null;
    if (!self || typeof message !== "string") return;

    // Byte length, not UTF-16 code-unit count (.length): a non-ASCII payload can
    // be several times larger in bytes, so cap on the real wire size.
    const byteLen = new TextEncoder().encode(message).byteLength;
    if (byteLen > MAX_MSG_BYTES) {
      try {
        ws.close(1009, "message too large");
      } catch {
        /* gone */
      }
      return;
    }

    // Per-socket token bucket + liveness: refresh lastSeen, count messages in a
    // sliding window, and close floods. Pings (~1/10s) stay far under the cap.
    const now = Date.now();
    let winStart = self.winStart;
    let winCount = self.winCount;
    if (!winStart || now - winStart > RATE_WINDOW_MS) {
      winStart = now;
      winCount = 0;
    }
    winCount += 1;
    ws.serializeAttachment({ ...self, lastSeen: now, winStart, winCount } satisfies PeerMeta);
    if (winCount > RATE_MAX) {
      try {
        ws.close(1008, "rate limit");
      } catch {
        /* gone */
      }
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    switch (msg.type) {
      case "signal": {
        const target = this.socketById(msg.to);
        target?.send(JSON.stringify({ type: "signal", from: self.peerId, data: msg.data }));
        break;
      }
      case "graph-patch": {
        // Bound stored/broadcast graph: drop oversized payloads or node floods
        // so one peer can't exhaust DO storage or amplify to the whole room.
        const g = msg.graph;
        if (byteLen > MAX_GRAPH_BYTES) break; // reject oversized before any work
        const nodeCount = g && typeof g === "object" && g.nodes ? Object.keys(g.nodes).length : 0;
        if (nodeCount > MAX_GRAPH_NODES) break;
        await this.state.storage.put("graph", g);
        this.broadcast({ type: "graph", graph: g, by: self.peerId }, self.peerId);
        break;
      }
      case "graph-get": {
        ws.send(JSON.stringify({ type: "graph", graph: await this.getGraph() }));
        break;
      }
      case "fed-graph": {
        // A peer publishes the room's federation envelope (org.rgui.graph.v1),
        // served read-only at GET /signal/{room}/graph. Same bounds as
        // graph-patch; a light shape check keeps arbitrary blobs out.
        const env = msg.graph;
        if (byteLen > MAX_GRAPH_BYTES) break;
        if (!env || typeof env !== "object" || env.kind !== "rgui-federated-graph" || !env.graph) break;
        const nodes = Array.isArray(env.graph.nodes) ? env.graph.nodes.length : Infinity;
        if (nodes > MAX_GRAPH_NODES) break;
        await this.state.storage.put("fedgraph", env);
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }
      case "pipe": {
        // Relay raw text between graph pipe nodes and external `otoji node` CLIs.
        this.broadcast({ type: "pipe", node: msg.node, text: msg.text, src: msg.src }, self.peerId);
        break;
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.dropped(ws);
  }
  webSocketError(ws: WebSocket): void {
    this.dropped(ws);
  }

  private dropped(ws: WebSocket): void {
    const self = ws.deserializeAttachment() as PeerMeta | null;
    if (!self) return;
    // If a reconnect already replaced us, another live socket holds this peerId;
    // announcing a leave would wrongly mark the new connection offline.
    const stillLive = this.state.getWebSockets(self.peerId).some((s) => s !== ws);
    if (stillLive) return;
    this.broadcast({ type: "peer-left", peerId: self.peerId, deviceId: self.deviceId }, self.peerId);
  }

  private peers(exceptId?: string): PeerMeta[] {
    const out: PeerMeta[] = [];
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() as PeerMeta | null;
      if (a && a.peerId !== exceptId) out.push(a);
    }
    return out;
  }

  private socketById(id: string): WebSocket | null {
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() as PeerMeta | null;
      if (a?.peerId === id) return ws;
    }
    return null;
  }

  private broadcast(msg: unknown, exceptId?: string): void {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() as PeerMeta | null;
      if (a && a.peerId !== exceptId) {
        try {
          ws.send(s);
        } catch {
          /* peer gone */
        }
      }
    }
  }

  private async getGraph(): Promise<unknown> {
    return (await this.state.storage.get("graph")) ?? null;
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.state.storage.getAlarm()) == null) {
      await this.state.storage.setAlarm(Date.now() + ALARM_MS);
    }
  }

  // Prune ghost sockets: clients that dropped without a clean close stop sending
  // heartbeats; close them and broadcast peer-left so devices show offline.
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() as PeerMeta | null;
      if (a && now - a.lastSeen > STALE_MS) {
        try {
          ws.close(1001, "stale");
        } catch {
          /* already gone */
        }
        this.broadcast({ type: "peer-left", peerId: a.peerId, deviceId: a.deviceId }, a.peerId);
      }
    }
    if (this.state.getWebSockets().length > 0) {
      await this.state.storage.setAlarm(now + ALARM_MS);
    }
  }
}

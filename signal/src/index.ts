/**
 * otoji signaling server — Cloudflare Worker + Durable Object.
 *
 * Route: otoji.org/signal/{room}  (room == pairing code)
 *   - WebSocket upgrade -> forwarded to the room's Durable Object.
 *   - The DO tracks peer presence, relays WebRTC signaling (SDP/ICE) between
 *     peers, and holds the authoritative shared graph JSON (broadcast on edit).
 *
 * Protocol (JSON over WS):
 *   server->peer: hello{peerId,peers[],graph}, peer-joined{peer}, peer-left{peerId},
 *                 signal{from,data}, graph{graph,by?}, pong
 *   peer->server: signal{to,data}, graph-patch{graph}, graph-get, ping
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

    const m = url.pathname.match(/^\/signal\/([^/]+)\/?$/);
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
  lastSeen: number;
}

const STALE_MS = 30000; // prune sockets silent for >30s (client pings every ~10s)
const ALARM_MS = 15000;

export class RoomDurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.headers.get("Upgrade") !== "websocket") {
      return Response.json({ ok: true, peers: this.peers().length }, { headers: CORS });
    }

    const name = (url.searchParams.get("name") || "device").slice(0, 64);
    const deviceId = (url.searchParams.get("deviceId") || crypto.randomUUID()).slice(0, 100);
    const role = (url.searchParams.get("role") || "general").slice(0, 16);
    const hasMic = url.searchParams.get("hasMic") !== "0";
    const peerId = crypto.randomUUID();

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, deviceId, name, role, hasMic, lastSeen: Date.now() } satisfies PeerMeta);

    server.send(JSON.stringify({ type: "hello", peerId, peers: this.peers(peerId), graph: await this.getGraph() }));
    this.broadcast({ type: "peer-joined", peer: { peerId, deviceId, name, role, hasMic } }, peerId);
    await this.ensureAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const self = ws.deserializeAttachment() as PeerMeta | null;
    if (!self || typeof message !== "string") return;

    // Liveness: refresh lastSeen on any inbound message (incl. heartbeat pings).
    ws.serializeAttachment({ ...self, lastSeen: Date.now() } satisfies PeerMeta);

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
        await this.state.storage.put("graph", msg.graph);
        this.broadcast({ type: "graph", graph: msg.graph, by: self.peerId }, self.peerId);
        break;
      }
      case "graph-get": {
        ws.send(JSON.stringify({ type: "graph", graph: await this.getGraph() }));
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
    if (self) this.broadcast({ type: "peer-left", peerId: self.peerId, deviceId: self.deviceId }, self.peerId);
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

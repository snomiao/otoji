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
  name: string;
}

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
    const peerId = crypto.randomUUID();

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, name } satisfies PeerMeta);

    server.send(JSON.stringify({ type: "hello", peerId, peers: this.peers(peerId), graph: await this.getGraph() }));
    this.broadcast({ type: "peer-joined", peer: { peerId, name } }, peerId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const self = ws.deserializeAttachment() as PeerMeta | null;
    if (!self || typeof message !== "string") return;

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
    if (self) this.broadcast({ type: "peer-left", peerId: self.peerId }, self.peerId);
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
}

// WebSocket signaling client for the otoji-signal Worker.
// Reconnects with golden-ratio (φ) backoff. Emits typed server messages.

import { backoffDelay } from "../lib/backoff";
import { DEFAULT_SIGNAL_BASE, toSocketUrl } from "../lib/trackers";

// Re-exported for callers/tests that import it from here. The canonical tracker
// form is http(s) (see lib/trackers); connect() converts to ws(s) per-socket.
export { DEFAULT_SIGNAL_BASE };

export interface Peer {
  peerId: string;
  deviceId: string;
  name: string;
  role: string;
  hasMic: boolean;
}

export type Handler = (msg: any) => void;

/**
 * The surface PeerMesh / GraphEditor depend on. Both the single-server
 * SignalingClient and the federated MultiSignalingClient implement it, so they
 * are drop-in interchangeable.
 */
export interface Signaling {
  peerId: string | null;
  on(type: string, fn: Handler): () => void;
  signal(to: string, data: unknown): void;
  patchGraph(graph: unknown): void;
  getGraph(): void;
  pipe(node: string, text: string, src: "node" | "cli"): void;
  connect(): void;
  close(): void;
}

export class SignalingClient implements Signaling {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private closedByUser = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  peerId: string | null = null;

  constructor(
    private room: string,
    private name: string,
    private deviceId: string = "",
    private role: string = "general",
    private hasMic: boolean = true,
    private base: string = DEFAULT_SIGNAL_BASE,
    // A stable, client-chosen peer id. When set it is reused across every
    // signaling server (so a device has ONE identity across a federated set);
    // when null the server mints a fresh per-connection UUID (legacy behavior).
    peerId: string | null = null,
  ) {
    this.peerId = peerId;
  }

  on(type: string, fn: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  private emit(type: string, msg: any): void {
    this.handlers.get(type)?.forEach((h) => h(msg));
    this.handlers.get("*")?.forEach((h) => h({ type, ...msg }));
  }

  connect(): void {
    this.closedByUser = false;
    // base is canonical http(s); a wss endpoint lives at the same origin.
    const url =
      `${toSocketUrl(this.base)}/${encodeURIComponent(this.room)}?name=${encodeURIComponent(this.name)}&deviceId=${encodeURIComponent(this.deviceId)}&role=${encodeURIComponent(this.role)}&hasMic=${this.hasMic ? "1" : "0"}` +
      (this.peerId ? `&peerId=${encodeURIComponent(this.peerId)}` : "");
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emit("open", {});
      // Heartbeat so the server can detect & prune us if we drop uncleanly.
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ type: "ping" }), 10000);
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "hello") this.peerId = msg.peerId;
      this.emit(msg.type, msg);
    };
    ws.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.emit("close", {});
      if (this.closedByUser) return;
      this.attempt += 1;
      const delay = backoffDelay(this.attempt);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  signal(to: string, data: unknown): void {
    this.send({ type: "signal", to, data });
  }
  patchGraph(graph: unknown): void {
    this.send({ type: "graph-patch", graph });
  }
  getGraph(): void {
    this.send({ type: "graph-get" });
  }
  /** Relay raw text to/from external `otoji node` CLIs (src: "node" | "cli"). */
  pipe(node: string, text: string, src: "node" | "cli"): void {
    this.send({ type: "pipe", node, text, src });
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// WebSocket signaling client for the otoji-signal Worker.
// Reconnects with golden-ratio (φ) backoff. Emits typed server messages.

import { backoffDelay } from "../lib/backoff";

export const DEFAULT_SIGNAL_BASE = "wss://otoji.org/signal";

export interface Peer {
  peerId: string;
  name: string;
}

type Handler = (msg: any) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private closedByUser = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  peerId: string | null = null;

  constructor(
    private room: string,
    private name: string,
    private base: string = DEFAULT_SIGNAL_BASE,
  ) {}

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
    const url = `${this.base}/${encodeURIComponent(this.room)}?name=${encodeURIComponent(this.name)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emit("open", {});
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

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

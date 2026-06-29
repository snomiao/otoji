// Adapts the WebRTC PeerMesh to the runtime's Transport interface: edge frames
// are JSON over the default data channel. GraphEditor wires the mesh's onData
// into `handleData`.
//
// RTCDataChannel messages have a max size (~256KB, but the interop-safe floor is
// ~16KB), and a raw audio segment frame is hundreds of KB — so frames larger
// than CHUNK are split into ordered pieces and reassembled on the receiver.

import type { Transport } from "./runtime";
import type { EdgeFrame } from "./frames";
import type { PeerMesh } from "../net/peers";

const CHUNK = 15000; // chars per data-channel message (safe under the 16KB floor)

interface ChunkMsg {
  k: "chunk";
  id: string;
  i: number;
  n: number;
  d: string;
}

export class PeerMeshTransport implements Transport {
  private receiver: ((f: EdgeFrame) => void) | null = null;
  private mesh: PeerMesh | null;
  private routing: Record<string, string> = {}; // stable deviceId -> current ephemeral peerId
  private incoming = new Map<string, { parts: string[]; got: number }>();
  private seq = 0;
  sent = 0;
  recv = 0;
  dropped = 0; // sends that failed (no route / no open channel)

  constructor(mesh: PeerMesh | null = null) {
    this.mesh = mesh;
  }

  /** Swap the underlying mesh on reconnect — keeps this transport (and any
   *  running runtime holding it) live across signaling reconnects. */
  setMesh(mesh: PeerMesh): void {
    this.mesh = mesh;
  }

  /** deviceId -> peerId map for currently-online devices (updated on presence). */
  setRouting(map: Record<string, string>): void {
    this.routing = map;
  }

  private raw(peerId: string, s: string): boolean {
    try {
      return this.mesh?.send(peerId, s) ?? false;
    } catch {
      return false;
    }
  }

  send(toDevice: string, frame: EdgeFrame): void {
    const peerId = this.routing[toDevice];
    if (!peerId) {
      this.dropped++;
      return;
    }
    const json = JSON.stringify(frame);
    if (json.length <= CHUNK) {
      this.raw(peerId, json) ? this.sent++ : this.dropped++;
      return;
    }
    // Split oversized frames into ordered chunks (data channel is reliable+ordered).
    const id = `${this.seq++}-${Math.random().toString(36).slice(2, 8)}`;
    const n = Math.ceil(json.length / CHUNK);
    let ok = true;
    for (let i = 0; i < n; i++) {
      const piece: ChunkMsg = { k: "chunk", id, i, n, d: json.slice(i * CHUNK, (i + 1) * CHUNK) };
      if (!this.raw(peerId, JSON.stringify(piece))) ok = false;
    }
    ok ? this.sent++ : this.dropped++;
  }

  setReceiver(cb: (f: EdgeFrame) => void): void {
    this.receiver = cb;
  }

  /** Called by the PeerMesh onData callback for each inbound message. */
  handleData(data: string): void {
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg?.k === "chunk") {
      let buf = this.incoming.get(msg.id);
      if (!buf) {
        buf = { parts: new Array(msg.n), got: 0 };
        this.incoming.set(msg.id, buf);
      }
      if (buf.parts[msg.i] === undefined) {
        buf.parts[msg.i] = msg.d;
        buf.got++;
      }
      if (buf.got === msg.n) {
        this.incoming.delete(msg.id);
        try {
          const f = JSON.parse(buf.parts.join(""));
          if (f?.kind === "edge") {
            this.recv++;
            this.receiver?.(f as EdgeFrame);
          }
        } catch {
          /* malformed reassembly */
        }
      }
      return;
    }
    if (msg?.kind === "edge") {
      this.recv++;
      this.receiver?.(msg as EdgeFrame);
    }
  }
}

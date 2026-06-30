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
import { bytesToBase64, base64ToBytes } from "../lib/base64";

const CHUNK = 15000; // chars per data-channel message (safe under the 16KB floor)

interface ChunkMsg {
  k: "chunk";
  id: string;
  i: number;
  n: number;
  d: string;
}

interface PendingBlob {
  fromPeer: string | null; // lock to the first responder so two peers don't interleave
  parts: string[];
  got: number;
  n: number;
  expected: number; // peers the request was broadcast to
  misses: number; // peers that replied "I don't have it"
  resolve: (b: ArrayBuffer | null) => void;
  timer: ReturnType<typeof setTimeout>;
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

  // --- P2P model/blob sharing (room) ---
  private pendingBlobs = new Map<string, PendingBlob>();
  /** Returns the bytes this device can serve for a url, or null. Set by GraphEditor. */
  onBlobRequest: ((url: string) => ArrayBuffer | null | Promise<ArrayBuffer | null>) | null = null;

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

  send(toDevice: string, frame: EdgeFrame): boolean {
    const peerId = this.routing[toDevice];
    if (!peerId) {
      this.dropped++;
      return false;
    }
    const json = JSON.stringify(frame);
    if (json.length <= CHUNK) {
      const ok = this.raw(peerId, json);
      ok ? this.sent++ : this.dropped++;
      return ok;
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
    return ok;
  }

  setReceiver(cb: (f: EdgeFrame) => void): void {
    this.receiver = cb;
  }

  /** Ask the room for a model file's bytes; resolves with the first peer's bytes
   *  (or null on timeout / no peer has it). */
  requestBlob(url: string, timeoutMs = 60000): Promise<ArrayBuffer | null> {
    if (!this.mesh) return Promise.resolve(null);
    const reqId = `b${this.seq++}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingBlobs.delete(reqId);
        resolve(null);
      }, timeoutMs);
      const sent = this.mesh!.broadcast(JSON.stringify({ k: "blob-req", reqId, url }));
      if (sent === 0) {
        clearTimeout(timer);
        resolve(null); // no peers
        return;
      }
      this.pendingBlobs.set(reqId, { fromPeer: null, parts: [], got: 0, n: -1, expected: sent, misses: 0, resolve, timer });
    });
  }

  // Stream a blob to a peer: encode per byte-window (no whole-file base64 copy)
  // and pause when the channel's send buffer is high so large model files don't
  // overflow the data channel.
  private async serveBlob(peerId: string, reqId: string, bytes: ArrayBuffer): Promise<void> {
    const u8 = new Uint8Array(bytes);
    // 10800 bytes -> 14400 base64 chars; with the JSON envelope the message stays
    // under the ~15KB interop-safe data-channel floor (same budget as CHUNK).
    const BYTES_PER_CHUNK = 10800;
    const HIGH_WATER = 1 << 20; // 1MB queued -> wait
    const n = Math.max(1, Math.ceil(u8.length / BYTES_PER_CHUNK));
    for (let i = 0; i < n; i++) {
      for (let guard = 0; guard < 1200; guard++) {
        const buffered = this.mesh?.bufferedAmount(peerId) ?? -1;
        if (buffered < 0) return; // channel closed mid-transfer
        if (buffered < HIGH_WATER) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const slice = u8.subarray(i * BYTES_PER_CHUNK, (i + 1) * BYTES_PER_CHUNK);
      if (!this.raw(peerId, JSON.stringify({ k: "blob-data", reqId, i, n, d: bytesToBase64(slice) }))) return;
    }
  }

  /** Called by the PeerMesh onData callback for each inbound message. peerId is
   *  the sender (needed to reply to blob requests). */
  handleData(data: string, peerId?: string): void {
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg?.k === "blob-req") {
      if (!peerId) return;
      Promise.resolve(this.onBlobRequest?.(msg.url) ?? null).then((bytes) => {
        if (bytes) this.serveBlob(peerId, msg.reqId, bytes);
        else this.raw(peerId, JSON.stringify({ k: "blob-miss", reqId: msg.reqId })); // fast "I don't have it"
      });
      return;
    }
    if (msg?.k === "blob-miss") {
      const p = this.pendingBlobs.get(msg.reqId);
      if (!p || p.fromPeer) return; // ignore once a real responder locked in
      if (++p.misses >= p.expected) {
        clearTimeout(p.timer);
        this.pendingBlobs.delete(msg.reqId);
        p.resolve(null); // every peer says no — fall back to network immediately
      }
      return;
    }
    if (msg?.k === "blob-data") {
      const p = this.pendingBlobs.get(msg.reqId);
      if (!p) return;
      if (p.fromPeer && p.fromPeer !== peerId) return; // ignore other responders
      if (!p.fromPeer) {
        p.fromPeer = peerId ?? "?";
        p.n = msg.n;
        p.parts = new Array(msg.n);
      }
      if (p.parts[msg.i] === undefined) {
        p.parts[msg.i] = msg.d;
        p.got++;
      }
      if (p.got === p.n) {
        clearTimeout(p.timer);
        this.pendingBlobs.delete(msg.reqId);
        try {
          // Each part is base64 of a byte-window — decode per part, concat bytes.
          const chunks = p.parts.map((s) => base64ToBytes(s));
          const total = chunks.reduce((a, c) => a + c.length, 0);
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          p.resolve(out.buffer);
        } catch {
          p.resolve(null);
        }
      }
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

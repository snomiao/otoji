// Adapts the WebRTC PeerMesh to the runtime's Transport interface: edge frames
// are JSON over the default data channel. GraphEditor wires the mesh's onData
// into `handleData`.

import type { Transport } from "./runtime";
import type { EdgeFrame } from "./frames";
import type { PeerMesh } from "../net/peers";

export class PeerMeshTransport implements Transport {
  private receiver: ((f: EdgeFrame) => void) | null = null;
  private mesh: PeerMesh | null;
  private routing: Record<string, string> = {}; // stable deviceId -> current ephemeral peerId
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

  send(toDevice: string, frame: EdgeFrame): void {
    const peerId = this.routing[toDevice];
    const ok = peerId ? this.mesh?.send(peerId, JSON.stringify(frame)) ?? false : false;
    if (ok) this.sent++;
    else this.dropped++;
  }

  setReceiver(cb: (f: EdgeFrame) => void): void {
    this.receiver = cb;
  }

  /** Called by the PeerMesh onData callback for each inbound message. */
  handleData(data: string): void {
    try {
      const f = JSON.parse(data);
      if (f?.kind === "edge") {
        this.recv++;
        this.receiver?.(f as EdgeFrame);
      }
    } catch {
      /* not an edge frame */
    }
  }
}

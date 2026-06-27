// Adapts the WebRTC PeerMesh to the runtime's Transport interface: edge frames
// are JSON over the default data channel. GraphEditor wires the mesh's onData
// into `handleData`.

import type { Transport } from "./runtime";
import type { EdgeFrame } from "./frames";
import type { PeerMesh } from "../net/peers";

export class PeerMeshTransport implements Transport {
  private receiver: ((f: EdgeFrame) => void) | null = null;
  private mesh: PeerMesh | null;

  constructor(mesh: PeerMesh | null = null) {
    this.mesh = mesh;
  }

  /** Swap the underlying mesh on reconnect — keeps this transport (and any
   *  running runtime holding it) live across signaling reconnects. */
  setMesh(mesh: PeerMesh): void {
    this.mesh = mesh;
  }

  send(toDevice: string, frame: EdgeFrame): void {
    this.mesh?.send(toDevice, JSON.stringify(frame));
  }

  setReceiver(cb: (f: EdgeFrame) => void): void {
    this.receiver = cb;
  }

  /** Called by the PeerMesh onData callback for each inbound message. */
  handleData(data: string): void {
    try {
      const f = JSON.parse(data);
      if (f?.kind === "edge") this.receiver?.(f as EdgeFrame);
    } catch {
      /* not an edge frame */
    }
  }
}

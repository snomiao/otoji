// WebRTC peer mesh over the signaling client. One RTCPeerConnection per remote
// peer, established with the "perfect negotiation" pattern to avoid glare.
// Each cross-peer edge is a labeled RTCDataChannel; M1 uses a single "mesh"
// channel for the echo demo.

import type { Signaling } from "./signaling";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

/**
 * Deterministic, symmetric tie-break: exactly one side of a pair initiates.
 * The lexicographically-greater id initiates (and is the "impolite" peer).
 */
export function shouldInitiate(myId: string, remoteId: string): boolean {
  return myId > remoteId;
}

interface PeerConn {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  channels: Map<string, RTCDataChannel>;
}

export interface MeshCallbacks {
  onPeerState?: (peerId: string, state: RTCPeerConnectionState) => void;
  onChannelOpen?: (peerId: string, label: string) => void;
  onData?: (peerId: string, label: string, data: string) => void;
}

const DEFAULT_LABEL = "mesh";

export class PeerMesh {
  private peers = new Map<string, PeerConn>();
  private unsubs: Array<() => void> = [];

  constructor(
    private signaling: Signaling,
    private myId: string,
    private cb: MeshCallbacks = {},
  ) {
    this.unsubs.push(this.signaling.on("signal", ({ from, data }) => this.onSignal(from, data)));
    this.unsubs.push(this.signaling.on("peer-left", ({ peerId }) => this.remove(peerId)));
  }

  /** Initiate to a peer if our id wins the tie-break (else wait for their offer). */
  consider(remoteId: string): void {
    if (remoteId === this.myId) return;
    if (shouldInitiate(this.myId, remoteId)) this.ensure(remoteId, true);
  }

  private ensure(remoteId: string, initiator: boolean): PeerConn {
    let p = this.peers.get(remoteId);
    if (p) return p;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    p = { pc, polite: !initiator, makingOffer: false, ignoreOffer: false, channels: new Map() };
    this.peers.set(remoteId, p);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signaling.signal(remoteId, { candidate });
    };
    pc.onnegotiationneeded = async () => {
      try {
        p!.makingOffer = true;
        await pc.setLocalDescription();
        this.signaling.signal(remoteId, { description: pc.localDescription });
      } catch {
        /* renegotiation race */
      } finally {
        p!.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      this.cb.onPeerState?.(remoteId, pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.remove(remoteId);
    };
    pc.ondatachannel = (ev) => this.bindChannel(remoteId, ev.channel);

    if (initiator) {
      const ch = pc.createDataChannel(DEFAULT_LABEL);
      this.bindChannel(remoteId, ch);
    }
    return p;
  }

  private bindChannel(remoteId: string, ch: RTCDataChannel): void {
    const p = this.peers.get(remoteId);
    if (!p) return;
    p.channels.set(ch.label, ch);
    ch.onopen = () => this.cb.onChannelOpen?.(remoteId, ch.label);
    ch.onmessage = (ev) => this.cb.onData?.(remoteId, ch.label, ev.data);
  }

  private async onSignal(from: string, data: any): Promise<void> {
    // Create the connection lazily as a non-initiator if we don't have it yet
    // (we only pre-create when WE win the tie-break in consider()).
    const p = this.ensure(from, false);
    const pc = p.pc;
    try {
      if (data.description) {
        const offerCollision = data.description.type === "offer" && (p.makingOffer || pc.signalingState !== "stable");
        p.ignoreOffer = !p.polite && offerCollision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === "offer") {
          await pc.setLocalDescription();
          this.signaling.signal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch {
          if (!p.ignoreOffer) throw new Error("ice");
        }
      }
    } catch {
      /* negotiation error — connection-state handler will clean up */
    }
  }

  send(remoteId: string, data: string, label = DEFAULT_LABEL): boolean {
    const ch = this.peers.get(remoteId)?.channels.get(label);
    if (ch?.readyState === "open") {
      ch.send(data);
      return true;
    }
    return false;
  }

  /** Bytes queued in a peer's send buffer (for backpressure), or -1 if no open channel. */
  bufferedAmount(remoteId: string, label = DEFAULT_LABEL): number {
    const ch = this.peers.get(remoteId)?.channels.get(label);
    return ch?.readyState === "open" ? ch.bufferedAmount : -1;
  }

  broadcast(data: string, label = DEFAULT_LABEL): number {
    let n = 0;
    for (const id of this.peers.keys()) if (this.send(id, data, label)) n++;
    return n;
  }

  connectedPeers(): string[] {
    return [...this.peers.entries()].filter(([, p]) => p.pc.connectionState === "connected").map(([id]) => id);
  }

  private remove(remoteId: string): void {
    const p = this.peers.get(remoteId);
    if (!p) return;
    try {
      p.pc.close();
    } catch {
      /* noop */
    }
    this.peers.delete(remoteId);
  }

  destroy(): void {
    this.unsubs.forEach((off) => off());
    this.unsubs = [];
    for (const id of [...this.peers.keys()]) this.remove(id);
  }
}

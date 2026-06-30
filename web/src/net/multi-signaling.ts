// Federated signaling: one logical room fanned out across N signaling servers
// ("trackers"). Presents the exact Signaling surface PeerMesh/GraphEditor use,
// so it is a drop-in replacement for a single SignalingClient.
//
// How it federates: every underlying connection shares ONE client-chosen peerId
// (so a device has a single identity everywhere — this keeps PeerMesh's id-based
// tie-break consistent across servers). Remote peers are de-duped by peerId; a
// peer is "present" while at least one tracker still reports it. `signal()` is
// routed back over whichever tracker the peer was seen on. Two peers connect as
// long as their tracker lists share one server.
//
// Live membership: `setBases()` diffs the desired tracker set against the open
// connections and adds/removes them on the fly, so editing the in-graph
// Signaling node re-homes the room without a reconnect.

import { SignalingClient, type Peer, type Handler, type Signaling } from "./signaling";
import { dedupeTrackers, bootstrapTrackers } from "../lib/trackers";

interface Conn {
  base: string;
  client: SignalingClient;
  offs: Array<() => void>;
}

export class MultiSignalingClient implements Signaling {
  readonly peerId: string;
  private conns = new Map<string, Conn>(); // base -> connection
  private handlers = new Map<string, Set<Handler>>();
  private helloSent = false;
  private openBases = new Set<string>(); // bases with a currently-open socket
  // remote peerId -> set of bases currently reporting it (presence + routing).
  private seenOn = new Map<string, Set<string>>();

  constructor(
    private room: string,
    private name: string,
    private deviceId: string = "",
    private role: string = "general",
    private hasMic: boolean = true,
    private bases: string[] = bootstrapTrackers(),
  ) {
    // One stable identity reused on every tracker.
    this.peerId = crypto.randomUUID();
    this.bases = dedupeTrackers(bases);
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

  /** Trackers this room is currently announced on. */
  activeBases(): string[] {
    return [...this.conns.keys()];
  }

  connect(): void {
    for (const base of this.bases) this.addConn(base);
  }

  /** Re-home the room to a new tracker set, adding/removing live connections. */
  setBases(next: string[]): void {
    const want = dedupeTrackers(next);
    this.bases = want;
    const wantSet = new Set(want);
    for (const base of [...this.conns.keys()]) if (!wantSet.has(base)) this.removeConn(base);
    for (const base of want) this.addConn(base);
  }

  private addConn(base: string): void {
    if (this.conns.has(base)) return;
    const client = new SignalingClient(this.room, this.name, this.deviceId, this.role, this.hasMic, base, this.peerId);
    const offs: Array<() => void> = [];
    offs.push(client.on("open", () => this.onOpen(base)));
    offs.push(client.on("close", () => this.onClose(base)));
    offs.push(client.on("hello", (m) => this.onHello(base, m)));
    offs.push(client.on("peer-joined", (m) => this.addPeer(base, m.peer as Peer)));
    offs.push(client.on("peer-left", (m) => this.removePeer(base, m.peerId, m.deviceId)));
    offs.push(client.on("signal", (m) => { this.track(base, m.from); this.emit("signal", m); }));
    offs.push(client.on("graph", (m) => this.emit("graph", m)));
    offs.push(client.on("pipe", (m) => this.emit("pipe", m)));
    this.conns.set(base, { base, client, offs });
    client.connect();
  }

  private removeConn(base: string): void {
    const c = this.conns.get(base);
    if (!c) return;
    c.offs.forEach((off) => off());
    c.client.close();
    this.conns.delete(base);
    // We unsubscribed above, so onClose won't run for this socket — account for
    // it here, emitting close only if this was the last open tracker.
    if (this.openBases.delete(base) && this.openBases.size === 0) this.emit("close", {});
    // Drop this tracker's contribution to presence; emit peer-left for any peer
    // that is now gone from every remaining tracker.
    for (const [peerId, bases] of [...this.seenOn]) {
      if (bases.delete(base) && bases.size === 0) {
        this.seenOn.delete(peerId);
        this.emit("peer-left", { peerId });
      }
    }
  }

  // "open" fires when the FIRST tracker comes up; "close" only once the LAST
  // open tracker drops. A tracker that never opened (e.g. unreachable host that
  // only ever fires close) is a no-op here, so a dead tracker in the set can't
  // flap the room to "reconnecting" while a good one is still connected.
  private onOpen(base: string): void {
    const wasEmpty = this.openBases.size === 0;
    this.openBases.add(base);
    if (wasEmpty) this.emit("open", {});
  }
  private onClose(base: string): void {
    if (this.openBases.delete(base) && this.openBases.size === 0) this.emit("close", {});
  }

  private onHello(base: string, m: any): void {
    const peers = (m.peers as Peer[]).filter((p) => p.peerId !== this.peerId);
    if (!this.helloSent) {
      // First server to greet us defines the canonical hello (id + graph);
      // its peers seed presence.
      this.helloSent = true;
      peers.forEach((p) => this.track(base, p.peerId));
      this.emit("hello", { peerId: this.peerId, peers, graph: m.graph });
    } else {
      // Later servers just fold their peers in as joins (de-duped by peerId).
      peers.forEach((p) => this.addPeer(base, p));
    }
  }

  private track(base: string, peerId: string): void {
    let bases = this.seenOn.get(peerId);
    if (!bases) {
      bases = new Set();
      this.seenOn.set(peerId, bases);
    }
    bases.add(base);
  }

  private addPeer(base: string, peer: Peer): void {
    if (peer.peerId === this.peerId) return;
    const isNew = !this.seenOn.has(peer.peerId);
    this.track(base, peer.peerId);
    if (isNew) this.emit("peer-joined", { peer });
  }

  private removePeer(base: string, peerId: string, deviceId?: string): void {
    const bases = this.seenOn.get(peerId);
    if (!bases) return;
    bases.delete(base);
    if (bases.size === 0) {
      this.seenOn.delete(peerId);
      this.emit("peer-left", { peerId, deviceId });
    }
  }

  /** Route a signal to the tracker(s) where the target peer is present. */
  signal(to: string, data: unknown): void {
    const bases = this.seenOn.get(to);
    if (bases && bases.size) {
      // Send on one tracker the peer is on (any works; the DO relays by peerId).
      const base = bases.values().next().value as string;
      this.conns.get(base)?.client.signal(to, data);
    } else {
      // Unknown target — fan out and let the right server deliver it.
      for (const c of this.conns.values()) c.client.signal(to, data);
    }
  }

  // Graph state + pipe relay fan out to every tracker so all servers converge.
  patchGraph(graph: unknown): void {
    for (const c of this.conns.values()) c.client.patchGraph(graph);
  }
  getGraph(): void {
    this.conns.values().next().value?.client.getGraph();
  }
  pipe(node: string, text: string, src: "node" | "cli"): void {
    for (const c of this.conns.values()) c.client.pipe(node, text, src);
  }

  close(): void {
    for (const base of [...this.conns.keys()]) this.removeConn(base);
    this.openBases.clear();
  }
}

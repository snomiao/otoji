// Cross-device live preview. Preview state (mic waveform, transcript text,
// busy/queue, camera/vision frames) normally lives in a per-device LiveStore
// that never broadcasts — so only a node's OWNER has it. This controller streams
// it to other devices on demand: a device that turns a non-owned node's preview
// ON subscribes (pv-sub) to the room; the owner, while ≥1 device is subscribed,
// encodes that node's preview and sends it (pv) to the subscribers, who write it
// into their own LiveStore so the existing preview widgets render it unchanged.
//
// Default-local, bandwidth-light: nothing is sent unless someone has explicitly
// opted in, levels are batched, and images are downscaled to a small JPEG that
// fits one data-channel message.

import type { LiveStore } from "./live-store";
import type { SttLevel } from "../providers/types";
import { base64ToBytes } from "../lib/base64";

/** Sends raw strings over the mesh (implemented by PeerMeshTransport). */
export interface PreviewSender {
  send(peerId: string, s: string): boolean;
  broadcast(s: string): number;
}

export type PreviewKind = "lvl" | "txt" | "busy" | "queue" | "img";

const MAX_SUB_NODES = 256; // cap a peer's subscription list (a graph has ≪ this)
const MAX_ID_LEN = 128; // ignore absurd node ids from a misbehaving peer
const IMG_MAX_EDGE = 200; // thumbnail long-edge px (UI shows it at 150×84)
const IMG_QUALITY = 0.5; // JPEG quality
const IMG_MAX_B64 = 14000; // skip frames that don't fit the ~15KB channel floor
const IMG_MIN_INTERVAL_MS = 200; // ≤5 preview frames/sec
const LVL_FLUSH_MS = 80; // batch waveform levels (~12 messages/sec)
const LVL_MAX_BATCH = 64;

interface PvMsg {
  k: "pv";
  id: string;
  t: PreviewKind;
  levels?: SttLevel[];
  text?: string;
  busy?: boolean;
  processing?: string | null;
  queued?: string[];
  w?: number;
  h?: number;
  d?: string; // base64 JPEG
}
interface PvSubMsg {
  k: "pv-sub";
  nodes: string[];
}
export type PreviewMessage = PvMsg | PvSubMsg;

export class PreviewSync {
  private sender: PreviewSender | null = null;
  // Owner side: nodeId -> peerIds that asked for its preview.
  private subscribers = new Map<string, Set<string>>();
  // Subscriber side: nodeIds we've asked remote owners to stream to us.
  private myNodes = new Set<string>();
  // Subscriber side: per-node receive counter so a slow JPEG decode can't apply
  // an older frame on top of a newer one (out-of-order async decode).
  private imgRecvSeq = new Map<string, number>();
  // Owner-side throttling state.
  private lvlBuf = new Map<string, SttLevel[]>();
  private lvlTimer = new Map<string, ReturnType<typeof setTimeout>>();
  private lastImg = new Map<string, number>();

  constructor(private live: LiveStore) {}

  setSender(sender: PreviewSender): void {
    this.sender = sender;
  }

  // --- subscriber side -----------------------------------------------------

  /** Set the full list of remote nodes we want streamed; broadcasts if changed. */
  setSubscriptions(nodeIds: string[]): void {
    const next = new Set(nodeIds);
    if (eqSet(next, this.myNodes)) return;
    for (const id of this.imgRecvSeq.keys()) if (!next.has(id)) this.imgRecvSeq.delete(id);
    this.myNodes = next;
    this.broadcastSub();
  }

  /** Re-announce our wants (call when a new peer connects so a fresh owner learns them). */
  resync(): void {
    if (this.myNodes.size) this.broadcastSub();
  }

  private broadcastSub(): void {
    this.sender?.broadcast(JSON.stringify({ k: "pv-sub", nodes: [...this.myNodes] } as PvSubMsg));
  }

  // --- owner side ----------------------------------------------------------

  hasSubscriber(nodeId: string): boolean {
    return (this.subscribers.get(nodeId)?.size ?? 0) > 0;
  }

  /** A local node produced preview data — forward to subscribers (no-op if none). */
  onLocalPreview(nodeId: string, kind: PreviewKind, payload: unknown): void {
    if (!this.hasSubscriber(nodeId)) return;
    switch (kind) {
      case "lvl":
        this.bufferLevel(nodeId, payload as SttLevel);
        break;
      case "txt":
        this.emit(nodeId, { k: "pv", id: nodeId, t: "txt", text: String(payload ?? "") });
        break;
      case "busy":
        this.emit(nodeId, { k: "pv", id: nodeId, t: "busy", busy: !!payload });
        break;
      case "queue": {
        const q = payload as { processing: string | null; queued: string[] };
        this.emit(nodeId, { k: "pv", id: nodeId, t: "queue", processing: q.processing, queued: q.queued });
        break;
      }
      case "img":
        void this.emitImage(nodeId, payload as ImageBitmap);
        break;
    }
  }

  private bufferLevel(nodeId: string, lvl: SttLevel): void {
    let buf = this.lvlBuf.get(nodeId);
    if (!buf) {
      buf = [];
      this.lvlBuf.set(nodeId, buf);
    }
    buf.push(lvl);
    if (buf.length > LVL_MAX_BATCH) buf.shift();
    if (this.lvlTimer.has(nodeId)) return; // flush already scheduled
    this.lvlTimer.set(
      nodeId,
      setTimeout(() => {
        this.lvlTimer.delete(nodeId);
        const levels = this.lvlBuf.get(nodeId);
        if (!levels?.length) return;
        this.lvlBuf.set(nodeId, []);
        this.emit(nodeId, { k: "pv", id: nodeId, t: "lvl", levels });
      }, LVL_FLUSH_MS),
    );
  }

  private async emitImage(nodeId: string, bitmap: ImageBitmap): Promise<void> {
    const now = Date.now();
    if (now - (this.lastImg.get(nodeId) ?? 0) < IMG_MIN_INTERVAL_MS) return;
    this.lastImg.set(nodeId, now);
    const enc = encodeThumb(bitmap);
    if (!enc || enc.d.length > IMG_MAX_B64) return; // encode failed or too big → drop this frame
    if (!this.hasSubscriber(nodeId)) return; // unsubscribed while encoding
    this.emit(nodeId, { k: "pv", id: nodeId, t: "img", w: enc.w, h: enc.h, d: enc.d });
  }

  private emit(nodeId: string, msg: PvMsg): void {
    const subs = this.subscribers.get(nodeId);
    if (!subs?.size || !this.sender) return;
    const s = JSON.stringify(msg);
    for (const peerId of subs) this.sender.send(peerId, s);
  }

  /** Drop a peer that left the room from all subscriptions it held. */
  dropPeer(peerId: string): void {
    for (const [nodeId, set] of this.subscribers) {
      if (set.delete(peerId) && set.size === 0) {
        this.subscribers.delete(nodeId);
        this.cleanup(nodeId);
      }
    }
  }

  private setSubscriberNodes(peerId: string, nodes: string[]): void {
    const want = new Set(
      nodes.filter((n) => typeof n === "string" && n.length > 0 && n.length <= MAX_ID_LEN).slice(0, MAX_SUB_NODES),
    );
    for (const [nodeId, set] of this.subscribers) {
      if (!want.has(nodeId) && set.delete(peerId) && set.size === 0) {
        this.subscribers.delete(nodeId);
        this.cleanup(nodeId);
      }
    }
    for (const nodeId of want) {
      let set = this.subscribers.get(nodeId);
      if (!set) {
        set = new Set();
        this.subscribers.set(nodeId, set);
      }
      set.add(peerId);
    }
  }

  private cleanup(nodeId: string): void {
    const t = this.lvlTimer.get(nodeId);
    if (t) clearTimeout(t);
    this.lvlTimer.delete(nodeId);
    this.lvlBuf.delete(nodeId);
    this.lastImg.delete(nodeId);
  }

  // --- inbound -------------------------------------------------------------

  /** Route a preview message from the transport. peerId is the sender. */
  handleMessage(msg: PreviewMessage, peerId?: string): void {
    if (msg.k === "pv-sub") {
      if (peerId) this.setSubscriberNodes(peerId, Array.isArray(msg.nodes) ? msg.nodes : []);
      return;
    }
    if (msg.k !== "pv") return;
    const id = msg.id;
    if (!this.myNodes.has(id)) return; // stale / not subscribed → ignore
    switch (msg.t) {
      case "lvl":
        for (const l of msg.levels ?? []) this.live.pushLevel(id, l);
        break;
      case "txt":
        this.live.pushText(id, msg.text ?? "");
        break;
      case "busy":
        this.live.setBusy(id, !!msg.busy);
        break;
      case "queue":
        this.live.setQueue(id, msg.processing ?? null, msg.queued ?? []);
        break;
      case "img":
        if (msg.d) {
          const seq = (this.imgRecvSeq.get(id) ?? 0) + 1;
          this.imgRecvSeq.set(id, seq);
          void this.applyImage(id, msg.d, seq);
        }
        break;
    }
  }

  private async applyImage(nodeId: string, b64: string, seq: number): Promise<void> {
    if (typeof createImageBitmap === "undefined") return;
    try {
      const blob = new Blob([base64ToBytes(b64).buffer as ArrayBuffer], { type: "image/jpeg" });
      const bmp = await createImageBitmap(blob);
      // Drop if we unsubscribed OR a newer frame already landed while decoding.
      if (!this.myNodes.has(nodeId) || this.imgRecvSeq.get(nodeId) !== seq) {
        bmp.close?.();
        return;
      }
      this.live.setImage(nodeId, bmp);
    } catch {
      /* malformed image — skip */
    }
  }
}

function eqSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

let scratch: HTMLCanvasElement | null = null;
/** Downscale a frame to a small JPEG and return its base64 (no data-URL prefix). */
function encodeThumb(bitmap: ImageBitmap): { w: number; h: number; d: string } | null {
  if (typeof document === "undefined" || !bitmap.width || !bitmap.height) return null;
  const scale = Math.min(1, IMG_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const c = scratch ?? (scratch = document.createElement("canvas"));
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(bitmap, 0, 0, w, h);
  } catch {
    return null; // bitmap closed mid-encode
  }
  const url = c.toDataURL("image/jpeg", IMG_QUALITY);
  const comma = url.indexOf(",");
  return comma < 0 ? null : { w, h, d: url.slice(comma + 1) };
}

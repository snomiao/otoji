// Per-device, ephemeral live preview state keyed by nodeId. This is NOT part of
// the DO-synced graph — it never broadcasts. High-rate data (mic levels) is read
// by canvases via rAF without emitting; low-rate data (recent text, busy) emits
// to subscribers so only the affected node re-renders.

import type { SttLevel } from "../providers/types";

const MAX_LEVELS = 200; // ~6s of 30ms VAD windows
const MAX_TEXTS = 3;

export interface QueueState {
  processing: string | null; // label of the item currently being processed
  queued: string[]; // labels waiting
}

export class LiveStore {
  private levels = new Map<string, SttLevel[]>();
  private texts = new Map<string, string[]>();
  private busy = new Map<string, boolean>();
  private queues = new Map<string, QueueState>();
  private images = new Map<string, ImageBitmap>();
  private media = new Map<string, MediaStream>();
  private listeners = new Map<string, Set<() => void>>();

  subscribe(nodeId: string, fn: () => void): () => void {
    let set = this.listeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.listeners.set(nodeId, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(nodeId: string): void {
    this.listeners.get(nodeId)?.forEach((f) => f());
  }

  // High-rate: mutate in place, no emit (canvas reads via rAF).
  pushLevel(nodeId: string, level: SttLevel): void {
    let b = this.levels.get(nodeId);
    if (!b) {
      b = [];
      this.levels.set(nodeId, b);
    }
    b.push(level);
    if (b.length > MAX_LEVELS) b.splice(0, b.length - MAX_LEVELS);
  }
  getLevels(nodeId: string): SttLevel[] {
    return this.levels.get(nodeId) ?? [];
  }

  // Latest camera/OCR frame. Emits so the canvas repaints per frame (the rgui
  // viewer coalesces invalidates into one render per rAF, so a fast producer
  // can't outpace the display). We don't close the old bitmap here — the same
  // frame is shared with the OCR node's in-flight job, so closing would risk
  // use-after-close; GC reclaims it.
  setImage(nodeId: string, bitmap: ImageBitmap): void {
    this.images.set(nodeId, bitmap);
    this.emit(nodeId);
  }
  getImage(nodeId: string): ImageBitmap | undefined {
    return this.images.get(nodeId);
  }

  // Live camera/screen MediaStream for the node's <video> preview: the
  // compositor renders it at native fps off the main thread, decoupled from
  // the pipeline's grab rate. The runtime owns the stream's lifecycle; this
  // only points at it (null/absent after stop).
  setMedia(nodeId: string, stream: MediaStream | null): void {
    if (stream) this.media.set(nodeId, stream);
    else this.media.delete(nodeId);
    this.emit(nodeId);
  }
  getMedia(nodeId: string): MediaStream | undefined {
    return this.media.get(nodeId);
  }

  // Low-rate: replace array (new ref) so useSyncExternalStore detects the change.
  pushText(nodeId: string, text: string): void {
    const prev = this.texts.get(nodeId) ?? [];
    this.texts.set(nodeId, [text, ...prev].slice(0, MAX_TEXTS));
    this.emit(nodeId);
  }
  getTexts(nodeId: string): string[] {
    return this.texts.get(nodeId) ?? EMPTY;
  }

  setBusy(nodeId: string, v: boolean): void {
    if (this.busy.get(nodeId) === v) return;
    this.busy.set(nodeId, v);
    this.emit(nodeId);
  }
  getBusy(nodeId: string): boolean {
    return this.busy.get(nodeId) ?? false;
  }

  setQueue(nodeId: string, processing: string | null, queued: string[]): void {
    this.queues.set(nodeId, { processing, queued });
    this.emit(nodeId);
  }
  getQueue(nodeId: string): QueueState {
    return this.queues.get(nodeId) ?? EMPTY_QUEUE;
  }

  reset(): void {
    this.levels.clear();
    this.texts.clear();
    this.busy.clear();
    this.queues.clear();
    for (const b of this.images.values()) b.close?.();
    this.images.clear();
    this.media.clear(); // tracks are owned (and stopped) by the runtime
    for (const set of this.listeners.values()) set.forEach((f) => f());
  }
}

const EMPTY: string[] = [];
const EMPTY_QUEUE: QueueState = { processing: null, queued: [] };

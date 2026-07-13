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

export interface NodeMetricSample {
  event: "start" | "stop" | "input" | "process" | "emit";
  durationMs?: number;
  port?: string;
  label?: string;
  ts?: number;
}

export interface NodeMetricState {
  hz: number;
  emitHz: number;
  avgMs: number;
  p95Ms: number;
  lastMs: number;
  events: number;
  emits: number;
  lastAt: number;
}

interface MutableMetricState extends NodeMetricState {
  windowStart: number;
  windowEvents: number;
  windowEmits: number;
  durations: number[];
  lastNotify: number;
}

export class LiveStore {
  private levels = new Map<string, SttLevel[]>();
  private texts = new Map<string, string[]>();
  private busy = new Map<string, boolean>();
  private queues = new Map<string, QueueState>();
  private metrics = new Map<string, MutableMetricState>();
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

  recordMetric(nodeId: string, sample: NodeMetricSample): void {
    const now = sample.ts ?? Date.now();
    let m = this.metrics.get(nodeId);
    if (!m) {
      m = {
        hz: 0,
        emitHz: 0,
        avgMs: 0,
        p95Ms: 0,
        lastMs: 0,
        events: 0,
        emits: 0,
        lastAt: now,
        windowStart: now,
        windowEvents: 0,
        windowEmits: 0,
        durations: [],
        lastNotify: 0,
      };
      this.metrics.set(nodeId, m);
    }
    m.events++;
    m.windowEvents++;
    m.lastAt = now;
    if (sample.event === "emit") {
      m.emits++;
      m.windowEmits++;
    }
    if (typeof sample.durationMs === "number" && Number.isFinite(sample.durationMs)) {
      m.lastMs = sample.durationMs;
      m.durations.push(sample.durationMs);
      if (m.durations.length > 80) m.durations.splice(0, m.durations.length - 80);
      m.avgMs = m.durations.reduce((a, b) => a + b, 0) / m.durations.length;
      const sorted = [...m.durations].sort((a, b) => a - b);
      m.p95Ms = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))] ?? 0;
    }
    const elapsed = now - m.windowStart;
    if (elapsed >= 1000) {
      m.hz = (m.windowEvents * 1000) / elapsed;
      m.emitHz = (m.windowEmits * 1000) / elapsed;
      m.windowStart = now;
      m.windowEvents = 0;
      m.windowEmits = 0;
    }
    if (now - m.lastNotify > 250) {
      m.lastNotify = now;
      this.emit(nodeId);
    }
  }

  getMetric(nodeId: string): NodeMetricState | undefined {
    return this.metrics.get(nodeId);
  }

  reset(): void {
    this.levels.clear();
    this.texts.clear();
    this.busy.clear();
    this.queues.clear();
    this.metrics.clear();
    for (const b of this.images.values()) b.close?.();
    this.images.clear();
    this.media.clear(); // tracks are owned (and stopped) by the runtime
    for (const set of this.listeners.values()) set.forEach((f) => f());
  }
}

const EMPTY: string[] = [];
const EMPTY_QUEUE: QueueState = { processing: null, queued: [] };

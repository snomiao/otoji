// Per-device, ephemeral live preview state keyed by nodeId. This is NOT part of
// the DO-synced graph — it never broadcasts. High-rate data (mic levels) is read
// by canvases via rAF without emitting; low-rate data (recent text, busy) emits
// to subscribers so only the affected node re-renders.

import type { SttLevel } from "../providers/types";

const MAX_LEVELS = 200; // ~6s of 30ms VAD windows
const MAX_TEXTS = 3;

export class LiveStore {
  private levels = new Map<string, SttLevel[]>();
  private texts = new Map<string, string[]>();
  private busy = new Map<string, boolean>();
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

  reset(): void {
    this.levels.clear();
    this.texts.clear();
    this.busy.clear();
    for (const set of this.listeners.values()) set.forEach((f) => f());
  }
}

const EMPTY: string[] = [];

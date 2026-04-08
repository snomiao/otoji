import type { PolishProvider, SttProvider, TtsProvider } from "./types";

export class ProviderRouter<T extends { id: string; isAvailable(): boolean }> {
  constructor(private providers: T[], private preferredId?: string) {}

  setPreferred(id: string | undefined) {
    this.preferredId = id;
  }

  /** Returns the preferred provider if available, else first available fallback. */
  pick(): T | undefined {
    if (this.preferredId) {
      const p = this.providers.find((x) => x.id === this.preferredId);
      if (p && p.isAvailable()) return p;
    }
    return this.providers.find((x) => x.isAvailable());
  }

  /** Returns ordered list starting from preferred then others, filtered by available. */
  chain(): T[] {
    const out: T[] = [];
    if (this.preferredId) {
      const p = this.providers.find((x) => x.id === this.preferredId);
      if (p && p.isAvailable()) out.push(p);
    }
    for (const p of this.providers) {
      if (p.isAvailable() && !out.includes(p)) out.push(p);
    }
    return out;
  }

  all(): T[] { return this.providers.slice(); }
}

export type SttRouter = ProviderRouter<SttProvider>;
export type TtsRouter = ProviderRouter<TtsProvider>;
export type PolishRouter = ProviderRouter<PolishProvider>;

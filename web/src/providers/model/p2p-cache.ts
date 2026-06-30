// P2P + persistent model cache for transformers.js. Plugged in as
// `env.customCache`, it resolves each model file in order: in-memory → persistent
// browser Cache (survives reloads/offline) → a roommate over the WebRTC mesh →
// (finally) the network, which transformers.js does itself on an undefined match.
// Files this device holds can be served to peers, so a model assigned to a device
// that can't fetch it (private/local, or offline) still loads by pulling it from
// a device in the same room that has it.

const CACHE_NAME = "otoji-models-p2p";

type FetchFromRoom = (url: string) => Promise<ArrayBuffer | null>;

class P2PModelCache {
  private mem = new Map<string, ArrayBuffer>(); // session cache; also what we serve fast
  /** Set by GraphEditor to the mesh transport's blob request; null = no room. */
  fetchFromRoom: FetchFromRoom | null = null;

  private urlOf(request: unknown): string {
    return typeof request === "string" ? request : ((request as { url?: string })?.url ?? String(request));
  }

  private async openCache(): Promise<Cache | null> {
    try {
      return typeof caches !== "undefined" ? await caches.open(CACHE_NAME) : null;
    } catch {
      return null;
    }
  }

  private async persist(url: string, bytes: ArrayBuffer): Promise<void> {
    try {
      const c = await this.openCache();
      await c?.put(url, new Response(bytes)); // throws for non-http urls (e.g. tests) — ignored
    } catch {
      /* not persistable (scheme/quota) — memory still holds it this session */
    }
  }

  // --- transformers.js customCache interface (Cache-like) ---
  async match(request: unknown): Promise<Response | undefined> {
    const url = this.urlOf(request);
    const mem = this.mem.get(url);
    if (mem) return new Response(mem);
    // persistent browser cache (survives reloads / offline)
    try {
      const c = await this.openCache();
      const hit = await c?.match(url);
      if (hit) {
        const buf = await hit.clone().arrayBuffer();
        this.mem.set(url, buf);
        return new Response(buf);
      }
    } catch {
      /* fall through */
    }
    // a roommate in the same room
    if (this.fetchFromRoom) {
      try {
        const bytes = await this.fetchFromRoom(url);
        if (bytes) {
          this.mem.set(url, bytes);
          void this.persist(url, bytes);
          return new Response(bytes);
        }
      } catch {
        /* fall through to network */
      }
    }
    return undefined; // transformers.js fetches from network, then calls put()
  }

  async put(request: unknown, response: Response): Promise<void> {
    const url = this.urlOf(request);
    try {
      const buf = await response.clone().arrayBuffer();
      this.mem.set(url, buf);
      void this.persist(url, buf);
    } catch {
      /* ignore unstorable responses */
    }
  }

  // --- serving side (queried by the mesh transport on a blob request) ---
  /** Register bytes this device can serve (also used to pre-seed in tests). */
  provide(url: string, bytes: ArrayBuffer): void {
    this.mem.set(url, bytes);
    void this.persist(url, bytes);
  }
  /** Bytes to serve a peer for a url: session cache, else persistent cache. */
  async getServable(url: string): Promise<ArrayBuffer | null> {
    const mem = this.mem.get(url);
    if (mem) return mem;
    try {
      const c = await this.openCache();
      const hit = await c?.match(url);
      if (hit) {
        const buf = await hit.arrayBuffer();
        this.mem.set(url, buf);
        return buf;
      }
    } catch {
      /* none */
    }
    return null;
  }
  keys(): string[] {
    return [...this.mem.keys()];
  }
}

export const p2pModelCache = new P2PModelCache();

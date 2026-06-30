// Offload helper for model providers. Clears a memoized instance map and, for
// each loaded instance, best-effort calls the first available native cleanup
// method (e.g. unload/dispose/terminate/release) so GPU/wasm memory is freed.
// Safe to call when already empty; swallows errors (an in-flight instance with
// no cleanup API is simply dropped and reclaimed by GC).

export async function disposeMemo<T>(map: Map<string, Promise<T>>, methods: string[]): Promise<void> {
  if (map.size === 0) return;
  const loaded = [...map.values()];
  map.clear();
  await Promise.all(
    loaded.map(async (p) => {
      try {
        const inst = (await p) as any;
        for (const m of methods) {
          if (typeof inst?.[m] === "function") {
            await inst[m]();
            break;
          }
        }
      } catch {
        /* in-flight or no cleanup API — GC reclaims the dropped reference */
      }
    }),
  );
}

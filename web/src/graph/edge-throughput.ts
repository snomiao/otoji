/** Format a byte rate for a compact graph-edge label. */
export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} kB/s`;
  return `${Math.round(Math.max(0, bytesPerSec))} B/s`;
}

/** Derive per-second rates from two snapshots of monotonically increasing totals. */
export function computeRates(
  previous: ReadonlyMap<string, number>,
  current: ReadonlyMap<string, number>,
  dtMs: number,
): Record<string, number> {
  if (!(dtMs > 0)) return {};
  const rates: Record<string, number> = {};
  for (const [edgeId, total] of current) {
    const delta = total - (previous.get(edgeId) ?? 0);
    if (delta > 0) rates[edgeId] = delta * 1000 / dtMs;
  }
  return rates;
}

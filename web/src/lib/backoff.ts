// Golden-ratio exponential backoff. Check once immediately (no leading delay),
// then sleep d0·φⁿ before retry n, capped at maxMs. Used for infinite-listen
// auto-retry and model-fetch retry.

export const PHI = 1.618033988749895;

export interface BackoffOptions {
  baseMs?: number; // d0, default 1000
  maxMs?: number; // cap, default 60000
}

/** Delay (ms) before retry attempt `n` (0-based: attempt 0 = no delay). */
export function backoffDelay(n: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 60000;
  if (n <= 0) return 0;
  return Math.min(max, base * Math.pow(PHI, n - 1));
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async task forever (or until `shouldStop`) with φ backoff.
 * The first attempt runs immediately. Resets the counter via `onSuccess`'s
 * return — if the task resolves, the counter is reset to 0 for the next loop.
 */
export async function retryForever<T>(
  task: (attempt: number) => Promise<T>,
  opts: BackoffOptions & {
    shouldStop?: () => boolean;
    onError?: (e: unknown, nextDelayMs: number) => void;
  } = {},
): Promise<void> {
  let attempt = 0;
  while (!opts.shouldStop?.()) {
    try {
      await task(attempt);
      attempt = 0; // success resets backoff
    } catch (e) {
      attempt += 1;
      const delay = backoffDelay(attempt, opts);
      opts.onError?.(e, delay);
      if (opts.shouldStop?.()) break;
      await sleep(delay);
    }
  }
}

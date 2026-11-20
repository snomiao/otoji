import type { MicStorage } from "./storage";

export const MIC_OWNERSHIP_KEY = "otoji:mic:owner:v1";

interface Lease {
  ownerId: string;
  claimId: string;
  startedAt: number;
  expiresAt: number;
  phase: "claim" | "held";
}

export interface OwnershipState {
  owned: boolean;
  reason: "acquired" | "released" | "remote" | "expired" | "storage-error" | "disposed";
}

export interface MicOwnership {
  /** Start capture only after this resolves true; stop synchronously when listen reports false. */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  listen(listener: (state: OwnershipState) => void): () => void;
  isOwner(): boolean;
  dispose(): void;
}

export interface OwnershipOptions {
  tabId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
  settleMs?: number;
  now?: () => number;
}

function lease(value: unknown): Lease | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as Partial<Lease>;
  if (
    typeof item.ownerId !== "string" ||
    !item.ownerId ||
    typeof item.claimId !== "string" ||
    !item.claimId ||
    typeof item.startedAt !== "number" ||
    !Number.isFinite(item.startedAt) ||
    typeof item.expiresAt !== "number" ||
    !Number.isFinite(item.expiresAt) ||
    (item.phase !== "claim" && item.phase !== "held")
  )
    return;
  return item as Lease;
}

function same(a: Lease | undefined, b: Lease | undefined): boolean {
  return !!a && !!b && a.ownerId === b.ownerId && a.claimId === b.claimId;
}

function precedes(a: Lease, b: Lease): boolean {
  return a.startedAt < b.startedAt || (a.startedAt === b.startedAt && a.claimId < b.claimId);
}

function randomId(): string {
  // randomUUID is unavailable on some HTTP pages where userscripts still run.
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
}

/**
 * GM storage has no compare-and-swap. Contenders settle before capture, verify the stored
 * winner, and revoke immediately on any foreign change. The earlier claim wins a race;
 * equal timestamps use the random claim ID. Existing live holders are never preempted.
 * Like all tab leases, this assumes live tabs receive GM changes within the settle window.
 */
export function createMicOwnership(
  storage: MicStorage,
  options: OwnershipOptions = {},
): MicOwnership {
  const ownerId = options.tabId ?? randomId();
  const leaseMs = options.leaseMs ?? 6000;
  const heartbeatMs = options.heartbeatMs ?? 1500;
  const settleMs = options.settleMs ?? 150;
  const now = options.now ?? Date.now;
  if (
    leaseMs <= 0 ||
    heartbeatMs <= 0 ||
    settleMs < 0 ||
    heartbeatMs >= leaseMs ||
    settleMs >= leaseMs ||
    ![leaseMs, heartbeatMs, settleMs].every(Number.isFinite)
  ) {
    throw new Error("Invalid microphone ownership timing");
  }
  const listeners = new Set<(state: OwnershipState) => void>();
  let current: Lease | undefined;
  let owned = false;
  let disposed = false;
  let generation = 0;
  let pending: Promise<boolean> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  const write = (value: Lease | null, allowed: () => boolean = () => true) => {
    const result = writes.then(() =>
      allowed() ? storage.set(MIC_OWNERSHIP_KEY, value) : undefined,
    );
    writes = result.catch(() => {});
    return result;
  };
  const notify = (reason: OwnershipState["reason"]) => {
    for (const listener of listeners) listener({ owned, reason });
  };
  const revoke = (reason: OwnershipState["reason"]) => {
    const wasOwned = owned;
    owned = false;
    current = undefined;
    generation++;
    clearTimeout(heartbeat);
    clearTimeout(expiry);
    if (wasOwned) notify(reason);
  };
  const armExpiry = () => {
    clearTimeout(expiry);
    expiry = setTimeout(
      () => revoke("expired"),
      Math.max(0, (current?.expiresAt ?? now()) - now()),
    );
  };
  const armHeartbeat = () => {
    clearTimeout(heartbeat);
    heartbeat = setTimeout(async () => {
      const expected = current;
      if (!owned || !expected) return;
      try {
        const stored = lease(await storage.get(MIC_OWNERSHIP_KEY));
        if (!owned || !same(current, expected)) return;
        if (!same(stored, expected)) {
          revoke("remote");
          return;
        }
        if (expected.expiresAt <= now()) {
          revoke("expired");
          return;
        }
        const renewed = { ...expected, expiresAt: now() + leaseMs };
        await write(renewed, () => owned && same(current, expected));
        // A stalled GM write must not extend the local lease before persistence succeeds.
        if (owned && same(current, expected)) {
          current = renewed;
          armExpiry();
          armHeartbeat();
        }
      } catch {
        revoke("storage-error");
      }
    }, heartbeatMs);
  };
  const stop = storage.listen(MIC_OWNERSHIP_KEY, (value) => {
    const incoming = lease(value);
    if (!current || same(incoming, current)) return;
    if (owned) {
      revoke("remote");
      return;
    }
    if (
      incoming &&
      incoming.expiresAt > now() &&
      incoming.phase === "claim" &&
      precedes(current, incoming)
    ) {
      // Reassert only while settling, never while capturing.
      const claim = current;
      void write(claim, () => !owned && same(current, claim)).catch(() => revoke("storage-error"));
    } else {
      revoke("remote");
    }
  });
  void stop.catch(() => {});

  const isOwner = () => {
    if (owned && current && current.expiresAt <= now()) revoke("expired");
    return owned;
  };
  return {
    acquire() {
      if (disposed) return Promise.resolve(false);
      if (isOwner()) return Promise.resolve(true);
      if (pending) return pending;
      const attempt = ++generation;
      const run = async () => {
        try {
          await stop;
          const existing = lease(await storage.get(MIC_OWNERSHIP_KEY));
          if (disposed || attempt !== generation) return false;
          if (existing && existing.expiresAt > now()) return false;
          current = {
            ownerId,
            claimId: `${ownerId}:${randomId()}`,
            startedAt: now(),
            expiresAt: now() + leaseMs,
            phase: "claim",
          };
          const claim = current;
          await write(claim, () => attempt === generation && !disposed);
          await new Promise<void>((resolve) => setTimeout(resolve, settleMs));
          const winner = lease(await storage.get(MIC_OWNERSHIP_KEY));
          if (disposed || attempt !== generation || !same(winner, claim) || !same(current, claim))
            return false;
          current = { ...claim, phase: "held", expiresAt: now() + leaseMs };
          await write(current, () => attempt === generation && !disposed);
          const verified = lease(await storage.get(MIC_OWNERSHIP_KEY));
          if (disposed || attempt !== generation || !same(verified, claim) || !same(current, claim))
            return false;
          owned = true;
          armExpiry();
          armHeartbeat();
          notify("acquired");
          return true;
        } catch {
          revoke("storage-error");
          return false;
        }
      };
      pending = run().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    async release() {
      const previous = current;
      revoke("released");
      if (!previous) return;
      await writes;
      if (same(lease(await storage.get(MIC_OWNERSHIP_KEY)), previous)) await write(null);
    },
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isOwner,
    dispose() {
      if (disposed) return;
      disposed = true;
      revoke("disposed");
      listeners.clear();
      void stop.then((unsubscribe) => unsubscribe()).catch(() => {});
      // A disposed tab's lease expires without risking a delayed write over a new holder.
    },
  };
}

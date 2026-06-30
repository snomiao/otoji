// Per-room approved tracker set, persisted locally (localStorage).
//
// Trust model: env defaults are trusted (you built them in). A tracker proposed
// by an UNTRUSTED source — a share link's ?tr= or another peer's edit to the
// synced graph — is NOT connected to automatically; it stays "pending" until
// the local user approves it here. Approval is per-room and per-browser; it is
// never synced, so one malicious participant cannot move anyone else's trust.

import { dedupeTrackers, capTrackers, parseTracker, isPrivateHost, MAX_TRACKERS } from "./trackers";

const KEY = (room: string) => `otoji.trackers.${room}`;

/** Locally-approved trackers for a room (canonical http(s), capped). */
export function loadApproved(room: string): string[] {
  try {
    const raw = localStorage.getItem(KEY(room));
    return raw ? capTrackers(JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveApproved(room: string, list: string[]): void {
  try {
    localStorage.setItem(KEY(room), JSON.stringify(capTrackers(list)));
  } catch {
    /* private mode / quota — approvals are best-effort */
  }
}

/**
 * Validate a tracker a user is about to approve/add. Untrusted trackers may not
 * point at private/loopback hosts (SSRF-ish); the cap is enforced too.
 * Returns the canonical url, or an { error } a caller can surface.
 */
export function vetTracker(input: string, currentCount: number): { url?: string; error?: string } {
  const { url, error } = parseTracker(input);
  if (error) return { error };
  // SSRF guard: an untrusted tracker must not point a browser at a private host.
  // Allowed under `vite dev` (import.meta.env.DEV) so local multi-worker testing works.
  if (isPrivateHost(url) && !import.meta.env.DEV)
    return { error: "private/loopback hosts can't be added as shared trackers" };
  if (currentCount >= MAX_TRACKERS) return { error: `at most ${MAX_TRACKERS} trackers` };
  return { url };
}

/** dedupe helper re-exported so callers don't import two modules. */
export { dedupeTrackers };

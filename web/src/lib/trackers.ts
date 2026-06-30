// Signaling "trackers" — the list of signaling servers a room is announced on.
//
// Like a BitTorrent magnet link's `&tr=` trackers: a room id is discoverable on
// EVERY tracker in the list, and two peers can find each other as long as their
// tracker lists OVERLAP on at least one server. This is what lets independent
// otoji deployments federate into one network — each runs its own signaling
// server and simply includes the others in its tracker list.
//
// Bootstrap order (how a client FIRST connects, before it has loaded the graph):
//   1. `?tr=` query params on the share/magnet URL (repeatable)
//   2. VITE_SIGNAL_BASES (comma-separated) / VITE_SIGNAL_BASE env at build time
//   3. the production default (wss://otoji.org/signal)
// Once joined, the in-graph Signaling node can declare more trackers, which sync
// to every peer and extend the live connection set (see MultiSignalingClient).

import { DEFAULT_SIGNAL_BASE } from "../net/signaling";

/** Trim whitespace and any trailing slashes so equal URLs compare equal. */
export function normalizeTracker(s: string): string {
  return s.trim().replace(/\/+$/, "");
}

/** Order-preserving de-dupe of normalized tracker URLs (drops blanks). */
export function dedupeTrackers(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = normalizeTracker(raw);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Trackers configured at build time via env (VITE_SIGNAL_BASES / VITE_SIGNAL_BASE). */
export function envTrackers(): string[] {
  const multi = import.meta.env.VITE_SIGNAL_BASES as string | undefined;
  if (multi) return dedupeTrackers(multi.split(","));
  return [DEFAULT_SIGNAL_BASE];
}

/** Trackers carried on the current page URL as `?tr=` params (magnet-style). */
export function urlTrackers(search: string = location.search): string[] {
  return dedupeTrackers(new URLSearchParams(search).getAll("tr"));
}

/**
 * The list a client uses to FIRST connect: URL trackers take precedence (a
 * shared magnet link decides the network), env defaults fill in the rest.
 */
export function bootstrapTrackers(): string[] {
  return dedupeTrackers([...urlTrackers(), ...envTrackers()]);
}

/** Trackers that aren't already implied by the local env defaults — i.e. the
 *  ones a share link must carry so a friend joins the same network. */
export function extraTrackers(trackers: string[]): string[] {
  const baseline = new Set(envTrackers());
  return dedupeTrackers(trackers).filter((t) => !baseline.has(t));
}

/** Append `&tr=` params for any tracker not implied by the recipient's defaults. */
export function appendTrackers(url: string, trackers: string[]): string {
  const extra = extraTrackers(trackers);
  if (extra.length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + extra.map((t) => `tr=${encodeURIComponent(t)}`).join("&");
}

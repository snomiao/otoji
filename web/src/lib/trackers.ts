// Signaling "trackers" — the signaling servers a room is announced on.
//
// Like a BitTorrent magnet link's `&tr=` trackers: a room id is discoverable on
// EVERY tracker in the list, and two peers find each other as long as their
// tracker lists OVERLAP on at least one server. This is what lets independent
// otoji deployments federate into one network.
//
// Canonical form is the HTTP(S) origin+path of the server (e.g.
// https://otoji.org/signal). A wss endpoint lives at the same https origin, so
// we display/store/share the http(s) form and convert to ws(s) only when
// opening the socket (see toSocketUrl). Pasting ws://, wss://, http:// or
// https:// all work and fold to the same canonical url; anything else errors.
//
// SECURITY: trackers introduced by an untrusted source (a share link's ?tr= or
// a peer's edit to the synced graph) are NOT auto-applied — they are surfaced
// as pending and require explicit approval before this browser connects. Only
// build-time env defaults and locally-approved trackers drive live connections.
// See tracker-trust.ts + MultiSignalingClient.

/** Hard cap on how many trackers one client will ever connect to. */
export const MAX_TRACKERS = 6;

/** Default signaling server (production). Canonical http(s) form. */
export const DEFAULT_SIGNAL_BASE = "https://otoji.org/signal";

const WS_TO_HTTP: Record<string, string> = { "ws:": "http:", "wss:": "https:" };

export interface ParsedTracker {
  url: string; // canonical http(s) form, "" on error
  error?: string;
}

/**
 * Normalize any ws/wss/http/https input to the canonical http(s) form, or
 * return an error for anything that isn't a usable signaling URL.
 */
export function parseTracker(input: string): ParsedTracker {
  const raw = (input ?? "").trim();
  if (!raw) return { url: "", error: "empty" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { url: "", error: "not a valid URL" };
  }
  const proto =
    WS_TO_HTTP[u.protocol] ?? (u.protocol === "http:" || u.protocol === "https:" ? u.protocol : null);
  if (!proto) {
    return { url: "", error: `unsupported scheme "${u.protocol}" — use https:// (wss:// also works)` };
  }
  if (!u.hostname) return { url: "", error: "missing host" };
  if (u.search || u.hash) return { url: "", error: "tracker URL must not contain a query or fragment" };
  u.protocol = proto;
  u.username = ""; // never carry embedded credentials in a shared tracker
  u.password = "";
  return { url: u.toString().replace(/\/+$/, "") };
}

/** Canonical http(s) form (empty string if invalid). */
export function normalizeTracker(s: string): string {
  return parseTracker(s).url;
}

/** Convert a canonical http(s) tracker to the ws(s) URL for `new WebSocket()`. */
export function toSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

/**
 * Loopback / private / link-local / .local host? Such hosts are allowed for
 * TRUSTED trackers (your own env/local dev) but rejected when an untrusted
 * source (link/graph) tries to point your browser at them (SSRF-ish).
 */
export function isPrivateHost(httpUrl: string): boolean {
  let h: string;
  try {
    h = new URL(httpUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  h = h.replace(/\.$/, ""); // trailing dot (localhost. == localhost)
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1); // unwrap IPv6 brackets
  const v4 = (s: string) =>
    /^127\./.test(s) ||
    /^10\./.test(s) ||
    /^192\.168\./.test(s) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(s) ||
    /^169\.254\./.test(s) ||
    s === "0.0.0.0";
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (v4(h)) return true;
  // IPv6 loopback / unspecified / link-local / unique-local / IPv4-mapped.
  if (h === "::1" || h === "::") return true;
  if (/^fe80:/.test(h) || /^f[cd][0-9a-f]{2}:/.test(h)) return true;
  // IPv4-mapped (::ffff:a.b.c.d, normalized by URL to hex ::ffff:7f00:1) — block
  // all such literals; real servers don't use mapped-IPv6 URL hosts.
  if (h.startsWith("::ffff:")) return true;
  return false;
}

/** Order-preserving de-dupe of canonicalized tracker URLs (drops invalid/blank). */
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

/** De-dupe and clamp to MAX_TRACKERS (defends against amplification). */
export function capTrackers(list: string[]): string[] {
  return dedupeTrackers(list).slice(0, MAX_TRACKERS);
}

/** Trackers configured at build time (VITE_SIGNAL_BASES / VITE_SIGNAL_BASE). Trusted. */
export function envTrackers(): string[] {
  const multi = (import.meta.env.VITE_SIGNAL_BASES ?? import.meta.env.VITE_SIGNAL_BASE) as
    | string
    | undefined;
  if (multi) {
    const parsed = dedupeTrackers(multi.split(","));
    if (parsed.length) return parsed;
  }
  return [DEFAULT_SIGNAL_BASE];
}

/** Trackers carried on the current page URL as `?tr=` params (magnet-style). UNTRUSTED. */
export function urlTrackers(search: string = location.search): string[] {
  return dedupeTrackers(new URLSearchParams(search).getAll("tr"));
}

/** Trackers that aren't already implied by the local env defaults — the ones a
 *  share link must carry so a friend can be offered the same network. */
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

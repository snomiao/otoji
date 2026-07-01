// Per-device, local-only UI preferences (NOT synced to the shared graph). Each
// device independently chooses which node previews it shows.

const KEY = "otoji.preview.hidden"; // set of nodeIds whose preview is hidden here

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function save(s: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function isPreviewShown(nodeId: string): boolean {
  return !load().has(nodeId); // shown by default
}

const listeners = new Set<() => void>();
/** Subscribe to preview-visibility changes (for useSyncExternalStore). */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPreviewShown(nodeId: string, shown: boolean): void {
  const s = load();
  if (shown) s.delete(nodeId);
  else s.add(nodeId);
  save(s);
  listeners.forEach((f) => f());
}

export function togglePreviewShown(nodeId: string): void {
  setPreviewShown(nodeId, !isPreviewShown(nodeId));
}

// --- Peer connection-type badge ([wan]/[lan]/[browser]) visibility ----------
// A single device-local boolean (shown by default). Stored as a sentinel so its
// absence reads as "shown"; shares the prefs listener set for reactive UI.
const BADGE_KEY = "otoji.peerBadge.hidden";

export function isPeerBadgeShown(): boolean {
  try {
    return localStorage.getItem(BADGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setPeerBadgeShown(shown: boolean): void {
  try {
    if (shown) localStorage.removeItem(BADGE_KEY);
    else localStorage.setItem(BADGE_KEY, "1");
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function togglePeerBadgeShown(): void {
  setPeerBadgeShown(!isPeerBadgeShown());
}

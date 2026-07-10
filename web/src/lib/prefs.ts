// Per-device, local-only UI preference: which node previews this device shows.
// NOT synced to the shared graph. Stored as explicit OVERRIDES; the default
// (when there's no override) is supplied by the caller. Otoji defaults previews
// to visible for every device so the room shares the same visual state; a
// non-owner streams the preview from the owner over the mesh.

const KEY = "otoji.preview.override"; // nodeId -> explicit shown (true) / hidden (false)

function load(): Map<string, boolean> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    return new Map(Object.entries(o).map(([k, v]) => [k, !!v]));
  } catch {
    return new Map();
  }
}

function save(m: Map<string, boolean>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    /* ignore */
  }
}

/** Whether this device shows node `nodeId`'s preview. `defaultShown` is the
 *  value when the user hasn't explicitly chosen — pass `ownedHere` so previews
 *  default to on for the owner and off for everyone else. */
export function isPreviewShown(nodeId: string, defaultShown = true): boolean {
  const v = load().get(nodeId);
  return v === undefined ? defaultShown : v;
}

const listeners = new Set<() => void>();
/** Subscribe to preview-visibility changes (for useSyncExternalStore). */
export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPreviewShown(nodeId: string, shown: boolean, defaultShown = true): void {
  const m = load();
  if (shown === defaultShown) m.delete(nodeId); // back to default → drop the override
  else m.set(nodeId, shown);
  save(m);
  listeners.forEach((f) => f());
}

export function togglePreviewShown(nodeId: string, defaultShown = true): void {
  setPreviewShown(nodeId, !isPreviewShown(nodeId, defaultShown), defaultShown);
}

/** Nodes this device wants streamed from a remote owner: every non-owned node
 *  that is not explicitly hidden. `ownedIds` = node ids this device owns. */
export function shownRemoteNodes(ownedIds: Set<string>, allIds: string[]): string[] {
  return allIds.filter((id) => !ownedIds.has(id) && isPreviewShown(id, true));
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

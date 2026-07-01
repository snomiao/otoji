// Per-device, local-only UI preference: which node previews this device shows.
// NOT synced to the shared graph. Stored as explicit OVERRIDES; the default
// (when there's no override) is supplied by the caller — a node previews by
// default only on the device that OWNS it, so a non-owner stays off until the
// user opts in. Opting in on a non-owner streams the preview from the owner over
// the mesh (see graph/preview-sync.ts).

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

/** Nodes this device wants streamed from a remote owner: preview explicitly
 *  turned on AND not owned here. `ownedIds` = node ids this device owns. */
export function shownRemoteNodes(ownedIds: Set<string>): string[] {
  const out: string[] = [];
  for (const [id, shown] of load()) if (shown && !ownedIds.has(id)) out.push(id);
  return out;
}

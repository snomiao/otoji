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

export function setPreviewShown(nodeId: string, shown: boolean): void {
  const s = load();
  if (shown) s.delete(nodeId);
  else s.add(nodeId);
  save(s);
}

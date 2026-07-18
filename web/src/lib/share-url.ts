// Graph snapshot sharing: serialize the whole graph as a device-neutral
// GraphTemplate, lz-compress it into a URL hash (`#g=...`), and expand it on
// load. The link is self-contained — no room, no server, nothing stored.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { GraphTemplate } from "./templates";

export const SHARE_HASH_PREFIX = "#g=";

/** Build a self-contained share URL that opens the local editor with `tpl`. */
export function graphShareUrl(tpl: GraphTemplate, origin = location.origin): string {
  const packed = compressToEncodedURIComponent(JSON.stringify({ v: 1, tpl }));
  return `${origin}/?local${SHARE_HASH_PREFIX}${packed}`;
}

/** Decode a shared graph from a `#g=` hash; null if absent or malformed. */
export function readSharedGraph(hash = location.hash): GraphTemplate | null {
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
  try {
    const raw = decompressFromEncodedURIComponent(hash.slice(SHARE_HASH_PREFIX.length));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed?.tpl?.nodes) || parsed.tpl.nodes.length === 0) return null;
    if (!Array.isArray(parsed.tpl.edges)) parsed.tpl.edges = [];
    return parsed.tpl as GraphTemplate;
  } catch {
    return null;
  }
}

/** Drop the `#g=` hash after expanding it so reloads don't re-import. */
export function clearSharedGraphHash() {
  if (location.hash.startsWith(SHARE_HASH_PREFIX)) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

// Consume-once wrapper: the first call decodes + clears the hash; later calls
// (StrictMode's double-mount effect) return the same decoded template instead
// of seeing an empty hash and falling back to the saved graph.
let consumed: GraphTemplate | null = null;
export function takeSharedGraph(): GraphTemplate | null {
  const fresh = readSharedGraph();
  if (fresh) {
    consumed = fresh;
    clearSharedGraphHash();
  }
  return consumed;
}

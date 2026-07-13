// Signal algebra — otoji's half of the agreement with rgui (rgui docs/signal.md,
// commit 4fb6cdf; see TODO.md "Adopt rgui signal algebra").
//
// Each port type declares an `ownership` saying whether its signal can be
// DUPLICATED (serialized onto a wire: copy/clone) or only ALIASED in-process
// (share) or neither (move). Cross-device delivery IS duplication, so edges
// carrying a share/move signal cannot cross a device boundary; all built-in
// port types currently have a wire format.
//
// Types mirror rgui's signal module. Once rgui 4fb6cdf reaches main and the
// submodule is bumped, swap isDuplicable/isAliasable for the rgui exports —
// the values are identical by agreement.

import { NODE_SPECS, type PortType, type VoiceEdge, type VoiceGraph, type VoiceNode } from "./model";

export type Measure = "extensive" | "intensive";
export type Ownership = "copy" | "clone" | "share" | "move";
export type Fanout = "broadcast" | "split" | "route";

/** Per-signal declarations (mapping agreed with rgui, 2026-07-09). */
export const SIGNAL: Record<PortType, { measure: Measure; ownership: Ownership }> = {
  // A transcript is a fact — duplicate freely to every consumer.
  transcript: { measure: "extensive", ownership: "copy" },
  // PCM is duplicable but costly: remote fan-out = N serializations + N sends.
  segment: { measure: "extensive", ownership: "clone" },
  // ImageBitmap handles are cloned by encoding the frame for transport.
  image: { measure: "intensive", ownership: "clone" },
  // Feedback pulses are tiny JSON messages and can cross device boundaries.
  control: { measure: "intensive", ownership: "copy" },
  // Environment links are metadata/capability references, not media payloads.
  environment: { measure: "intensive", ownership: "copy" },
  spatial: { measure: "intensive", ownership: "clone" },
};

/** Can the signal be turned into a wire frame? (copy/clone) */
export const isDuplicable = (o: Ownership): boolean => o === "copy" || o === "clone";
/** Can the signal be handed to several same-process consumers? (all but move) */
export const isAliasable = (o: Ownership): boolean => o !== "move";

/** The signal type an edge carries (its source output port's type). */
export function edgeSignalType(
  graph: VoiceGraph,
  e: Pick<VoiceEdge, "source" | "sourceHandle">,
): PortType | null {
  const n = graph.nodes[e.source];
  if (!n) return null;
  return NODE_SPECS[n.type].outputs.find((p) => p.id === e.sourceHandle)?.type ?? null;
}

/**
 * Ids of edges whose signal has no wire format (share/move) but whose endpoints
 * resolve to different devices — the runtime will silently drop these frames.
 * `ownerOf` must be the runtime's owner resolution (`nodeOwner` bound to the
 * online device list) so the flag and the drop agree exactly; it is a parameter
 * (not an import) to keep this module — and the adapter that imports SIGNAL —
 * free of the runtime's provider dependencies. Callers in single-device/local
 * mode should skip the check: the runtime then runs every node in-process and
 * delivery is by reference.
 */
export function illegalCrossDeviceEdges(
  graph: VoiceGraph,
  ownerOf: (node: VoiceNode) => string | null,
): Set<string> {
  const out = new Set<string>();
  for (const e of graph.edges) {
    const t = edgeSignalType(graph, e);
    if (!t || isDuplicable(SIGNAL[t].ownership)) continue;
    const src = graph.nodes[e.source];
    const dst = graph.nodes[e.target];
    if (!src || !dst) continue;
    const from = ownerOf(src);
    const to = ownerOf(dst);
    if (from && to && from !== to) out.add(e.id);
  }
  return out;
}

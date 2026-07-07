// Adapter: otoji VoiceGraph -> @snomiao/rgui Graph.
//
// This is the integration contract with the rgui readable-grid renderer. The
// rgui types below are a LOCAL MIRROR of `@snomiao/rgui`'s public `Graph` shape
// (see rgui `src/core/graph.ts`) so this module — and `tsgo --noEmit` in CI —
// never depends on the lib being installed. The runtime `import()` of the lib
// lives in RguiGraphView, behind the `?renderer=rgui` flag. Keep these in sync
// with rgui; if they drift, the adapter is the single place to fix.

import { NODE_SPECS, type NodeType, type PortType, type VoiceGraph } from "./model";

// ---- rgui public Graph shape (mirror of @snomiao/rgui) --------------------
export type RgSignalKind = "image" | "audio" | "text" | "ctl";
export type RgNodeCategory = "source" | "model" | "sink";
export interface RgPort {
  id: string;
  label: string;
  kind: RgSignalKind;
}
export interface RgGraphNode {
  id: string;
  title: string;
  category: RgNodeCategory;
  x: number;
  y: number;
  w: number;
  inputs: RgPort[];
  outputs: RgPort[];
  fields: [string, string][];
}
export interface RgEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
  dashed?: boolean;
}
export interface RgGraph {
  nodes: RgGraphNode[];
  edges: RgEdge[];
}

// ---- mapping --------------------------------------------------------------

// otoji signal type -> rgui wire/port color class.
const KIND: Record<PortType, RgSignalKind> = {
  segment: "audio",
  transcript: "text",
  image: "image",
  control: "ctl",
};

/** A node with no inputs is a source, none-outputs is a sink, else a model. */
function categoryOf(type: NodeType): RgNodeCategory {
  const spec = NODE_SPECS[type];
  if (spec.inputs.length === 0) return "source";
  if (spec.outputs.length === 0) return "sink";
  return "model";
}

const DEFAULT_W = 200;

export interface RguiMeta {
  /** deviceId -> human label, for the node's `device` field row */
  deviceName?: (deviceId: string | null) => string;
}

/**
 * Convert an otoji VoiceGraph into an rgui Graph. Pure + deterministic: same
 * graph in, same rgui graph out (safe to memoize). Port ids/labels come from
 * NODE_SPECS; positions pass through unchanged (both use world coords).
 */
export function voiceGraphToRgui(graph: VoiceGraph, meta: RguiMeta = {}): RgGraph {
  const nameOf = meta.deviceName ?? ((d) => d ?? "unassigned");
  const nodes: RgGraphNode[] = Object.values(graph.nodes).map((n) => {
    const spec = NODE_SPECS[n.type];
    const fields: [string, string][] = [["device", nameOf(n.device)]];
    return {
      id: n.id,
      title: spec.label,
      category: categoryOf(n.type),
      x: n.pos.x,
      y: n.pos.y,
      w: DEFAULT_W,
      inputs: spec.inputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type] })),
      outputs: spec.outputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type] })),
      fields,
    };
  });
  // Drop edges whose endpoints are missing (defensive; the synced graph can lag).
  const has = (id: string) => id in graph.nodes;
  const edges: RgEdge[] = graph.edges
    .filter((e) => has(e.source) && has(e.target))
    .map((e) => ({
      from: { node: e.source, port: e.sourceHandle },
      to: { node: e.target, port: e.targetHandle },
    }));
  return { nodes, edges };
}

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
  /** reserved live-body rows (rgui draws `body` inside them) */
  bodyRows?: number;
  /** live-body draw hook — screen-space ctx clipped to the body region */
  body?: (ctx: CanvasRenderingContext2D, rect: { width: number; height: number }, view: { k: number }) => void;
}
export interface RgEdgeStyle {
  color?: string;
  width?: number;
  dash?: number[];
}
export interface RgEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
  dashed?: boolean;
  style?: RgEdgeStyle;
  label?: string;
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
  /** per-edge visual overrides (running animation, selection, rate label) */
  edgeMeta?: (edge: { id: string; source: string; target: string }) => {
    style?: RgEdgeStyle;
    dashed?: boolean;
    label?: string;
  } | undefined;
  /** live-body draw hook per node (waveform / partial text / image / busy) */
  nodeBody?: (node: { id: string; type: NodeType }) => { rows: number; draw: RgGraphNode["body"] } | undefined;
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
    const body = meta.nodeBody?.({ id: n.id, type: n.type });
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
      ...(body ? { bodyRows: body.rows, body: body.draw } : {}),
    };
  });
  // Drop edges whose endpoints are missing (defensive; the synced graph can lag).
  const has = (id: string) => id in graph.nodes;
  const edges: RgEdge[] = graph.edges
    .filter((e) => has(e.source) && has(e.target))
    .map((e) => {
      const m = meta.edgeMeta?.({ id: e.id, source: e.source, target: e.target });
      return {
        from: { node: e.source, port: e.sourceHandle },
        to: { node: e.target, port: e.targetHandle },
        ...(m?.dashed != null ? { dashed: m.dashed } : {}),
        ...(m?.style ? { style: m.style } : {}),
        ...(m?.label ? { label: m.label } : {}),
      };
    });
  return { nodes, edges };
}

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
export type RgNodeCategory = "source" | "model" | "sink" | "note";
export interface RgPort {
  id: string;
  label: string;
  kind: RgSignalKind;
}
/** node-anchored HTML overlay (mirror of rgui's GraphNode.overlay) */
export interface RgNodeOverlay {
  el: HTMLElement;
  anchor?: "right" | "below" | "over";
  offset?: { x: number; y: number };
  interactive?: boolean;
  /** "fixed" (screen-constant, default) | "zoom" (scales with view.k) |
   * "fit" (scales to fill the node's screen area) */
  scale?: "fixed" | "zoom" | "fit";
  /** zoom/fit: hide once the applied scale drops below this (default 0.75) */
  minScale?: number;
  /** fit: cap on the applied scale (default 1 — never upscale past natural) */
  maxScale?: number;
  /** clip the overlay to the node rect / viewport / not at all */
  clip?: "node" | "viewport" | "none";
  overflow?: "hidden" | "auto";
  destroy?: () => void;
}
export interface RgGraphNode {
  id: string;
  title: string;
  category: RgNodeCategory;
  x: number;
  y: number;
  w: number;
  /** explicit height — extra space flows into the live-body region */
  h?: number;
  /** content scale (default 1): magnifies the node like a lens (shift+grip) */
  scale?: number;
  /** annotation / sticky-card node (no header band / ports / field rows) */
  note?: boolean;
  /** node-anchored HTML overlay, glued to the node's screen rect */
  overlay?: RgNodeOverlay;
  inputs: RgPort[];
  outputs: RgPort[];
  fields: [string, string][];
  /** how each field merges when this node renormalizes into a contracted block
   *  (rgui aggregate rule; unlisted keys fall back to "mode") */
  fieldRules?: Record<string, "max" | "min" | "sum" | "mean" | "range" | "mode" | "set" | "median" | "same" | "any" | "all" | "first" | "last" | "count">;
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

// Mirrors of rgui's grip clamps (grip.ts MIN_SCALE/MAX_SCALE, graph.ts
// NODE_MIN_W). setGraph does NOT validate geometry — these invariants are only
// enforced inside the grip gestures — so normalize persisted/synced values here
// or an out-of-range peer value would render as a broken node.
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const NODE_MIN_W = 96;

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
    // user-resized box + content scale persist on the VoiceNode; the rgui
    // corner grip reports them back via onNodeResizeEnd (see RguiGraphView)
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, n.scale ?? 1));
    const w = Math.max(NODE_MIN_W * scale, n.size?.w ?? DEFAULT_W);
    return {
      id: n.id,
      title: spec.label,
      category: categoryOf(n.type),
      x: n.pos.x,
      y: n.pos.y,
      w,
      ...(n.size?.h != null ? { h: n.size.h } : {}),
      ...(scale !== 1 ? { scale } : {}),
      inputs: spec.inputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type] })),
      outputs: spec.outputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type] })),
      fields,
      // when a chain contracts, show the SET of distinct devices in the block
      // (otoji is multi-device; "set" beats the "mode" fallback here)
      fieldRules: { device: "set" },
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

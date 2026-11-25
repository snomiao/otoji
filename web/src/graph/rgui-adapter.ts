// Adapter: otoji VoiceGraph -> @snomiao/rgui Graph.
//
// This is the integration contract with the rgui readable-grid renderer. The
// rgui types below are a LOCAL MIRROR of `@snomiao/rgui`'s public `Graph` shape
// (see rgui `src/core/graph.ts`) so this module — and `tsgo --noEmit` in CI —
// never depends on the lib being installed. The runtime `import()` of the lib
// lives in RguiGraphView, behind the `?renderer=rgui` flag. Keep these in sync
// with rgui; if they drift, the adapter is the single place to fix.

import { NODE_SPECS, type NodeType, type PortType, type VoiceGraph } from "./model";
import { SIGNAL } from "./signal";

// ---- rgui public Graph shape (mirror of @snomiao/rgui) --------------------
export type RgSignalKind = "image" | "audio" | "text" | "ctl";
export type RgNodeCategory = "source" | "model" | "sink" | "note";
// rgui signal algebra (commit 4fb6cdf): all optional; unset = the default
// {intensive, copy, broadcast} = pre-algebra behavior.
export type RgMeasure = "extensive" | "intensive";
export type RgOwnership = "copy" | "clone" | "share" | "move";
export type RgFanout = "broadcast" | "split" | "route";
export type RgGrain = "continuous" | "atom";
export type RgMergeRule =
  | "max" | "min" | "sum" | "concat" | "mean" | "range" | "mode" | "set"
  | "median" | "same" | "any" | "all" | "first" | "last" | "count"
  | ((values: string[]) => string);
export interface RgPort {
  id: string;
  label: string;
  kind: RgSignalKind;
  /** does `+` mean anything across parallel sources? */
  measure?: RgMeasure;
  /** may the signal be duplicated (copy/clone) or only aliased (share)? */
  ownership?: RgOwnership;
  /** default fan-out policy at this port */
  fanout?: RgFanout;
  /** split only: where cuts are legal */
  grain?: RgGrain;
  /** grain "atom" only: the boundary's name — "line" | "frame" | … */
  atom?: string;
  /** fan-in rule when several edges converge here */
  merge?: RgMergeRule;
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
  flow?: "ltr" | "rtl" | "ttb" | "btt";
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
  /** draw an animated processing outline; may be a live getter. */
  busy?: boolean | (() => boolean);
  /** draw a friend/remote-device outline; may be a live getter. */
  remote?: boolean | (() => boolean);
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
  /** split fan-out: this edge's proportional take */
  weight?: number;
}
export interface RgGraph {
  nodes: RgGraphNode[];
  edges: RgEdge[];
  /** per-group fan-out policy overrides, keyed "nodeId.portId" */
  fanout?: Record<string, RgFanout>;
}

// ---- mapping --------------------------------------------------------------

// otoji signal type -> rgui wire/port color class.
const KIND: Record<PortType, RgSignalKind> = {
  segment: "audio",
  transcript: "text",
  image: "image",
  control: "ctl",
  environment: "ctl",
  spatial: "ctl",
  model: "ctl",
};

/** A node with no inputs is a source, none-outputs is a sink, else a model. */
function categoryOf(type: NodeType): RgNodeCategory {
  const spec = NODE_SPECS[type];
  if (spec.inputs.filter((p) => p.id !== "env").length === 0) return "source";
  if (spec.outputs.length === 0) return "sink";
  return "model";
}

const DEFAULT_W = 200;
const TEXT_PREVIEW_TYPES = new Set<NodeType>(["environment", "stt", "web-speech", "vosk", "sherpa", "vibevoice-asr", "translate", "browser-translate-api", "text-aggregate", "text-normalize", "text-filter", "llm-agent", "model", "tts", "tts-model", "sink", "srt-out", "paddle-ocr", "text-diff", "google-doc-live"]);

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
  /** live processing state per node, used for canvas chrome independent of body. */
  nodeBusy?: (node: { id: string; type: NodeType }) => boolean;
  /** remote/friend node state per node, used for canvas chrome. */
  nodeRemote?: (node: { id: string; type: NodeType }) => boolean;
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
    const modelSourceTitle = n.type === "model-source"
      ? n.config?.provider === "webllm"
        ? "WebLLM Models"
        : n.config?.provider === "civitai"
        ? "Civitai Models"
        : n.config?.provider === "url"
          ? "Model URL"
          : "Hugging Face Models"
      : undefined;
    const mediaTitle = ["file-audio", "file-image", "file-text", "textarea", "video-clip"].includes(n.type)
      ? String(n.config?.title ?? n.config?.file ?? "").trim() || undefined
      : undefined;
    const fields: [string, string][] = [["device", nameOf(n.device)]];
    const body = meta.nodeBody?.({ id: n.id, type: n.type });
    // user-resized box + content scale persist on the VoiceNode; the rgui
    // corner grip reports them back via onNodeResizeEnd (see RguiGraphView)
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, n.scale ?? 1));
    // full-bleed content nodes (Monaco editor / visual previews) get a
    // content-sized default box
    const fullBleed = n.type === "textarea" || n.type === "screen-share" || n.type === "camera" || n.type === "vision-model" || n.type === "qwen-image" || n.type === "depth-field" || n.type === "hand-space" || n.type === "spatial-renderer" || n.type === "image-match" || n.type === "ar-notes";
    const textPreview = TEXT_PREVIEW_TYPES.has(n.type);
    const defW = fullBleed ? 320 : textPreview ? 260 : DEFAULT_W;
    const w = Math.max(NODE_MIN_W * scale, n.size?.w ?? defW);
    const rawH =
      n.size?.h ??
      (n.type === "textarea" ? 232 : fullBleed ? 190 : textPreview ? 150 : undefined);
    const h = textPreview && rawH != null ? Math.max(w / 2, Math.min(w * 2, rawH)) : rawH;
    const defH =
      h == null
        ? {}
        : { h };
    return {
      id: n.id,
      title: mediaTitle ?? modelSourceTitle ?? spec.label,
      category: categoryOf(n.type),
      x: n.pos.x,
      y: n.pos.y,
      w,
      flow: "ltr",
      ...defH,
      ...(scale !== 1 ? { scale } : {}),
      // Signal-algebra declarations ride along on every port (fanout stays the
      // "broadcast" default). rgui versions before 4fb6cdf simply ignore them.
      inputs: spec.inputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type], ...SIGNAL[p.type] })),
      outputs: spec.outputs.map((p) => ({ id: p.id, label: p.id, kind: KIND[p.type], ...SIGNAL[p.type] })),
      fields,
      // when a chain contracts, show the SET of distinct devices in the block
      // (otoji is multi-device; "set" beats the "mode" fallback here)
      fieldRules: { device: "set" },
      ...(meta.nodeBusy ? { busy: () => meta.nodeBusy!({ id: n.id, type: n.type }) } : {}),
      ...(meta.nodeRemote ? { remote: () => meta.nodeRemote!({ id: n.id, type: n.type }) } : {}),
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

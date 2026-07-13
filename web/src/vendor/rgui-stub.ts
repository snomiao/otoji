// Type shim + runtime fallback for @snomiao/rgui.
//
// rgui is consumed as LIVE SOURCE (git submodule at lib/rgui, or the local
// ~/ws/snomiao/rgui worktree) via a vite alias — not npm, since it's under heavy
// co-development. To keep otoji's `tsgo --noEmit` STABLE and independent of
// rgui's internal source churn, tsconfig `paths` maps `@snomiao/rgui` here: this
// file declares rgui's PUBLIC API surface (v0.2.0). At runtime the vite alias
// points at the real source; this module's `createRgui` only runs as a last
// resort (submodule not checked out AND no local worktree), where it throws and
// RguiGraphView shows a "renderer unavailable" notice.
//
// Keep these signatures in sync with lib/rgui/src/rgui.ts + core/graph.ts.

import type {
  RgGraph,
  RgGraphNode,
  RgPort,
  RgEdge,
  RgSignalKind,
  RgNodeCategory,
} from "../graph/rgui-adapter";

// rgui's public graph types are the same shapes the adapter builds.
export type Graph = RgGraph;
export type GraphNode = RgGraphNode;
export type Port = RgPort;
export type Edge = RgEdge;
export type SignalKind = RgSignalKind;
export type NodeCategory = RgNodeCategory;

export type Measure = "extensive" | "intensive";
export type Ownership = "copy" | "clone" | "share" | "move";
export type Fanout = "broadcast" | "split" | "route";
export type Grain = "continuous" | "atom";
export type MergeRule =
  | "max" | "min" | "sum" | "concat" | "mean" | "range" | "mode" | "set"
  | "median" | "same" | "any" | "all" | "first" | "last" | "count";
export interface SignalSpec {
  measure?: Measure;
  ownership?: Ownership;
  fanout?: Fanout;
  grain?: Grain;
  atom?: string;
  merge?: MergeRule;
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** reference to one port of one node (interactive edge creation) */
export interface PortRef {
  node: string;
  port: string;
  side: "in" | "out";
}

// v0.3.0 canvas-native palettes/panels
export interface PanelItem {
  id: string;
  label: string;
  color?: string;
}
export interface Panel {
  id: string;
  title: string;
  anchor?: "left" | "right" | { x: number; y: number };
  w?: number;
  items: PanelItem[];
  collapsed?: boolean;
  onItemClick?: (item: PanelItem, screen: { x: number; y: number }) => void;
  onItemDrop?: (item: PanelItem, at: { world: { x: number; y: number }; screen: { x: number; y: number } }) => void;
}

export interface RgRule {
  collapsePx: number;
  minGridPx: number;
  radix: number;
  [k: string]: unknown;
}

// v0.3.0 summarize rule (compact host content for small / merged nodes)
export type SummaryContent =
  | { kind: "text"; lines: string[] }
  | { kind: "kv"; rows: [string, string][] }
  | { kind: "canvas"; draw: (ctx: CanvasRenderingContext2D, rect: { width: number; height: number }) => void; height?: number };
export interface SummaryInfo {
  collapsed: boolean;
  level: "small" | "pseudo";
  screen: { w: number; h: number };
}
export type SummarizeFn = (nodes: GraphNode[], info: SummaryInfo) => SummaryContent | null | undefined;

export interface RguiOptions {
  graph?: Graph;
  rule?: Partial<RgRule>;
  /** rendering backend (default "auto"); force "canvas2d" to skip WebGPU */
  renderer?: "auto" | "canvas2d" | "webgpu";
  /** host summarize rule for small/merged nodes */
  summarize?: SummarizeFn;
  debug?: HTMLElement | null;
  layers?: unknown[];
  view?: ViewTransform;
  onFrame?: (view: ViewTransform, rg: unknown) => void;
  // v0.2.0 interaction callbacks (host-app state sync)
  onNodeMove?: (nodeId: string, pos: { x: number; y: number }) => void;
  onNodeMoveEnd?: (nodeId: string, pos: { x: number; y: number }) => void;
  // v2.10 corner-grip resize ⇄ rescale (shift toggles mid-drag); values are
  // grid-snapped/clamped — `scale` is the content scale (rescale mode only)
  onNodeResize?: (nodeId: string, size: { w: number; h: number; scale: number }) => void;
  onNodeResizeEnd?: (nodeId: string, size: { w: number; h: number; scale: number }) => void;
  isValidConnection?: (from: PortRef, to: PortRef) => boolean;
  onConnect?: (from: PortRef, to: PortRef) => void;
  onNodeClick?: (nodeId: string, screen: { x: number; y: number }) => void;
  onNodeContextMenu?: (nodeId: string, screen: { x: number; y: number }) => void;
  // v0.3.0 selection
  onSelectionChange?: (nodeIds: string[]) => void;
  // v0.3.0 edge interaction + wire-drop-on-empty
  onEdgeClick?: (edge: Edge, screen: { x: number; y: number }) => void;
  onEdgeContextMenu?: (edge: Edge, screen: { x: number; y: number }) => void;
  onConnectEnd?: (
    from: PortRef,
    at: { screen: { x: number; y: number }; world: { x: number; y: number } },
  ) => void;
  /** right-button drag from a node body, resolved by the host app. */
  onSmartLinkEnd?: (
    fromNodeId: string,
    at: {
      screen: { x: number; y: number };
      world: { x: number; y: number };
      targetNodeId?: string;
    },
  ) => void;
  // v0.3.0 canvas-native palettes
  panels?: Panel[];
  /** v2.10 a panel was header-dragged (fires on release); pass the anchor back
   *  via Panel.anchor next run to restore its position */
  onPanelMove?: (panel: Panel, anchor: { x: number; y: number }) => void;
}

export interface Rgui {
  canvas: HTMLCanvasElement;
  readonly view: ViewTransform;
  readonly rule: RgRule;
  graph: Graph;
  setGraph(g: Graph): void;
  /** v0.3.0: selected node ids (click / shift-drag box) */
  readonly selection: string[];
  setSelection(nodeIds: string[]): void;
  /** v0.3.0: programmatic viewport control */
  setView(view: ViewTransform): void;
  fitView(paddingPx?: number): void;
  fitNode(nodeId: string, paddingPx?: number): void;
  /** snap every node to the current-scale main grid; fires onNodeMoveEnd per moved
   *  node (normal broadcast path) unless {silent:true} */
  snapGraph(opts?: { silent?: boolean }): void;
  autoLayout(opts?: AutoLayoutOptions): void;
  /** v1.7.0 billboard 3-D: current graph-plane orientation (radians) */
  readonly rotation3: { yaw: number; pitch: number; roll: number };
  /** v1.7.0 billboard 3-D: tilt the graph plane (nodes stay upright 2-D cards) */
  setRotation3(target: { yaw?: number; pitch?: number; roll?: number }, opts?: { animate?: boolean }): void;
  /** v0.3.0: replace the canvas-native palettes */
  setPanels(panels: Panel[]): void;
  /** v0.3.0: attach/replace/remove a node-anchored HTML overlay */
  setNodeOverlay(nodeId: string, overlay: HTMLElement | NodeHtmlOverlay | null): void;
  /** v2.10: programmatic rescale — magnify the node about its top-left corner
   *  (the shift+grip drag's endpoint, reachable from code) */
  rescaleNode(nodeId: string, scale: number): void;
  /** v2.10: change rg-rule fields live (radix, sizeLaw, thresholds…); call
   *  snapGraph() afterwards to re-seat the graph on the new lattice */
  setRule(rule: Partial<RgRule>): void;
  invalidate(): void;
  destroy(): void;
}

export type AutoLayoutOptions =
  | ({ animate?: boolean; mode?: "layered"; gapX?: number; gapY?: number; gridStep?: number; origin?: { x: number; y: number } })
  | ({ animate?: boolean; mode: "dense"; gridStep?: number; gapCells?: number; relaxationPasses?: number; origin?: { x: number; y: number } });

export interface NodeHtmlOverlay {
  el: HTMLElement;
  anchor?: "right" | "below" | "over";
  offset?: { x: number; y: number };
  /** "fixed" screen-constant (default); "zoom" scales with view.k (laid out for
   * k=1); "fit" scales to fill the node's screen area */
  scale?: "fixed" | "zoom" | "fit";
  /** hide the overlay when the effective scale drops below this */
  minScale?: number;
  /** fit: cap on the applied scale (default 1 — never upscale past natural) */
  maxScale?: number;
  /** "node" bounds the overlay to the node screen rect (default "viewport") */
  clip?: "node" | "viewport" | "none";
  /** how overflow past the clip box is handled (default "auto") */
  overflow?: "hidden" | "auto";
  /** false = whole overlay non-interactive; default = native control-only capture */
  interactive?: boolean;
  destroy?: () => void;
}

export function createRgui(_canvas: HTMLCanvasElement, _options?: RguiOptions): Rgui {
  throw new Error("@snomiao/rgui source is not available in this build");
}

export default createRgui;

// Grid helpers (real impls come from rgui source at runtime; these satisfy tsgo).
export interface GridLevel {
  step: number;
  px: number;
  alpha: number;
}
export function snap(_v: number, _step: number): number {
  throw new Error("@snomiao/rgui source is not available in this build");
}
export function gridLevels(_k: number, _minPx?: number, _radix?: number): GridLevel[] {
  throw new Error("@snomiao/rgui source is not available in this build");
}

export const FEDERATED_GRAPH_KIND = "rgui-federated-graph";
export const FEDERATED_GRAPH_SCHEMA = "org.rgui.graph.v1";
export const FEDERATED_DEMO_CHAIN_IDS = {
  plain: "otoji://browser/plaintext-node",
  codex: "ay://agent-yes/codex-agent",
  diff: "rgui://demo/text-diff-node",
  filter: "rgui://demo/filter-added-text",
  translate: "otoji://browser/browser-translator-en-ja",
  tts: "otoji://browser/in-browser-tts-node",
} as const;

export interface FederatedProducer {
  app: string;
  origin: string;
  deviceId?: string;
  peerId?: string;
  workspace?: string;
  label?: string;
}
export interface FederatedPort {
  id: string;
  label?: string;
  kind: SignalKind;
  signal?: Partial<SignalSpec>;
}
export interface FederatedNode {
  id: string;
  app: string;
  type: string;
  title: string;
  category?: NodeCategory | string;
  inputs?: FederatedPort[];
  outputs?: FederatedPort[];
  pos?: { x: number; y: number; z?: number };
  size?: { w: number; h?: number; scale?: number };
  owner?: string;
  status?: string;
  parent?: string;
  renderHints?: Record<string, unknown>;
  configPublic?: Record<string, unknown>;
  private?: boolean;
}
export interface FederatedEdge {
  id?: string;
  source: { node: string; port: string; type?: SignalKind };
  target: { node: string; port: string; type?: SignalKind };
  signal?: Partial<SignalSpec>;
  status?: "active" | "proposed" | "readonly" | "blocked" | (string & {});
  label?: string;
}
export interface FederatedGraphEnvelope {
  kind: typeof FEDERATED_GRAPH_KIND;
  schema: typeof FEDERATED_GRAPH_SCHEMA;
  producer: FederatedProducer;
  revision: string | number;
  ts: number;
  graph: {
    nodes: FederatedNode[];
    edges: FederatedEdge[];
  };
  capabilities?: {
    nodeTypes?: string[];
    portTypes?: SignalKind[];
    previewKinds?: string[];
  };
  view?: { x: number; y: number; k: number };
}
export interface FederationClampOptions {
  maxNodes?: number;
  maxEdges?: number;
  maxTextLength?: number;
  maxCoord?: number;
  maxSize?: number;
  minSize?: number;
}
export function federatedNodeId(_namespace: string, _localId: string): string {
  const ns = _namespace.trim().replace(/\/+$/, "");
  const id = encodeURIComponent(_localId.trim().replace(/^\/+/, ""));
  return `${ns}/${id}`;
}
export function clampFederatedGraph(_env: FederatedGraphEnvelope, _opts: FederationClampOptions = {}): FederatedGraphEnvelope {
  const maxNodes = _opts.maxNodes ?? 512;
  const maxEdges = _opts.maxEdges ?? 2048;
  const maxText = _opts.maxTextLength ?? 160;
  const maxCoord = _opts.maxCoord ?? 1_000_000;
  const maxSize = _opts.maxSize ?? 8192;
  const minSize = _opts.minSize ?? 64;
  const clampText = (v: unknown) => String(v ?? "").slice(0, maxText);
  const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.max(min, Math.min(max, n));
  };
  const ids = new Set<string>();
  const nodes = _env.graph.nodes.slice(0, maxNodes).flatMap((n) => {
    const id = clampText(n.id);
    if (!id || ids.has(id)) return [];
    ids.add(id);
    return [{
      ...n,
      id,
      title: n.private ? "Private node" : clampText(n.title || n.type || "node"),
      app: clampText(n.app || "unknown"),
      type: clampText(n.type || "node"),
      pos: { x: clampNum(n.pos?.x, -maxCoord, maxCoord, 0), y: clampNum(n.pos?.y, -maxCoord, maxCoord, 0), z: n.pos?.z },
      size: n.size ? { ...n.size, w: clampNum(n.size.w, minSize, maxSize, 256), h: n.size.h == null ? undefined : clampNum(n.size.h, minSize, maxSize, 128) } : undefined,
      configPublic: n.private ? undefined : n.configPublic,
    }];
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = _env.graph.edges.slice(0, maxEdges).filter((e) => nodeIds.has(e.source.node) && nodeIds.has(e.target.node));
  return { ..._env, graph: { nodes, edges } };
}
export function federatedGraphToRgui(_env: FederatedGraphEnvelope, _opts?: { container?: boolean; offset?: { x: number; y: number } }): Graph {
  const env = clampFederatedGraph(_env);
  const offset = _opts?.offset ?? { x: 0, y: 0 };
  return {
    nodes: env.graph.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      category: (n.category ?? "model") as RgNodeCategory,
      x: (n.pos?.x ?? 0) + offset.x,
      y: (n.pos?.y ?? 0) + offset.y,
      w: n.size?.w ?? 256,
      h: n.size?.h,
      scale: n.size?.scale,
      inputs: (n.inputs ?? []).map((p) => ({ id: p.id, label: p.label ?? p.id, kind: p.kind })),
      outputs: (n.outputs ?? []).map((p) => ({ id: p.id, label: p.label ?? p.id, kind: p.kind })),
      fields: [["app", n.app], ["type", n.type], ...(n.owner ? [["owner", n.owner] as [string, string]] : [])],
      remote: true,
    })),
    edges: env.graph.edges.map((e) => ({
      from: { node: e.source.node, port: e.source.port },
      to: { node: e.target.node, port: e.target.port },
      dashed: e.status === "readonly" || e.status === "proposed",
      label: e.label ?? e.status,
    })),
  };
}
export function federatedDemoChain(_now?: number): FederatedGraphEnvelope {
  const ns = "rgui://demo";
  const plain = federatedNodeId("otoji://browser", "plaintext-node");
  const codex = federatedNodeId("ay://agent-yes", "codex-agent");
  const diff = federatedNodeId(ns, "text-diff-node");
  const filter = federatedNodeId(ns, "filter-added-text");
  const translate = federatedNodeId("otoji://browser", "browser-translator-en-ja");
  const tts = federatedNodeId("otoji://browser", "in-browser-tts-node");
  const textIn: FederatedPort = { id: "text-in", label: "text", kind: "text" };
  const textOut: FederatedPort = { id: "text-out", label: "text", kind: "text" };
  const node = (id: string, app: string, title: string, x: number, inputs = [textIn], outputs = [textOut]): FederatedNode =>
    ({ id, app, type: title, title, pos: { x, y: 0 }, size: { w: 256, h: 128 }, inputs, outputs });
  const edge = (a: string, b: string): FederatedEdge => ({ source: { node: a, port: "text-out", type: "text" }, target: { node: b, port: "text-in", type: "text" }, status: "readonly" });
  return {
    kind: FEDERATED_GRAPH_KIND,
    schema: FEDERATED_GRAPH_SCHEMA,
    producer: { app: "rgui", origin: "demo", label: "Cross-system demo chain" },
    revision: "demo-chain-v0",
    ts: _now ?? Date.now(),
    graph: {
      nodes: [
        node(plain, "otoji", "Plaintext", -640, [], [textOut]),
        node(codex, "agent-yes", "Codex Agent", -320),
        node(diff, "rgui", "Text Diff", 0),
        node(filter, "rgui", "Filter: added text", 320),
        node(translate, "otoji", "Browser Translator en to ja", 640),
        node(tts, "otoji", "In-browser TTS", 960, [textIn], []),
      ],
      edges: [edge(plain, codex), edge(codex, diff), edge(diff, filter), edge(filter, translate), edge(translate, tts)],
    },
    capabilities: { nodeTypes: [], portTypes: ["text"], previewKinds: ["text"] },
  };
}
export function federatedDemoChainGraph(): Graph {
  return federatedGraphToRgui(federatedDemoChain());
}
export function federatedEmbedUrl(n: Pick<FederatedNode, "renderHints" | "private">): string | undefined {
  const raw = (n.renderHints?.embed as { url?: unknown } | undefined)?.url;
  if (typeof raw !== "string" || n.private) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function isFederatedGraphEnvelope(_value: unknown): _value is FederatedGraphEnvelope {
  return false;
}

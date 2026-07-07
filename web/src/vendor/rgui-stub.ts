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
  ladder: number[];
  [k: string]: unknown;
}

export interface RguiOptions {
  graph?: Graph;
  rule?: Partial<RgRule>;
  debug?: HTMLElement | null;
  layers?: unknown[];
  view?: ViewTransform;
  onFrame?: (view: ViewTransform, rg: unknown) => void;
  // v0.2.0 interaction callbacks (host-app state sync)
  onNodeMove?: (nodeId: string, pos: { x: number; y: number }) => void;
  onNodeMoveEnd?: (nodeId: string, pos: { x: number; y: number }) => void;
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
  // v0.3.0 canvas-native palettes
  panels?: Panel[];
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
  /** v0.3.0: replace the canvas-native palettes */
  setPanels(panels: Panel[]): void;
  invalidate(): void;
  destroy(): void;
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
export function gridLevels(_k: number, _minPx?: number, _ladder?: number[]): GridLevel[] {
  throw new Error("@snomiao/rgui source is not available in this build");
}

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

export interface RgRule {
  collapsePx: number;
  minGridPx: number;
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
}

export interface Rgui {
  canvas: HTMLCanvasElement;
  readonly view: ViewTransform;
  readonly rule: RgRule;
  graph: Graph;
  setGraph(g: Graph): void;
  invalidate(): void;
  destroy(): void;
}

export function createRgui(_canvas: HTMLCanvasElement, _options?: RguiOptions): Rgui {
  throw new Error("@snomiao/rgui source is not available in this build");
}

export default createRgui;

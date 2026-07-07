import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VoiceGraph } from "../graph/model";
import { voiceGraphToRgui, type RguiMeta } from "../graph/rgui-adapter";
import type { LiveStore } from "../graph/live-store";
import { snap, gridLevels, type PortRef, type Panel } from "@snomiao/rgui";

// Primary graph renderer: draws + edits the voice graph with @snomiao/rgui
// (readable-grid, semantic-zoom LOD, Canvas 2D). rgui owns pan/zoom, grid-snap
// drag and the ghost-wire; otoji owns the authoritative graph and re-maps it in.
// All mutations flow back through the callbacks so they sync to the room.

export interface RguiHandlers {
  /** a node finished dragging → persist + broadcast its new world position */
  onNodeMoveEnd?: (nodeId: string, pos: { x: number; y: number }) => void;
  /** gate a port→port drag (otoji type-check) */
  isValidConnection?: (from: PortRef, to: PortRef) => boolean;
  /** a valid port→port drag completed → create the edge */
  onConnect?: (from: PortRef, to: PortRef) => void;
  /** left-click a node (screen = canvas-relative px) */
  onNodeClick?: (nodeId: string, screen: { x: number; y: number }) => void;
  /** right-click a node */
  onNodeContextMenu?: (nodeId: string, screen: { x: number; y: number }) => void;
  /** something dropped on the canvas at a world position (palette / file / template) */
  onCanvasDrop?: (world: { x: number; y: number }, dataTransfer: DataTransfer) => void;
  /** selection changed via the canvas (click / shift-drag box) */
  onSelectionChange?: (nodeIds: string[]) => void;
  /** left-click on an edge (rgui edge = {from,to}) */
  onEdgeClick?: (edge: RgEdgeRef, screen: { x: number; y: number }) => void;
  /** right-click on an edge */
  onEdgeContextMenu?: (edge: RgEdgeRef, screen: { x: number; y: number }) => void;
  /** a port drag ended on empty canvas → open the create-and-wire omnibox */
  onConnectEnd?: (from: PortRef, at: { screen: { x: number; y: number }; world: { x: number; y: number } }) => void;
}

/** rgui edge endpoints (subset of rgui's Edge) */
export type RgEdgeRef = { from: { node: string; port: string }; to: { node: string; port: string } };

/** imperative viewport controls exposed to the host */
export interface RguiApi {
  fitView: (paddingPx?: number) => void;
  zoomBy: (factor: number) => void;
  /** snap a world position to the current readable grid (for tidy drops) */
  snapWorld: (pos: { x: number; y: number }) => { x: number; y: number };
}

export function RguiGraphView({
  graph,
  deviceName,
  handlers,
  selection,
  edgeMeta,
  nodeBody,
  live,
  panels,
  renderNodeOverlay,
  apiRef,
}: {
  graph: VoiceGraph;
  deviceName?: (deviceId: string | null) => string;
  handlers?: RguiHandlers;
  /** host-owned selection to reflect into the canvas (e.g. select-all) */
  selection?: string[];
  /** per-edge visual overrides (selection highlight, running animation, labels) */
  edgeMeta?: RguiMeta["edgeMeta"];
  /** per-node live-body draw hook (waveform / text / image / busy) */
  nodeBody?: RguiMeta["nodeBody"];
  /** live store — subscribe to redraw the canvas when node previews update */
  live?: LiveStore;
  /** canvas-native palettes (node palette, templates) */
  panels?: Panel[];
  /** render the config controls overlay for a node — rgui glues one per node to
   *  its screen rect and auto-hides it when the node isn't readable-sized */
  renderNodeOverlay?: (nodeId: string) => React.ReactNode;
  /** populated with imperative viewport controls (fitView / zoom) */
  apiRef?: React.MutableRefObject<RguiApi | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Awaited<ReturnType<typeof createViewer>> | null>(null);
  const [error, setError] = useState<string>("");

  // One detached host div per node for its config overlay (rgui positions each
  // and auto-hides the ones whose node isn't readable-sized). React fills them
  // via portals; hosts persist across re-maps so their controls keep focus.
  const hostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const hostFor = (id: string) => {
    let h = hostsRef.current.get(id);
    if (!h) {
      h = document.createElement("div");
      hostsRef.current.set(id, h);
    }
    return h;
  };

  const rgGraph = useMemo(() => {
    const g = voiceGraphToRgui(graph, { deviceName, edgeMeta, nodeBody });
    if (renderNodeOverlay) {
      // interactive:false → rgui leaves the host pointer-events:none so drags on
      // the card pass through to the canvas (node stays draggable); only the form
      // controls opt back in to pointer-events:auto (see the .rgui-node-cfg CSS).
      // offset y past the rgui-drawn header so the node title stays visible; the
      // controls sit in the body region.
      for (const n of g.nodes) (n as any).overlay = { el: hostFor(n.id), anchor: "over", offset: { x: 0, y: 28 }, interactive: false };
    }
    return g;
  }, [graph, deviceName, edgeMeta, nodeBody, renderNodeOverlay]);
  const nodeIdsKey = useMemo(() => rgGraph.nodes.map((n) => n.id).join(","), [rgGraph]);

  // Drop hosts for removed nodes (rgui detaches their overlays when the node
  // leaves the graph); keeps the map from growing unbounded.
  useEffect(() => {
    const live = new Set(nodeIdsKey ? nodeIdsKey.split(",") : []);
    for (const id of [...hostsRef.current.keys()]) if (!live.has(id)) hostsRef.current.delete(id);
  }, [nodeIdsKey]);
  const rgGraphRef = useRef(rgGraph);
  rgGraphRef.current = rgGraph;

  // Latest handlers behind a ref so the viewer (created once) never goes stale.
  const hRef = useRef<RguiHandlers | undefined>(handlers);
  hRef.current = handlers;
  const panelsRef = useRef<Panel[] | undefined>(panels);
  panelsRef.current = panels;

  // Create the viewer once the canvas is mounted; destroy on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    createViewer(canvas, rgGraphRef, hRef, panelsRef)
      .then((viewer) => {
        if (disposed) viewer?.destroy();
        else {
          viewerRef.current = viewer;
          if (apiRef) apiRef.current = makeApi(viewer, canvas);
          if (import.meta.env.DEV) (window as any).__rgui = viewer; // e2e / debug handle
        }
      })
      .catch((e) => !disposed && setError(e?.message ?? String(e)));
    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (apiRef) apiRef.current = null;
    };
  }, []);

  // Push graph updates into the live viewer.
  useEffect(() => {
    viewerRef.current?.setGraph(rgGraph as any);
  }, [rgGraph]);

  // Push palette updates (templates list changes, etc.) into the viewer.
  useEffect(() => {
    if (panels) viewerRef.current?.setPanels(panels as any);
  }, [panels]);


  // Redraw the canvas when any node's live preview updates (waveform/text/image).
  useEffect(() => {
    if (!live) return;
    const ids = nodeIdsKey ? nodeIdsKey.split(",") : [];
    const unsubs = ids.map((id) => live.subscribe(id, () => viewerRef.current?.invalidate()));
    return () => unsubs.forEach((u) => u());
  }, [live, nodeIdsKey]);

  // Reflect host-owned selection into the canvas (e.g. Ctrl/Cmd+A), skipping when
  // it already matches to avoid a setSelection→onSelectionChange feedback loop.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !selection) return;
    const cur = v.selection;
    if (cur.length === selection.length && cur.every((id, i) => id === selection[i])) return;
    v.setSelection(selection);
  }, [selection]);

  // Native drop (palette node / template / file) → world coords → host handler.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const v = viewerRef.current;
    if (!v) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const view = v.view;
    const world = { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
    hRef.current?.onCanvasDrop?.(world, e.dataTransfer);
  };

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {error && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 13,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          rgui renderer unavailable: {error}
        </div>
      )}
      {/* Per-node config overlays: React renders into the detached hosts; rgui
          re-parents + positions each host at its node and hides non-readable ones. */}
      {renderNodeOverlay &&
        rgGraph.nodes.map((n) => (
          <React.Fragment key={n.id}>{createPortal(renderNodeOverlay(n.id), hostFor(n.id))}</React.Fragment>
        ))}
    </div>
  );
}

// Dynamically import rgui (aliased to live source / submodule / stub) and wire
// the interaction callbacks through the ref so they always call the latest host
// handlers. Kept out of the component body so the import type stays local.
async function createViewer(
  canvas: HTMLCanvasElement,
  graphRef: React.MutableRefObject<ReturnType<typeof voiceGraphToRgui>>,
  hRef: React.MutableRefObject<RguiHandlers | undefined>,
  panelsRef: React.MutableRefObject<Panel[] | undefined>,
) {
  const { default: createRgui } = await import("@snomiao/rgui");
  return createRgui(canvas, {
    graph: graphRef.current as any,
    rule: { collapsePx: 56 },
    panels: panelsRef.current as any,
    onNodeMoveEnd: (id, pos) => hRef.current?.onNodeMoveEnd?.(id, pos),
    isValidConnection: (from, to) => hRef.current?.isValidConnection?.(from, to) ?? true,
    onConnect: (from, to) => hRef.current?.onConnect?.(from, to),
    onNodeClick: (id, screen) => hRef.current?.onNodeClick?.(id, screen),
    onNodeContextMenu: (id, screen) => hRef.current?.onNodeContextMenu?.(id, screen),
    onSelectionChange: (ids) => hRef.current?.onSelectionChange?.(ids),
    onEdgeClick: (edge, screen) => hRef.current?.onEdgeClick?.(edge, screen),
    onEdgeContextMenu: (edge, screen) => hRef.current?.onEdgeContextMenu?.(edge, screen),
    onConnectEnd: (from, at) => hRef.current?.onConnectEnd?.(from, at),
  });
}

// Imperative viewport helpers built on the viewer's setView/fitView.
function makeApi(viewer: Awaited<ReturnType<typeof createViewer>>, canvas: HTMLCanvasElement): RguiApi {
  return {
    fitView: (paddingPx = 48) => viewer.fitView(paddingPx),
    zoomBy: (factor) => {
      const v = viewer.view;
      const cx = canvas.clientWidth / 2;
      const cy = canvas.clientHeight / 2;
      const k = v.k * factor;
      // keep the world point under the viewport center fixed
      viewer.setView({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
    },
    snapWorld: (pos) => {
      // Snap to the minor readable-grid step (same step rgui snaps node drags to),
      // so dropped nodes/workflows land aligned to the visible grid.
      const r = viewer.rule;
      const step = gridLevels(viewer.view.k, r.minGridPx, r.ladder)[1]!.step;
      return { x: snap(pos.x, step), y: snap(pos.y, step) };
    },
  };
}

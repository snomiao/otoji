import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VoiceGraph } from "../graph/model";
import { voiceGraphToRgui, type RguiMeta } from "../graph/rgui-adapter";
import type { LiveStore } from "../graph/live-store";
import { snap, gridLevels, type PortRef, type Panel, type SummarizeFn } from "@snomiao/rgui";

// Primary graph renderer: draws + edits the voice graph with @snomiao/rgui
// (readable-grid, semantic-zoom LOD, Canvas 2D). rgui owns pan/zoom, grid-snap
// drag and the ghost-wire; otoji owns the authoritative graph and re-maps it in.
// All mutations flow back through the callbacks so they sync to the room.

export interface RguiHandlers {
  /** a node finished dragging → persist + broadcast its new world position */
  onNodeMoveEnd?: (nodeId: string, pos: { x: number; y: number }) => void;
  /** a corner-grip resize/rescale ended → persist the grid-snapped box.
   *  `scale` is the content scale (moves only in the shift-drag rescale mode) */
  onNodeResizeEnd?: (nodeId: string, size: { w: number; h: number; scale: number }) => void;
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
  /** snap ALL nodes to the main grid (tidy a freshly generated/expanded graph) */
  snapGraph: (opts?: { silent?: boolean }) => void;
  /** current graph-plane 3-D orientation (radians) */
  rotation3: () => { yaw: number; pitch: number; roll: number };
  /** tilt the graph plane in 3-D (nodes stay upright); no arg / zeros = flat */
  setRotation3: (target: { yaw?: number; pitch?: number; roll?: number }, opts?: { animate?: boolean }) => void;
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
  onPanelMove,
  renderNodeOverlay,
  summarize,
  hud,
  hudStatus,
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
  /** a panel was header-dragged to a new screen anchor (fires on release) —
   *  persist it and pass it back via Panel.anchor to restore across runs */
  onPanelMove?: (panelId: string, anchor: { x: number; y: number }) => void;
  /** render the config controls overlay for a node — rgui glues one per node to
   *  its screen rect and auto-hides it when the node isn't readable-sized */
  renderNodeOverlay?: (nodeId: string) => React.ReactNode;
  /** compact summary rule for small / merged nodes (rgui renders it) */
  summarize?: SummarizeFn;
  /** screen-space wordmark + status line, drawn natively on the canvas (top-left) */
  hud?: { title: string; subtitle: string };
  /** host draw hook for a screen-space status HUD (mic level / counts / run state);
   *  handed a dpr-normalized ctx (CSS px) + the canvas CSS size, drawn each frame */
  hudStatus?: (ctx: CanvasRenderingContext2D, size: { width: number; height: number }) => void;
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
      // scale:"zoom" — controls scale with view.k like part of the node (laid out
      // for k=1) and hide below minScale when zoomed out too small.
      // clip:"node" keeps the (often taller) config card inside the node's screen
      // rect; overflow:"auto" gives it a scrollbar instead of spilling past the node.
      // interactive is left on (default): rgui natively makes the card background
      // click-through (dragging it drags the node) and only lets real form controls
      // capture — so no .rgui-node-cfg CSS hack is needed. offset past the rgui
      // header keeps the title visible.
      for (const n of g.nodes)
        n.overlay = {
          el: hostFor(n.id),
          anchor: "over",
          offset: { x: 0, y: 28 },
          // textarea: Monaco mis-maps mouse→cursor under a CSS scale transform,
          // so its overlay stays screen-constant ("fixed") instead of zooming.
          scale: graph.nodes[n.id]?.type === "textarea" ? "fixed" : "zoom",
          minScale: 0.5,
          clip: "node",
          overflow: "auto",
        };
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
  const panelMoveRef = useRef(onPanelMove);
  panelMoveRef.current = onPanelMove;
  const sumRef = useRef<SummarizeFn | undefined>(summarize);
  sumRef.current = summarize;
  const hudRef = useRef<{ title: string; subtitle: string } | undefined>(hud);
  hudRef.current = hud;
  const hudStatusRef = useRef(hudStatus);
  hudStatusRef.current = hudStatus;

  // setGraph mid-gesture orphans rgui's drag state (it captures node OBJECT
  // references: the on-screen drag freezes and the node can end up clamped
  // against its own replacement). Remote re-maps that land while the pointer
  // is down are parked here and applied on release; local mutations only
  // commit at gesture end, so they are never parked.
  const draggingRef = useRef(false);
  const pendingGraphRef = useRef<ReturnType<typeof voiceGraphToRgui> | null>(null);

  // Create the viewer once the canvas is mounted; destroy on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    createViewer(canvas, rgGraphRef, hRef, panelsRef, panelMoveRef, sumRef, hudRef, hudStatusRef)
      .then((viewer) => {
        if (disposed) viewer?.destroy();
        else {
          viewerRef.current = viewer;
          if (apiRef) apiRef.current = makeApi(viewer, canvas);
          if (import.meta.env.DEV) (window as any).__rgui = viewer; // e2e / debug handle
        }
      })
      .catch((e) => !disposed && setError(e?.message ?? String(e)));
    // rgui pointer-captures the canvas on pointerdown, so up/cancel always
    // retarget back here even when released off-canvas. These run AFTER rgui's
    // own handlers (attach order), i.e. the drag is already finalized.
    const gestureStart = () => {
      draggingRef.current = true;
    };
    const gestureEnd = () => {
      draggingRef.current = false;
      const g = pendingGraphRef.current;
      if (g) {
        pendingGraphRef.current = null;
        viewerRef.current?.setGraph(g as any);
      }
    };
    canvas.addEventListener("pointerdown", gestureStart);
    canvas.addEventListener("pointerup", gestureEnd);
    canvas.addEventListener("pointercancel", gestureEnd);
    return () => {
      disposed = true;
      canvas.removeEventListener("pointerdown", gestureStart);
      canvas.removeEventListener("pointerup", gestureEnd);
      canvas.removeEventListener("pointercancel", gestureEnd);
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (apiRef) apiRef.current = null;
    };
  }, []);

  // Push graph updates into the live viewer (deferred while a gesture is live).
  useEffect(() => {
    if (draggingRef.current) {
      pendingGraphRef.current = rgGraph;
      return;
    }
    pendingGraphRef.current = null;
    viewerRef.current?.setGraph(rgGraph as any);
  }, [rgGraph]);

  // Push palette updates (templates list changes, etc.) into the viewer.
  useEffect(() => {
    if (panels) viewerRef.current?.setPanels(panels as any);
  }, [panels]);

  // Repaint when the HUD wordmark/status text or the status-HUD hook changes
  // (onFrame reads the refs; hudStatus identity changes when run-state flips).
  useEffect(() => {
    viewerRef.current?.invalidate();
  }, [hud?.title, hud?.subtitle, hudStatus]);


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
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none", overscrollBehavior: "none" }} />
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
  panelMoveRef: React.MutableRefObject<((panelId: string, anchor: { x: number; y: number }) => void) | undefined>,
  sumRef: React.MutableRefObject<SummarizeFn | undefined>,
  hudRef: React.MutableRefObject<{ title: string; subtitle: string } | undefined>,
  hudStatusRef: React.MutableRefObject<((ctx: CanvasRenderingContext2D, size: { width: number; height: number }) => void) | undefined>,
) {
  const { default: createRgui } = await import("@snomiao/rgui");
  return createRgui(canvas, {
    graph: graphRef.current as any,
    rule: { collapsePx: 56 },
    // Force Canvas 2D — the "auto" WebGPU path errors ("no compatible GPU") and
    // lags on some machines. The 2D renderer is the stable baseline.
    renderer: "canvas2d",
    panels: panelsRef.current as any,
    onPanelMove: (panel: Panel, anchor: { x: number; y: number }) => panelMoveRef.current?.(panel.id, anchor),
    summarize: (nodes: any, info: any) => sumRef.current?.(nodes, info) ?? null,
    onNodeMoveEnd: (id, pos) => hRef.current?.onNodeMoveEnd?.(id, pos),
    onNodeResizeEnd: (id: string, size: { w: number; h: number; scale: number }) =>
      hRef.current?.onNodeResizeEnd?.(id, size),
    isValidConnection: (from, to) => hRef.current?.isValidConnection?.(from, to) ?? true,
    onConnect: (from, to) => hRef.current?.onConnect?.(from, to),
    onNodeClick: (id, screen) => hRef.current?.onNodeClick?.(id, screen),
    onNodeContextMenu: (id, screen) => hRef.current?.onNodeContextMenu?.(id, screen),
    onSelectionChange: (ids) => hRef.current?.onSelectionChange?.(ids),
    onEdgeClick: (edge, screen) => hRef.current?.onEdgeClick?.(edge, screen),
    onEdgeContextMenu: (edge, screen) => hRef.current?.onEdgeContextMenu?.(edge, screen),
    onConnectEnd: (from, at) => hRef.current?.onConnectEnd?.(from, at),
    // Screen-space chrome: rgui composites the title HUD (and the host status
    // HUD) last, on top of the graph, every frame (canvas keeps the last frame
    // while idle).
    onFrame: () => {
      drawHud(canvas, hudRef.current);
      const hs = hudStatusRef.current;
      if (hs) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          hs(ctx, { width: canvas.clientWidth, height: canvas.clientHeight });
          ctx.restore();
        }
      }
    },
  });
}

// Draw the "otoji" wordmark + status line directly on the rgui canvas, top-left,
// in screen space (unaffected by pan/zoom/tilt). rgui's own renderer left the
// ctx at dpr scale after compositing; we reset it explicitly and paint on top.
function drawHud(canvas: HTMLCanvasElement, hud?: { title: string; subtitle: string }) {
  if (!hud?.title) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  const x = 16;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "alphabetic";
  // wordmark — rgui's purple→gold crossover, so it reads as part of the canvas
  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  const w = ctx.measureText(hud.title).width;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#9b34bf");
  grad.addColorStop(1, "#f3820d");
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = grad;
  ctx.fillText(hud.title, x, 30);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (hud.subtitle) {
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#8a94a6";
    ctx.fillText(hud.subtitle, x, 46);
  }
  ctx.restore();
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
    rotation3: () => viewer.rotation3,
    setRotation3: (target, opts) => viewer.setRotation3(target, opts),
    snapGraph: (opts) => viewer.snapGraph(opts),
  };
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { VoiceGraph } from "../graph/model";
import { voiceGraphToRgui } from "../graph/rgui-adapter";
import type { PortRef } from "@snomiao/rgui";

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
}

export function RguiGraphView({
  graph,
  deviceName,
  handlers,
  selection,
}: {
  graph: VoiceGraph;
  deviceName?: (deviceId: string | null) => string;
  handlers?: RguiHandlers;
  /** host-owned selection to reflect into the canvas (e.g. select-all) */
  selection?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<Awaited<ReturnType<typeof createViewer>> | null>(null);
  const [error, setError] = useState<string>("");

  const rgGraph = useMemo(() => voiceGraphToRgui(graph, { deviceName }), [graph, deviceName]);
  const rgGraphRef = useRef(rgGraph);
  rgGraphRef.current = rgGraph;

  // Latest handlers behind a ref so the viewer (created once) never goes stale.
  const hRef = useRef<RguiHandlers | undefined>(handlers);
  hRef.current = handlers;

  // Create the viewer once the canvas is mounted; destroy on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    createViewer(canvas, rgGraphRef, hRef)
      .then((viewer) => {
        if (disposed) viewer?.destroy();
        else {
          viewerRef.current = viewer;
          if (import.meta.env.DEV) (window as any).__rgui = viewer; // e2e / debug handle
        }
      })
      .catch((e) => !disposed && setError(e?.message ?? String(e)));
    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Push graph updates into the live viewer.
  useEffect(() => {
    viewerRef.current?.setGraph(rgGraph as any);
  }, [rgGraph]);

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
          <br />
          <span style={{ opacity: 0.7 }}>Add ?renderer=rf to use the React Flow renderer.</span>
        </div>
      )}
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
) {
  const { default: createRgui } = await import("@snomiao/rgui");
  return createRgui(canvas, {
    graph: graphRef.current as any,
    rule: { collapsePx: 56 },
    onNodeMoveEnd: (id, pos) => hRef.current?.onNodeMoveEnd?.(id, pos),
    isValidConnection: (from, to) => hRef.current?.isValidConnection?.(from, to) ?? true,
    onConnect: (from, to) => hRef.current?.onConnect?.(from, to),
    onNodeClick: (id, screen) => hRef.current?.onNodeClick?.(id, screen),
    onNodeContextMenu: (id, screen) => hRef.current?.onNodeContextMenu?.(id, screen),
    onSelectionChange: (ids) => hRef.current?.onSelectionChange?.(ids),
  });
}

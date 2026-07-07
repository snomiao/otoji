import React, { useEffect, useMemo, useRef, useState } from "react";
import type { VoiceGraph } from "../graph/model";
import { voiceGraphToRgui } from "../graph/rgui-adapter";

// Experimental opt-in renderer: draws the voice graph with @snomiao/rgui
// (readable-grid, semantic-zoom LOD, Canvas 2D) instead of React Flow. Enabled
// with `?renderer=rgui`. Read-only for now — editing stays in the React Flow
// renderer; this is a parallel view to bring rgui to feature parity.
//
// The rgui lib is loaded via dynamic import so a build WITHOUT it resolvable
// (CI / production) still succeeds: the vite alias points `@snomiao/rgui` at an
// in-repo stub that throws, and we show a friendly notice instead of crashing.

type RguiModule = typeof import("@snomiao/rgui");
type RguiViewer = ReturnType<RguiModule["default"]>;

export function RguiGraphView({
  graph,
  deviceName,
}: {
  graph: VoiceGraph;
  deviceName?: (deviceId: string | null) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<RguiViewer | null>(null);
  const [error, setError] = useState<string>("");

  const rgGraph = useMemo(() => voiceGraphToRgui(graph, { deviceName }), [graph, deviceName]);
  // Keep the latest mapped graph for the async create below without re-running it.
  const rgGraphRef = useRef(rgGraph);
  rgGraphRef.current = rgGraph;

  // Create the viewer once the canvas is mounted; destroy on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    import("@snomiao/rgui")
      .then((mod) => {
        if (disposed) return;
        viewerRef.current = mod.default(canvas, {
          graph: rgGraphRef.current as any,
          rule: { collapsePx: 56 },
        });
      })
      .catch((e) => {
        if (!disposed) setError(e?.message ?? String(e));
      });
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

  return (
    <div style={{ position: "absolute", inset: 0 }}>
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
          <span style={{ opacity: 0.7 }}>Remove ?renderer=rgui to use the default renderer.</span>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef } from "react";
import type { LiveStore } from "../graph/live-store";

// Rolling mic level chart read from the live store via rAF (no React re-render
// per audio window). Speech-active windows are highlighted.
export function NodeMicPreview({
  live,
  nodeId,
  width = 150,
  height = 30,
}: {
  live: LiveStore;
  nodeId: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const barW = 2;
    const gap = 1;
    const n = Math.floor(width / (barW + gap));
    let raf = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const levels = live.getLevels(nodeId).slice(-n);
      const mid = height / 2;
      for (let i = 0; i < levels.length; i++) {
        const { rms, active } = levels[i];
        const h = Math.max(1, Math.min(1, rms * 6) * (mid - 1));
        const x = i * (barW + gap);
        ctx.fillStyle = active ? "#2f855a" : "#cbd5e0";
        ctx.fillRect(x, mid - h, barW, h * 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, nodeId, width, height]);

  return <canvas ref={ref} style={{ width, height, display: "block", background: "#f7fafc", borderRadius: 4 }} />;
}

import { useEffect, useRef } from "react";
import type { LiveStore } from "../graph/live-store";

/**
 * Thumbnail of a node's latest camera/OCR frame. Reads the live ImageBitmap via
 * requestAnimationFrame (no React re-render per frame), drawn letterboxed.
 */
export function NodeImagePreview({
  live,
  nodeId,
  width = 150,
  height = 84,
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
    let raf = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#1a202c";
      ctx.fillRect(0, 0, width, height);
      const bmp = live.getImage(nodeId);
      if (bmp && bmp.width) {
        // letterbox: contain the frame within the thumbnail
        const scale = Math.min(width / bmp.width, height / bmp.height);
        const w = bmp.width * scale;
        const h = bmp.height * scale;
        try {
          ctx.drawImage(bmp, (width - w) / 2, (height - h) / 2, w, h);
        } catch {
          /* bitmap was closed between get and draw — skip this frame */
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, nodeId, width, height]);
  return <canvas ref={ref} style={{ width, height, display: "block", background: "#1a202c", borderRadius: 4 }} />;
}

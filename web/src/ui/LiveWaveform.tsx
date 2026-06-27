import React, { useEffect, useRef } from "react";
import type { SttLevel } from "../providers/types";

interface LiveWaveformProps {
  /** Ring buffer of recent per-window levels, newest pushed to the end. */
  levelsRef: React.MutableRefObject<SttLevel[]>;
  running: boolean;
  width?: number;
  height?: number;
}

/**
 * Scrolling input-level chart. Bars are drawn from a mutable ref via rAF, so
 * the ~33Hz level stream never triggers React re-renders. Speech-active
 * windows (VAD) are highlighted.
 */
export function LiveWaveform({ levelsRef, running, width = 480, height = 64 }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const barW = 3;
    const gap = 1;
    const nBars = Math.floor(width / (barW + gap));

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // baseline
      ctx.strokeStyle = "#e2e4e9";
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const levels = levelsRef.current;
      const slice = levels.slice(-nBars);
      const mid = height / 2;
      for (let i = 0; i < slice.length; i++) {
        const { rms, active } = slice[i];
        // amplify quiet speech; clamp to canvas
        const amp = Math.min(1, rms * 6);
        const h = Math.max(1, amp * (mid - 2));
        const x = i * (barW + gap);
        ctx.fillStyle = active ? "#2b6cb0" : "#b6bcc6";
        ctx.fillRect(x, mid - h, barW, h * 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelsRef, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: "block",
        borderRadius: 6,
        background: running ? "#f7fafc" : "#f0f1f4",
        opacity: running ? 1 : 0.6,
      }}
    />
  );
}

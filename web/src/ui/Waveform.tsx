import React, { useEffect, useRef } from "react";
import type { Peak } from "../lib/peaks";

interface WaveformProps {
  peaks: Peak[];
  width?: number;
  height?: number;
  /** 0..1 playback position; the played part is highlighted. */
  progress?: number;
  color?: string;
  playedColor?: string;
  onSeek?: (fraction: number) => void;
}

/** Static waveform (min/max peaks) with an optional played-progress overlay. */
export function Waveform({
  peaks,
  width = 320,
  height = 48,
  progress = 0,
  color = "#c9ccd3",
  playedColor = "#2b6cb0",
  onSeek,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const playedX = progress * width;
    const n = peaks.length || 1;
    const bw = width / n;

    for (let i = 0; i < peaks.length; i++) {
      const { min, max } = peaks[i];
      const x = i * bw;
      const y1 = mid - max * mid;
      const y2 = mid - min * mid;
      ctx.strokeStyle = x <= playedX ? playedColor : color;
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, y1);
      ctx.lineTo(x + bw / 2, Math.max(y2, y1 + 1));
      ctx.stroke();
    }
  }, [peaks, width, height, progress, color, playedColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: onSeek ? "pointer" : "default", display: "block", borderRadius: 4 }}
      onClick={(e) => {
        if (!onSeek) return;
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
      }}
    />
  );
}

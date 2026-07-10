import React, { useEffect, useMemo } from "react";
import type { VideoClip } from "../lib/video-clips-db";

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VideoClipPlayer({ clip, index, onSpawn }: { clip: VideoClip; index: number; onSpawn?: (clip: VideoClip) => void }) {
  const url = useMemo(() => URL.createObjectURL(clip.blob), [clip.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const ext = clip.mimeType.includes("mp4") ? "mp4" : "webm";

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
      <video
        src={url}
        controls
        preload="metadata"
        style={{ display: "block", width: "100%", maxHeight: 160, borderRadius: 4, background: "#1c2025", objectFit: "contain" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11, color: "#718096" }}>
        <span style={{ flex: 1 }}>#{index + 1} · {(clip.durationMs / 1000).toFixed(1)}s</span>
        <button
          type="button"
          onClick={() => downloadBlob(clip.blob, `otoji-video-${index + 1}.${ext}`)}
          style={{ fontSize: 10, border: "1px solid #cbd5e0", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        >
          download
        </button>
        {onSpawn && (
          <button
            type="button"
            onClick={() => onSpawn(clip)}
            style={{ fontSize: 10, border: "1px solid #cbd5e0", borderRadius: 4, background: "#fff", cursor: "pointer" }}
          >
            spawn node
          </button>
        )}
      </div>
    </div>
  );
}

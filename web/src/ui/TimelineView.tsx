import React from "react";
import type { Recording } from "./RecordingPlayer";

// Temporal view: transcripts (with timestamps) and recordings on a time axis.
// `at` is capture epoch ms; duration from durationMs.
export function TimelineView({ recordings }: { recordings: Recording[] }) {
  if (recordings.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "#a0aec0" }}>
        No data yet — Run the graph and speak; transcripts and recordings appear here on a time axis.
      </div>
    );
  }

  const PPS = 60; // pixels per second
  const items = [...recordings].sort((a, b) => a.at - b.at);
  const t0 = items[0].at;
  const t1 = Math.max(...items.map((r) => r.at + r.durationMs));
  const spanS = Math.max(1, (t1 - t0) / 1000);
  const width = Math.max(480, spanS * PPS + 120);
  const xOf = (atMs: number) => ((atMs - t0) / 1000) * PPS;

  const ticks: number[] = [];
  for (let s = 0; s <= spanS + 1; s += Math.max(1, Math.round(spanS / 10))) ticks.push(s);

  const lane = (label: string, top: number) => (
    <div style={{ position: "absolute", left: 0, top, fontSize: 11, color: "#718096", width: 110 }}>{label}</div>
  );

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", fontFamily: "system-ui, sans-serif" }}>
      <h3 style={{ marginTop: 0 }}>Timeline ({items.length})</h3>
      <div style={{ position: "relative", width: width + 120, minHeight: 160 }}>
        {/* ruler */}
        <div style={{ position: "relative", marginLeft: 120, height: 18, borderBottom: "1px solid #e2e8f0" }}>
          {ticks.map((s) => (
            <div key={s} style={{ position: "absolute", left: s * PPS, fontSize: 10, color: "#a0aec0" }}>{s}s</div>
          ))}
        </div>

        {lane("recordings", 40)}
        <div style={{ position: "relative", marginLeft: 120, height: 36 }}>
          {items.map((r) => (
            <div
              key={r.id}
              title={`${(r.durationMs / 1000).toFixed(1)}s`}
              style={{
                position: "absolute",
                left: xOf(r.at),
                top: 6,
                width: Math.max(4, (r.durationMs / 1000) * PPS),
                height: 18,
                background: "#dd6b20",
                opacity: 0.7,
                borderRadius: 3,
              }}
            />
          ))}
        </div>

        {lane("transcripts", 96)}
        <div style={{ position: "relative", marginLeft: 120, height: 40 }}>
          {items.map((r) =>
            r.text ? (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  left: xOf(r.at),
                  top: 4,
                  maxWidth: 200,
                  fontSize: 12,
                  background: "#ebf4ff",
                  color: "#2b3a55",
                  border: "1px solid #bcd",
                  borderRadius: 4,
                  padding: "1px 5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={r.text}
              >
                {r.text}
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

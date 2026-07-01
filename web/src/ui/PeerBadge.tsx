import React from "react";

// A small pill showing a peer's connection type, derived from presence metadata:
//   browser → a web tab (WebRTC mesh peer)
//   lan     → an `otoji node` CLI reaching the relay over the local network
//   wan     → an `otoji node` CLI reaching the relay over the internet
// Visibility is toggled from the toolbar (see prefs.isPeerBadgeShown).
export type PeerConnKind = "browser" | "lan" | "wan";

/** Classify a peer from its self-reported `runtime`/`net` presence fields. */
export function peerConnKind(runtime?: string, net?: string): PeerConnKind {
  if (runtime === "node") return net === "lan" ? "lan" : "wan";
  return "browser";
}

const STYLE: Record<PeerConnKind, { bg: string; fg: string; title: string }> = {
  browser: { bg: "#edf2f7", fg: "#4a5568", title: "Browser peer (web tab)" },
  lan: { bg: "#f0fff4", fg: "#2f855a", title: "Node peer on the local network (LAN)" },
  wan: { bg: "#fffaf0", fg: "#c05621", title: "Node peer over the internet (WAN)" },
};

export function PeerBadge({ runtime, net }: { runtime?: string; net?: string }) {
  const kind = peerConnKind(runtime, net);
  const s = STYLE[kind];
  return (
    <span
      title={s.title}
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        lineHeight: 1.4,
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.fg}33`,
        borderRadius: 6,
        padding: "0 5px",
      }}
    >
      {kind}
    </span>
  );
}

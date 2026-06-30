import React, { useMemo, useState } from "react";
import { ReactFlow, Background, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { generateRoomCode, isRoomCode } from "../lib/roomcode";
import { getDeviceName, setDeviceName } from "../lib/device-id";

// Landing page: the whole canvas is a (decorative) voice graph, with a floating
// "hello" node to create or join a room. Joining navigates to /<roomcode>, which
// main.tsx routes to the real GraphEditor.

const GHOST = "0 1px 3px rgba(0,0,0,0.06)";
function ghostNode(id: string, label: string, x: number, color: string): Node {
  return {
    id,
    position: { x, y: 0 },
    data: { label },
    draggable: false,
    selectable: false,
    style: {
      border: `1px solid ${color}`,
      borderRadius: 8,
      background: "#fff",
      padding: "8px 12px",
      fontSize: 12,
      color: "#4a5568",
      opacity: 0.6,
      boxShadow: GHOST,
      width: 150,
    },
  };
}

const DEMO_NODES: Node[] = [
  ghostNode("mic", "🎙  Mic + VAD", 0, "#dd6b20"),
  ghostNode("stt", "📝  SenseVoice STT", 220, "#cbd5e0"),
  ghostNode("tr", "🌐  Translate", 440, "#2b6cb0"),
  ghostNode("spk", "🔊  Speaker", 660, "#dd6b20"),
];
const DEMO_EDGES: Edge[] = [
  { id: "a", source: "mic", target: "stt", animated: true, style: { stroke: "#dd6b20" } },
  { id: "b", source: "stt", target: "tr", animated: true, style: { stroke: "#2b6cb0" } },
  { id: "c", source: "tr", target: "spk", animated: true, style: { stroke: "#2b6cb0" } },
];

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
  backdropFilter: "blur(4px)",
};

export function Lobby() {
  const [room, setRoom] = useState(() => generateRoomCode());
  const [name, setName] = useState(() => getDeviceName());
  const valid = isRoomCode(room.trim());

  const go = () => {
    if (!valid) return;
    setDeviceName(name.trim() || "device");
    location.href = `/${room.trim()}`;
  };

  const nodes = useMemo(() => DEMO_NODES, []);

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      {/* decorative graph background */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={DEMO_EDGES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </div>

      {/* floating "hello" node */}
      <div
        style={{
          ...CARD,
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 340,
          maxWidth: "calc(100% - 32px)",
          padding: "20px 22px",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 13, color: "#a0aec0", marginBottom: 2 }}>👋 hello</div>
        <strong style={{ fontSize: 26, letterSpacing: "-0.02em" }}>otoji</strong>
        <p style={{ fontSize: 13, color: "#718096", margin: "4px 0 16px" }}>
          On-device voice as a graph. Create a room, then wire mic → STT → translate → speech across your devices.
        </p>

        <label style={{ display: "block", fontSize: 12, color: "#718096", marginBottom: 8 }}>
          room
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") go(); }}
              placeholder="room code"
              style={{ flex: 1, minWidth: 0, fontSize: 14, padding: "8px 10px", border: "1px solid #cbd5e0", borderRadius: 8, outline: "none" }}
            />
            <button onClick={() => setRoom(generateRoomCode())} title="random room" style={{ fontSize: 16, padding: "0 10px", border: "1px solid #cbd5e0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
              🎲
            </button>
          </div>
        </label>

        <label style={{ display: "block", fontSize: 12, color: "#718096", marginBottom: 16 }}>
          your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="your name"
            style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px", border: "1px solid #cbd5e0", borderRadius: 8, outline: "none", marginTop: 3 }}
          />
        </label>

        <button
          onClick={go}
          disabled={!valid}
          style={{
            width: "100%",
            fontSize: 15,
            fontWeight: 700,
            padding: "10px",
            border: "none",
            borderRadius: 8,
            background: valid ? "#2b6cb0" : "#cbd5e0",
            color: "#fff",
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          Create / Join room →
        </button>
        {!valid && <div style={{ fontSize: 11, color: "#c05621", marginTop: 6 }}>room needs 3+ words/parts, e.g. blue-otter-7x2k</div>}

        <div style={{ marginTop: 14, fontSize: 12, color: "#a0aec0", textAlign: "center" }}>
          <a href="/?simple" style={{ color: "#718096" }}>or simple transcription →</a>
        </div>
      </div>
    </div>
  );
}

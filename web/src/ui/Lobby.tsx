import React, { useState } from "react";
import { generateRoomCode } from "../lib/roomcode";
import { getDeviceName, setDeviceName } from "../lib/device-id";
import { JoinGate } from "./JoinGate";

// Landing page ("/"): the shared JoinGate over a decorative voice graph. Joining
// navigates to /<roomcode>, which main.tsx routes to the real GraphEditor (which
// then auto-joins, so there's no second "Join" step).

export function Lobby() {
  const [room, setRoom] = useState(() => generateRoomCode());
  const [name, setName] = useState(() => getDeviceName());

  const go = () => {
    setDeviceName(name.trim() || "device");
    location.href = `/${room.trim()}`;
  };

  return (
    <JoinGate
      room={room}
      onRoomChange={setRoom}
      name={name}
      onNameChange={setName}
      submitLabel="Create / Join room →"
      onSubmit={go}
      tagline="On-device voice as a graph. Create a room, then wire mic → STT → translate → speech across your devices."
      footer={
        <>
          <button
            onClick={() => { location.href = "/?local"; }}
            style={{ width: "100%", marginTop: 8, fontSize: 13, padding: "8px", border: "1px solid #cbd5e0", borderRadius: 8, background: "#fff", color: "#2d3748", cursor: "pointer" }}
          >
            ▶ Try it here (no room)
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: "#a0aec0", textAlign: "center" }}>
            <a href="/?simple" style={{ color: "#718096" }}>or simple transcription →</a>
          </div>
        </>
      }
    />
  );
}

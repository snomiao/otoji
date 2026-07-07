import React from "react";
import { generateRoomCode, isRoomCode } from "../lib/roomcode";
import { generateDeviceName } from "../lib/device-id";
import { ROLES, type DeviceRole } from "../lib/device-role";

// Shared "join a room" gate. Rendered both as the landing page (Lobby, at "/")
// and as the pre-connect screen inside GraphEditor (the `!joined` branch). It is
// purely presentational — the parent owns room/name/role state and decides what
// `onSubmit` does (Lobby navigates to /<room>; GraphEditor connects in place).

// Decorative, static mic→stt→translate→speaker pipeline behind the join card.
const DEMO_BOXES: { label: string; color: string }[] = [
  { label: "🎙  Mic + VAD", color: "#dd6b20" },
  { label: "📝  SenseVoice STT", color: "#cbd5e0" },
  { label: "🌐  Translate", color: "#2b6cb0" },
  { label: "🔊  Speaker", color: "#dd6b20" },
];
function DecorPipeline() {
  const bw = 150, bh = 40, gap = 70, y = 0;
  const total = DEMO_BOXES.length * bw + (DEMO_BOXES.length - 1) * gap;
  const vh = bh + 20;
  return (
    <svg
      viewBox={`0 0 ${total} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55, padding: "0 6%" }}
    >
      {DEMO_BOXES.slice(0, -1).map((_, i) => {
        const x1 = i * (bw + gap) + bw;
        return <line key={i} x1={x1} y1={y + bh / 2 + 10} x2={x1 + gap} y2={y + bh / 2 + 10} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 5" />;
      })}
      {DEMO_BOXES.map((b, i) => {
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={y + 10} width={bw} height={bh} rx={8} fill="#fff" stroke={b.color} />
            <text x={x + bw / 2} y={y + 10 + bh / 2 + 4} textAnchor="middle" fontSize={12} fill="#4a5568">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
  backdropFilter: "blur(4px)",
};

export interface JoinGateProps {
  room: string;
  onRoomChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  /** Show a role selector when provided (Lobby omits it, keeping the landing minimal). */
  role?: DeviceRole;
  onRoleChange?: (v: DeviceRole) => void;
  submitLabel: string;
  onSubmit: () => void;
  /** Subtitle under the "otoji" wordmark. */
  tagline?: string;
  /** Extra content below the primary button (share-link hint, "try it" links, …). */
  footer?: React.ReactNode;
}

export function JoinGate({ room, onRoomChange, name, onNameChange, role, onRoleChange, submitLabel, onSubmit, tagline, footer }: JoinGateProps) {
  const valid = isRoomCode(room.trim());
  const submit = () => { if (valid) onSubmit(); };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); };

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      {/* decorative graph background */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <DecorPipeline />
      </div>

      {/* floating "hello" card */}
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
        {tagline && <p style={{ fontSize: 13, color: "#718096", margin: "4px 0 16px" }}>{tagline}</p>}

        <label style={{ display: "block", fontSize: 12, color: "#718096", marginTop: tagline ? 0 : 16, marginBottom: 8 }}>
          room
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <input
              value={room}
              onChange={(e) => onRoomChange(e.target.value)}
              onKeyDown={onEnter}
              placeholder="room code"
              style={{ flex: 1, minWidth: 0, fontSize: 14, padding: "8px 10px", border: "1px solid #cbd5e0", borderRadius: 8, outline: "none" }}
            />
            <button onClick={() => onRoomChange(generateRoomCode())} title="random room" style={{ fontSize: 16, padding: "0 10px", border: "1px solid #cbd5e0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
              🎲
            </button>
          </div>
        </label>

        <label style={{ display: "block", fontSize: 12, color: "#718096", marginBottom: role ? 8 : 16 }}>
          your name
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onEnter}
              placeholder="your name"
              style={{ flex: 1, minWidth: 0, fontSize: 14, padding: "8px 10px", border: "1px solid #cbd5e0", borderRadius: 8, outline: "none" }}
            />
            <button onClick={() => onNameChange(generateDeviceName())} title="random name" style={{ fontSize: 16, padding: "0 10px", border: "1px solid #cbd5e0", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
              🎲
            </button>
          </div>
        </label>

        {role !== undefined && onRoleChange && (
          <label style={{ display: "block", fontSize: 12, color: "#718096", marginBottom: 16 }}>
            this device's role
            <select
              value={role}
              onChange={(e) => onRoleChange(e.target.value as DeviceRole)}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px", border: "1px solid #cbd5e0", borderRadius: 8, outline: "none", marginTop: 3, background: "#fff" }}
            >
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        )}

        <button
          onClick={submit}
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
          {submitLabel}
        </button>
        {!valid && <div style={{ fontSize: 11, color: "#c05621", marginTop: 6 }}>room needs 3+ words/parts, e.g. blue-otter-7x2k</div>}

        {footer}
      </div>
    </div>
  );
}

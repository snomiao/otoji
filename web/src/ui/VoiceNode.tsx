import React, { useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_SPECS, type NodeType, type PortType } from "../graph/model";
import { GraphContext } from "./graph-context";

export interface DeviceOpt {
  deviceId: string;
  peerId?: string; // current ephemeral peer id when online
  name: string;
  me: boolean;
  online: boolean;
}

export interface VoiceNodeData {
  voiceType: NodeType;
  device: string | null;
  [key: string]: unknown;
}

const PORT_COLOR: Record<PortType, string> = {
  segment: "#dd6b20", // audio segment (orange)
  transcript: "#2b6cb0", // text (blue)
};

export function VoiceNode({ id, data }: NodeProps) {
  const d = data as VoiceNodeData;
  const { devices, onAssign, counts } = useContext(GraphContext);
  const spec = NODE_SPECS[d.voiceType];
  const assigned = devices.find((x) => x.deviceId === d.device);
  const count = counts[id] ?? 0;

  return (
    <div
      style={{
        border: "1px solid #cbd5e0",
        borderRadius: 8,
        background: "#fff",
        minWidth: 160,
        fontSize: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span>{spec.label}</span>
        {count > 0 && (
          <span style={{ fontSize: 11, color: "#2b6cb0", background: "#ebf4ff", borderRadius: 8, padding: "0 6px" }}>▤ {count}</span>
        )}
      </div>
      <div style={{ padding: "6px 10px" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096" }}>
          on:
          <select
            value={d.device ?? ""}
            onChange={(e) => onAssign(id, e.target.value || null)}
            style={{ fontSize: 11, flex: 1 }}
          >
            <option value="">(unassigned)</option>
            {assigned && !devices.some((x) => x.deviceId === d.device) && (
              <option value={d.device!}>offline device</option>
            )}
            {devices.map((x) => (
              <option key={x.deviceId} value={x.deviceId}>
                {x.name}
                {x.me ? " (me)" : x.online ? "" : " (offline)"}
              </option>
            ))}
          </select>
        </label>
        {!d.device && <div style={{ color: "#e53e3e", fontSize: 10, marginTop: 2 }}>unassigned</div>}
        {assigned && !assigned.online && (
          <div style={{ color: "#c05621", fontSize: 10, marginTop: 2 }}>● {assigned.name} offline</div>
        )}
      </div>

      {spec.inputs.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="target"
          position={Position.Left}
          style={{ top: 40 + i * 18, width: 10, height: 10, background: PORT_COLOR[p.type] }}
          title={`in: ${p.type}`}
        />
      ))}
      {spec.outputs.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          style={{ top: 40 + i * 18, width: 10, height: 10, background: PORT_COLOR[p.type] }}
          title={`out: ${p.type}`}
        />
      ))}
    </div>
  );
}

import React, { useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_SPECS, type NodeType, type PortType } from "../graph/model";
import { GraphContext } from "./graph-context";

export interface DeviceOpt {
  peerId: string;
  name: string;
  me: boolean;
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
  const { devices, onAssign } = useContext(GraphContext);
  const spec = NODE_SPECS[d.voiceType];
  const deviceName = devices.find((x) => x.peerId === d.device)?.name;

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
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 600 }}>{spec.label}</div>
      <div style={{ padding: "6px 10px" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096" }}>
          on:
          <select
            value={d.device ?? ""}
            onChange={(e) => onAssign(id, e.target.value || null)}
            style={{ fontSize: 11, flex: 1 }}
          >
            <option value="">(unassigned)</option>
            {devices.map((x) => (
              <option key={x.peerId} value={x.peerId}>
                {x.name}
                {x.me ? " (me)" : ""}
              </option>
            ))}
          </select>
        </label>
        {!deviceName && <div style={{ color: "#e53e3e", fontSize: 10, marginTop: 2 }}>unassigned</div>}
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

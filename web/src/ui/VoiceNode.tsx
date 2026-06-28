import React, { useContext, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_SPECS, type NodeType, type PortType } from "../graph/model";
import { GraphContext } from "./graph-context";
import { SENSEVOICE_MODELS, DEFAULT_SENSEVOICE_MODEL } from "../providers/stt/sensevoice-models";
import {
  TRANSLATE_MODELS,
  TRANSLATE_LANGUAGES,
  DEFAULT_TRANSLATE_MODEL,
  DEFAULT_TRANSLATE_LANG,
} from "../providers/translate/translate-config";
import { useNodeLive } from "./useNodeLive";
import { NodeMicPreview } from "./NodeMicPreview";
import { isPreviewShown, setPreviewShown } from "../lib/prefs";

export interface DeviceOpt {
  deviceId: string;
  peerId?: string; // current ephemeral peer id when online
  name: string;
  me: boolean;
  online: boolean;
  role: string;
  hasMic: boolean;
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
  const { devices, onAssign, onConfig, counts, live } = useContext(GraphContext);
  const spec = NODE_SPECS[d.voiceType];
  const assigned = devices.find((x) => x.deviceId === d.device);
  const count = counts[id] ?? 0;
  const model = ((d as any).config?.model as string | undefined) ?? DEFAULT_SENSEVOICE_MODEL;
  const { texts, busy } = useNodeLive(live, id);
  const [shown, setShown] = useState(() => isPreviewShown(id));
  const toggleShown = () => { const v = !shown; setShown(v); setPreviewShown(id, v); };

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
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #edf2f7", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {busy && <span title="processing" style={{ width: 7, height: 7, borderRadius: 4, background: "#dd6b20", display: "inline-block" }} />}
          {spec.label}
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {count > 0 && (
            <span style={{ fontSize: 11, color: "#2b6cb0", background: "#ebf4ff", borderRadius: 8, padding: "0 6px" }}>▤ {count}</span>
          )}
          <button
            onClick={toggleShown}
            title={shown ? "hide preview" : "show preview"}
            style={{ fontSize: 10, border: "none", background: "transparent", cursor: "pointer", color: "#a0aec0" }}
          >
            {shown ? "👁" : "🚫"}
          </button>
        </span>
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
        {d.voiceType === "stt" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            model:
            <select
              value={model}
              onChange={(e) => onConfig(id, { model: e.target.value })}
              style={{ fontSize: 11, flex: 1 }}
            >
              {SENSEVOICE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        {d.voiceType === "translate" && (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              to:
              <select
                value={((d as any).config?.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG}
                onChange={(e) => onConfig(id, { lang: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {TRANSLATE_LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              model:
              <select
                value={((d as any).config?.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL}
                onChange={(e) => onConfig(id, { model: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {TRANSLATE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} · {m.size}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {!d.device && <div style={{ color: "#e53e3e", fontSize: 10, marginTop: 2 }}>unassigned</div>}
        {assigned && !assigned.online && (
          <div style={{ color: "#c05621", fontSize: 10, marginTop: 2 }}>● {assigned.name} offline</div>
        )}
      </div>

      {shown && (d.voiceType === "mic-vad" || texts.length > 0) && (
        <div style={{ padding: "0 10px 8px" }}>
          {d.voiceType === "mic-vad" && <NodeMicPreview live={live} nodeId={id} width={150} height={28} />}
          {(d.voiceType === "stt" || d.voiceType === "translate" || d.voiceType === "sink") && (
            <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.35 }}>
              {texts.map((t, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

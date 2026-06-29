import React, { useContext, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_SPECS, type NodeType, type PortType } from "../graph/model";
import { GraphContext } from "./graph-context";
import { SENSEVOICE_MODELS, DEFAULT_SENSEVOICE_MODEL } from "../providers/stt/sensevoice-models";
import {
  TRANSLATE_MODELS,
  TRANSLATE_LANGUAGES,
  TRANSLATE_PROVIDERS,
  DEFAULT_TRANSLATE_MODEL,
  DEFAULT_TRANSLATE_LANG,
  DEFAULT_TRANSLATE_PROVIDER,
} from "../providers/translate/translate-config";
import { useNodeLive } from "./useNodeLive";
import { NodeMicPreview } from "./NodeMicPreview";
import { isPreviewShown, setPreviewShown } from "../lib/prefs";
import { samplesToWavBlob, concatSamples } from "../lib/peaks";
import { buildSrt } from "../lib/srt";

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

/**
 * Enumerate hardware audio devices of one kind ("audioinput"/"audiooutput").
 * Labels are empty until mic permission is granted — callers fall back to a
 * shortened deviceId. Re-reads on devicechange (plug/unplug).
 */
function useAudioDevices(kind: "audioinput" | "audiooutput"): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let alive = true;
    const refresh = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => { if (alive) setDevices(all.filter((d) => d.kind === kind)); })
        .catch(() => {});
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, [kind]);
  return devices;
}

export function VoiceNode({ id, data }: NodeProps) {
  const d = data as VoiceNodeData;
  const { devices, onAssign, onConfig, onDelete, getRecords, setFile, counts, live } = useContext(GraphContext);
  const fileName = (d as any).config?.file as string | undefined;
  const spec = NODE_SPECS[d.voiceType];
  const assigned = devices.find((x) => x.deviceId === d.device);
  const count = counts[id] ?? 0;
  const model = ((d as any).config?.model as string | undefined) ?? DEFAULT_SENSEVOICE_MODEL;
  const { texts, busy } = useNodeLive(live, id);
  const config = (d as any).config as Record<string, unknown> | undefined;
  const inputDevices = useAudioDevices("audioinput");
  const outputDevices = useAudioDevices("audiooutput");
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
          <button
            className="nodrag"
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            title="remove node"
            style={{ fontSize: 12, lineHeight: 1, border: "none", background: "transparent", cursor: "pointer", color: "#e53e3e" }}
          >
            ✕
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
              via:
              <select
                value={((d as any).config?.provider as string | undefined) ?? DEFAULT_TRANSLATE_PROVIDER}
                onChange={(e) => onConfig(id, { provider: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {TRANSLATE_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            {(((d as any).config?.provider as string | undefined) ?? DEFAULT_TRANSLATE_PROVIDER) === "llm" && (
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
            )}
          </>
        )}
        {d.voiceType === "mic-vad" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            mic:
            <select
              value={(config?.inputDeviceId as string | undefined) ?? ""}
              onChange={(e) => onConfig(id, { inputDeviceId: e.target.value || undefined })}
              style={{ fontSize: 11, flex: 1 }}
            >
              <option value="">(default mic)</option>
              {inputDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label || `mic ${dev.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {d.voiceType === "speaker" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            out:
            <select
              value={(config?.sinkId as string | undefined) ?? ""}
              onChange={(e) => onConfig(id, { sinkId: e.target.value || undefined })}
              style={{ fontSize: 11, flex: 1 }}
            >
              <option value="">(default speaker)</option>
              {outputDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label || `speaker ${dev.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {(d.voiceType === "file-audio" || d.voiceType === "file-text") && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#718096" }}>
            <div style={{ marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
              {fileName ? `📄 ${fileName}` : "no file"}
            </div>
            <input
              type="file"
              accept={d.voiceType === "file-audio" ? "audio/*" : ".md,.txt,.srt,.vtt,text/*"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(id, f); }}
              style={{ fontSize: 10, width: 150 }}
            />
          </div>
        )}
        {d.voiceType === "audio-out" && (
          <button
            className="nodrag"
            style={{ fontSize: 11, marginTop: 4 }}
            disabled={getRecords(id).length === 0}
            onClick={() => {
              const samples = getRecords(id).map((r) => r.samples).filter((s): s is Float32Array => !!s && s.length > 0);
              if (!samples.length) return;
              download(samplesToWavBlob(concatSamples(samples), 16000), "otoji-audio.wav");
            }}
          >
            ⬇ download audio ({getRecords(id).length})
          </button>
        )}
        {d.voiceType === "srt-out" && (
          <button
            className="nodrag"
            style={{ fontSize: 11, marginTop: 4 }}
            disabled={getRecords(id).length === 0}
            onClick={() => {
              const srt = buildSrt(
                getRecords(id).map((r) => ({ text: r.text, durationMs: r.durationMs, startMs: r.tStartMs, endMs: r.tEndMs })),
              );
              download(new Blob([srt], { type: "text/plain" }), "otoji.srt");
            }}
          >
            ⬇ download .srt ({getRecords(id).length})
          </button>
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

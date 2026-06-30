import React, { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_SPECS, type NodeType, type PortType } from "../graph/model";
import { normalizeTracker, dedupeTrackers } from "../lib/trackers";
import { GraphContext } from "./graph-context";
import { fileStore } from "../graph/file-store";
import { SENSEVOICE_MODELS, DEFAULT_SENSEVOICE_MODEL } from "../providers/stt/sensevoice-models";
import {
  TRANSLATE_MODELS,
  TRANSLATE_LANGUAGES,
  TRANSLATE_PROVIDERS,
  DEFAULT_TRANSLATE_MODEL,
  DEFAULT_TRANSLATE_LANG,
  DEFAULT_TRANSLATE_PROVIDER,
} from "../providers/translate/translate-config";
import { NEURAL_TTS_MODELS, AUTO_TTS_MODEL, AUTO_TTS_VOICE } from "../providers/tts/tts-config";
import { MODEL_TASKS, MODEL_DTYPES, DEFAULT_MODEL_DTYPE } from "../providers/model/transformers-pipeline";
import { VOSK_MODELS, DEFAULT_VOSK_MODEL } from "../providers/stt/vosk";
import { useNodeLive } from "./useNodeLive";
import { NodeMicPreview } from "./NodeMicPreview";
import { NodeImagePreview } from "./NodeImagePreview";
import { DIFF_STYLES, DEFAULT_DIFF_STYLE } from "../lib/textdiff";
import { DEFAULT_CAMERA_FPS } from "../providers/vision/camera";
import { DETECT_MODELS, DEFAULT_DETECT_MODEL } from "../providers/vision/detect";
import { isPreviewShown, setPreviewShown, subscribePrefs } from "../lib/prefs";
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
  image: "#319795", // captured frame (teal)
  control: "#d69e2e", // feedback signal (amber)
};

// One-click demo clips for the Audio-file node (served same-origin from /samples).
const FILE_SAMPLES: { name: string; url: string }[] = [
  { name: "English speech (8s)", url: "/samples/en.wav" },
];

/**
 * Enumerate hardware audio devices of one kind ("audioinput"/"audiooutput").
 * Labels are empty until mic permission is granted — callers fall back to a
 * shortened deviceId. Re-reads on devicechange (plug/unplug).
 */
function useAudioDevices(kind: "audioinput" | "audiooutput" | "videoinput"): MediaDeviceInfo[] {
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

/** On-device SpeechSynthesis voices. Populated async via the voiceschanged event. */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, []);
  return voices;
}

export function VoiceNode({ id, data }: NodeProps) {
  const d = data as VoiceNodeData;
  const { devices, onAssign, onConfig, onDelete, getRecords, setFile, counts, live, openNodeMenu, trackerState } = useContext(GraphContext);
  const lpTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileName = (d as any).config?.file as string | undefined;
  const spec = NODE_SPECS[d.voiceType];
  const assigned = devices.find((x) => x.deviceId === d.device);
  const count = counts[id] ?? 0;
  const model = ((d as any).config?.model as string | undefined) ?? DEFAULT_SENSEVOICE_MODEL;
  const { texts, busy, queue } = useNodeLive(live, id);
  const config = (d as any).config as Record<string, unknown> | undefined;
  const inputDevices = useAudioDevices("audioinput");
  const outputDevices = useAudioDevices("audiooutput");
  const cameraDevices = useAudioDevices("videoinput");
  const voices = useVoices();
  const shown = useSyncExternalStore(subscribePrefs, () => isPreviewShown(id));
  const toggleShown = () => setPreviewShown(id, !shown);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [trackerErr, setTrackerErr] = useState<string | null>(null); // Signaling node input error

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    lpTimer.current = setTimeout(() => openNodeMenu?.(id, t.clientX, t.clientY), 500); // long-press
  };
  const clearLP = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };

  // Config-only "Signaling (trackers)" node. SECURITY: trackers are NOT applied
  // straight from the synced graph. `active` = servers this browser is actually
  // connected to (trusted env + locally-approved); `pending` = servers proposed
  // by a peer's node or a share link, which connect only after the local user
  // approves. Adding here advertises the server in the graph (config.trackers,
  // a proposal others see) AND approves it locally.
  if (d.voiceType === "tracker") {
    const active = trackerState?.active ?? [];
    const pending = trackerState?.pending ?? [];
    const advertised = (Array.isArray(config?.trackers) ? (config!.trackers as string[]) : []) ?? [];
    const display = (t: string) => t.replace(/^https?:\/\//, "");
    const addTracker = (raw: string) => {
      if (!raw.trim()) return;
      const err = trackerState?.approve(raw); // vets (scheme/private/cap) + locally approves
      if (err) { setTrackerErr(err); return; }
      setTrackerErr(null);
      // Advertise the canonical url in the graph so other peers see the proposal.
      const canon = normalizeTracker(raw);
      if (canon && !advertised.includes(canon))
        onConfig(id, { trackers: dedupeTrackers([...advertised, canon]) });
    };
    return (
      <div
        onContextMenu={(e) => { e.preventDefault(); openNodeMenu?.(id, e.clientX, e.clientY); }}
        onTouchStart={onTouchStart}
        onTouchEnd={clearLP}
        onTouchMove={clearLP}
        style={{ border: "1px solid #b794f4", borderRadius: 8, background: "#faf5ff", minWidth: 210, fontSize: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
      >
        <div style={{ padding: "6px 10px", borderBottom: "1px solid #e9d8fd", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>📡 {spec.label}</span>
          <button
            className="nodrag"
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            title="remove node"
            style={{ fontSize: 12, lineHeight: 1, border: "none", background: "transparent", cursor: "pointer", color: "#e53e3e" }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "6px 10px" }}>
          <div style={{ color: "#718096", marginBottom: 3 }}>Connected ({active.length}):</div>
          {active.map((t) => (
            <div key={t} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
              <span title="connected" style={{ width: 6, height: 6, borderRadius: 3, background: "#38a169", flex: "0 0 auto" }} />
              <code style={{ flex: 1, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }} title={t}>{display(t)}</code>
              <button className="nodrag" onClick={() => trackerState?.revoke(t)} title="disconnect / unapprove"
                style={{ fontSize: 11, border: "none", background: "transparent", cursor: "pointer", color: "#a0aec0" }}>✕</button>
            </div>
          ))}
          {pending.length > 0 && (
            <>
              <div style={{ color: "#c05621", margin: "6px 0 3px" }}>Proposed — approve to join:</div>
              {pending.map((t) => (
                <div key={t} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
                  <code style={{ flex: 1, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={t}>{display(t)}</code>
                  <button className="nodrag" onClick={() => { const e2 = trackerState?.approve(t); setTrackerErr(e2 ?? null); }}
                    title="approve and connect"
                    style={{ fontSize: 10, cursor: "pointer", color: "#2f855a", border: "1px solid #9ae6b4", borderRadius: 4, background: "#f0fff4" }}>approve</button>
                </div>
              ))}
            </>
          )}
          <input
            className="nodrag"
            type="text"
            placeholder="https://… add server"
            onBlur={(e) => { addTracker(e.target.value); e.target.value = ""; }}
            onKeyDown={(e) => { if (e.key === "Enter") { addTracker((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
            style={{ fontSize: 11, width: "100%", marginTop: 6, boxSizing: "border-box" }}
          />
          {trackerErr && <div style={{ color: "#e53e3e", fontSize: 9, marginTop: 2 }}>{trackerErr}</div>}
          <div style={{ color: "#a0aec0", fontSize: 9, marginTop: 4, lineHeight: 1.3 }}>
            Peers connect when their server lists overlap. Approve before joining a proposed server.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => { e.preventDefault(); openNodeMenu?.(id, e.clientX, e.clientY); }}
      onTouchStart={onTouchStart}
      onTouchEnd={clearLP}
      onTouchMove={clearLP}
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
        {(d.voiceType === "mic-vad" || d.voiceType === "mic-raw") && (
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
        {d.voiceType === "audio-mix" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            jitter:
            <input
              type="number"
              min={0}
              max={2000}
              step={50}
              defaultValue={(config?.jitterMs as number | undefined) ?? 300}
              onBlur={(e) => onConfig(id, { jitterMs: Math.max(0, Number(e.target.value) || 0) })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ fontSize: 11, width: 56 }}
            />
            <span style={{ fontSize: 9, color: "#a0aec0" }}>ms · wire several inputs</span>
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
        {d.voiceType === "tts" && (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              voice:
              <select
                value={(config?.voice as string | undefined) ?? AUTO_TTS_VOICE}
                onChange={(e) => onConfig(id, { voice: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                <option value={AUTO_TTS_VOICE}>Auto (match language)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} · {v.lang}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              rate:
              <select
                value={String((config?.rate as number | undefined) ?? 1)}
                onChange={(e) => onConfig(id, { rate: Number(e.target.value) })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r}>{r}×</option>
                ))}
              </select>
            </label>
          </>
        )}
        {d.voiceType === "tts-model" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            model:
            <select
              value={(config?.model as string | undefined) ?? AUTO_TTS_MODEL}
              onChange={(e) => onConfig(id, { model: e.target.value })}
              style={{ fontSize: 11, flex: 1 }}
            >
              <option value={AUTO_TTS_MODEL}>Auto (match language)</option>
              {NEURAL_TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        {d.voiceType === "web-speech" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            lang:
            <input
              type="text"
              defaultValue={(config?.lang as string | undefined) ?? ""}
              placeholder="e.g. en-US, ja-JP"
              onBlur={(e) => onConfig(id, { lang: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ fontSize: 11, flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        {d.voiceType === "camera" && (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              cam:
              <select
                value={(config?.cameraId as string | undefined) ?? ""}
                onChange={(e) => onConfig(id, { cameraId: e.target.value || undefined })}
                style={{ fontSize: 11, flex: 1 }}
              >
                <option value="">(default camera)</option>
                {cameraDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label || `camera ${dev.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              fps:
              <input
                type="number"
                min={0.2}
                max={30}
                step={0.5}
                defaultValue={(config?.fps as number | undefined) ?? DEFAULT_CAMERA_FPS}
                onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 11, width: 56 }}
              />
              <span style={{ fontSize: 9, color: "#a0aec0" }}>(or wire rate)</span>
            </label>
          </>
        )}

        {d.voiceType === "screen-share" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            fps:
            <input
              type="number"
              min={0.2}
              max={30}
              step={0.5}
              defaultValue={(config?.fps as number | undefined) ?? DEFAULT_CAMERA_FPS}
              onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ fontSize: 11, width: 56 }}
            />
            <span style={{ fontSize: 9, color: "#a0aec0" }}>(or wire rate) · audio→STT</span>
          </label>
        )}
        {d.voiceType === "vision-model" && (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              task:
              <select
                value={(config?.task as string | undefined) ?? "detect"}
                onChange={(e) => onConfig(id, { task: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                <option value="detect">Object detection</option>
                <option value="depth">Depth map</option>
                <option value="pose">Pose (MediaPipe)</option>
                <option value="hand">Hand (MediaPipe)</option>
              </select>
            </label>
            {(((config?.task as string | undefined) ?? "detect") === "detect") && (
              <>
                <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
                  model:
                  <select
                    value={(config?.model as string | undefined) ?? DEFAULT_DETECT_MODEL}
                    onChange={(e) => onConfig(id, { model: e.target.value })}
                    style={{ fontSize: 11, flex: 1 }}
                  >
                    {DETECT_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
                  min score:
                  <input
                    type="number"
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    defaultValue={(config?.threshold as number | undefined) ?? 0.5}
                    onBlur={(e) => onConfig(id, { threshold: Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.5)) })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ fontSize: 11, width: 56 }}
                  />
                </label>
              </>
            )}
          </>
        )}
        {d.voiceType === "text-diff" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            style:
            <select
              value={(config?.style as string | undefined) ?? DEFAULT_DIFF_STYLE}
              onChange={(e) => onConfig(id, { style: e.target.value })}
              style={{ fontSize: 11, flex: 1 }}
            >
              {DIFF_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}
        {d.voiceType === "vosk" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
            model:
            <select
              value={(config?.model as string | undefined) ?? DEFAULT_VOSK_MODEL}
              onChange={(e) => onConfig(id, { model: e.target.value })}
              style={{ fontSize: 11, flex: 1 }}
            >
              {VOSK_MODELS.map((m) => (
                <option key={m.id} value={m.url}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        {d.voiceType === "pipe" && (() => {
          const room = typeof location !== "undefined" ? location.pathname.replace(/^\/+|\/+$/g, "") : "";
          const cmd = `npx otoji node ${typeof location !== "undefined" ? location.host : "otoji.org"}/${room || "<room>"}/${id}`;
          return (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#a0aec0", marginBottom: 2 }}>run in a terminal to bridge stdio:</div>
              <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
                <code style={{ flex: 1, minWidth: 0, fontSize: 9.5, background: "#f7fafc", border: "1px solid #e2e8f0", borderRadius: 4, padding: "3px 5px", overflowX: "auto", whiteSpace: "nowrap" }}>{cmd}</code>
                <button
                  className="nodrag"
                  title="copy command"
                  onClick={() => { navigator.clipboard?.writeText(cmd); setCmdCopied(true); setTimeout(() => setCmdCopied(false), 1200); }}
                  style={{ fontSize: 10, border: "1px solid #cbd5e0", borderRadius: 4, background: "#fff", cursor: "pointer", padding: "0 6px" }}
                >
                  {cmdCopied ? "✓" : "⧉"}
                </button>
              </div>
            </div>
          );
        })()}
        {d.voiceType === "model" && (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              task:
              <select
                value={(config?.task as string | undefined) ?? "asr"}
                onChange={(e) => onConfig(id, { task: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {MODEL_TASKS.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 4 }}>
              model (HF repo id or URL):
              <input
                type="text"
                defaultValue={(config?.model as string | undefined) ?? ""}
                placeholder="e.g. Xenova/whisper-tiny.en"
                onBlur={(e) => onConfig(id, { model: e.target.value.trim() })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 11, width: 150, marginTop: 2 }}
              />
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 4 }}>
              dtype:
              <select
                value={(config?.dtype as string | undefined) ?? DEFAULT_MODEL_DTYPE}
                onChange={(e) => onConfig(id, { dtype: e.target.value })}
                style={{ fontSize: 11, flex: 1 }}
              >
                {MODEL_DTYPES.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {(d.voiceType === "file-audio" || d.voiceType === "file-text") && (() => {
          const url = config?.url as string | undefined;
          const useUrl = (u: string | undefined) => { fileStore.delete(id); onConfig(id, { url: u || undefined, file: undefined }); };
          const samples = d.voiceType === "file-audio" ? FILE_SAMPLES : [];
          return (
            <div style={{ marginTop: 4, fontSize: 11, color: "#718096" }}>
              <div style={{ marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                {fileName ? `📄 ${fileName}` : url ? `🔗 ${url}` : "no file"}
              </div>
              <input
                type="file"
                accept={d.voiceType === "file-audio" ? "audio/*" : ".md,.txt,.srt,.vtt,text/*"}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(id, f); }}
                style={{ fontSize: 10, width: 150 }}
              />
              <input
                type="text"
                defaultValue={url ?? ""}
                placeholder="…or paste a URL"
                onBlur={(e) => useUrl(e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 10, width: 150, marginTop: 3, display: "block" }}
              />
              {samples.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) useUrl(e.target.value); }}
                  style={{ fontSize: 10, width: 156, marginTop: 3 }}
                >
                  <option value="">load a sample…</option>
                  {samples.map((s) => (
                    <option key={s.url} value={s.url}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })()}
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
        {(queue.processing || queue.queued.length > 0) && (
          <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4 }}>
            {queue.processing && (
              <div style={{ color: "#dd6b20", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                ▶ {queue.processing}
              </div>
            )}
            {queue.queued.length > 0 && (
              <div style={{ color: "#a0aec0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                ⋯ {queue.queued.length} queued{queue.queued.length <= 2 ? `: ${queue.queued.join(", ")}` : ""}
              </div>
            )}
          </div>
        )}
        {!d.device && <div style={{ color: "#e53e3e", fontSize: 10, marginTop: 2 }}>unassigned</div>}
        {assigned && !assigned.online && (
          <div style={{ color: "#c05621", fontSize: 10, marginTop: 2 }}>● {assigned.name} offline</div>
        )}
      </div>

      {shown && (d.voiceType === "mic-vad" || d.voiceType === "mic-raw" || d.voiceType === "camera" || d.voiceType === "screen-share" || d.voiceType === "paddle-ocr" || d.voiceType === "vision-model" || texts.length > 0) && (
        <div style={{ padding: "0 10px 8px" }}>
          {(d.voiceType === "mic-vad" || d.voiceType === "mic-raw") && <NodeMicPreview live={live} nodeId={id} width={150} height={28} />}
          {(d.voiceType === "camera" || d.voiceType === "screen-share" || d.voiceType === "paddle-ocr" || d.voiceType === "vision-model") && <NodeImagePreview live={live} nodeId={id} width={150} height={84} />}
          {(d.voiceType === "stt" || d.voiceType === "translate" || d.voiceType === "sink" || d.voiceType === "web-speech" || d.voiceType === "vosk" || d.voiceType === "model" || d.voiceType === "paddle-ocr" || d.voiceType === "text-diff" || d.voiceType === "vision-model") && (
            <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
              {texts.map((t, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.3, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150, maxHeight: 48 }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {spec.inputs.map((p, i) => (
        <React.Fragment key={p.id}>
          <Handle
            id={p.id}
            type="target"
            position={Position.Left}
            style={{ top: 40 + i * 18, width: 10, height: 10, background: PORT_COLOR[p.type] }}
            title={`in: ${p.id} (${p.type})`}
          />
          <span style={{ ...PORT_LABEL, left: 9, top: 40 + i * 18 - 6, color: PORT_COLOR[p.type] }}>{portLabel(p.id, p.type)}</span>
        </React.Fragment>
      ))}
      {spec.outputs.map((p, i) => (
        <React.Fragment key={p.id}>
          <Handle
            id={p.id}
            type="source"
            position={Position.Right}
            style={{ top: 40 + i * 18, width: 10, height: 10, background: PORT_COLOR[p.type] }}
            title={`out: ${p.id} (${p.type})`}
          />
          <span style={{ ...PORT_LABEL, right: 9, top: 40 + i * 18 - 6, color: PORT_COLOR[p.type] }}>{portLabel(p.id, p.type)}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// Small label shown beside a port handle so its name/type is visible.
const PORT_LABEL: React.CSSProperties = {
  position: "absolute",
  fontSize: 8,
  lineHeight: "12px",
  fontWeight: 600,
  pointerEvents: "none",
  opacity: 0.85,
  letterSpacing: "0.02em",
};
const PORT_ABBR: Record<PortType, string> = { segment: "aud", transcript: "txt", image: "img", control: "ctl" };
function portLabel(id: string, type: PortType): string {
  // Show the port id unless it's the generic in/out, then show the type.
  return id === "in" || id === "out" ? type : `${id}·${PORT_ABBR[type]}`;
}

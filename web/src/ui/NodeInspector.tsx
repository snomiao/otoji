import React, { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { NODE_SPECS, type NodeType } from "../graph/model";
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
import { DEFAULT_SHERPA_SERVER_URL } from "../providers/stt/sherpa_native";
import { useNodeLive } from "./useNodeLive";
import { RecordingPlayer } from "./RecordingPlayer";
import { DIFF_STYLES, DEFAULT_DIFF_STYLE } from "../lib/textdiff";
import { DEFAULT_CAMERA_FPS } from "../providers/vision/camera";
import { DETECT_MODELS, DEFAULT_DETECT_MODEL } from "../providers/vision/detect";
import { isPreviewShown, setPreviewShown, subscribePrefs } from "../lib/prefs";
import { samplesToWavBlob, concatSamples } from "../lib/peaks";
import { buildSrt } from "../lib/srt";

// Node inspector: the config surface for the currently-selected node, replacing
// the inline controls React Flow's VoiceNode rendered. rgui draws nodes on a
// canvas (no inline widgets), so per-node config lives in this floating panel.

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useAudioDevices(kind: "audioinput" | "audiooutput" | "videoinput"): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let alive = true;
    const refresh = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => { if (alive) setDevices(all.filter((dv) => dv.kind === kind)); })
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

const row: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", color: "#718096", marginTop: 6 };
const sel: React.CSSProperties = { fontSize: 12, flex: 1, minWidth: 0 };

export interface InspectorNode {
  id: string;
  voiceType: NodeType;
  device: string | null;
  config?: Record<string, unknown>;
}

export function NodeInspector({ node, onClose }: { node: InspectorNode; onClose?: () => void }) {
  const { devices, myDeviceId, onAssign, onConfig, onDelete, getRecords, clearRecords, setFile, counts, live, trackerState } =
    useContext(GraphContext);
  const id = node.id;
  const vt = node.voiceType;
  const spec = NODE_SPECS[vt];
  const config = node.config;
  const fileName = config?.file as string | undefined;
  const assigned = devices.find((x) => x.deviceId === node.device);
  const count = counts[id] ?? 0;
  const { queue } = useNodeLive(live, id);
  const inputDevices = useAudioDevices("audioinput");
  const outputDevices = useAudioDevices("audiooutput");
  const cameraDevices = useAudioDevices("videoinput");
  const voices = useVoices();
  const onlineIds = devices.filter((x) => x.online).map((x) => x.deviceId);
  const owner = node.device || (onlineIds.length ? [...onlineIds].sort()[0] : null);
  const ownedHere = owner == null || owner === myDeviceId;
  const shown = useSyncExternalStore(subscribePrefs, () => isPreviewShown(id, ownedHere));
  const [cmdCopied, setCmdCopied] = useState(false);
  const [trackerErr, setTrackerErr] = useState<string | null>(null);

  const provider = (config?.provider as string | undefined) ?? DEFAULT_TRANSLATE_PROVIDER;
  const task = (config?.task as string | undefined) ?? "detect";

  const trackerActive = trackerState?.active ?? [];
  const trackerPending = trackerState?.pending ?? [];
  const advertised = (Array.isArray(config?.trackers) ? (config!.trackers as string[]) : []) ?? [];
  const addTracker = (raw: string) => {
    if (!raw.trim()) return;
    const err = trackerState?.approve(raw);
    if (err) { setTrackerErr(err); return; }
    setTrackerErr(null);
    const canon = normalizeTracker(raw);
    if (canon && !advertised.includes(canon)) onConfig(id, { trackers: dedupeTrackers([...advertised, canon]) });
  };
  const display = (t: string) => t.replace(/^https?:\/\//, "");

  // Positioned by rgui (glued to the node via setNodeOverlay); this is just the card.
  // `rgui-node-cfg`: the card is click-through so dragging it drags the node;
  // only the form controls capture pointer events (see index.html).
  // Just the interactive controls — rgui draws the node frame, title, and ports.
  // The container is transparent + click-through (only the controls capture); it
  // is anchored over the node's body region by rgui.
  return (
    <div
      className="rgui-node-cfg"
      style={{ width: 190, fontSize: 12, fontFamily: "system-ui, sans-serif" }}
    >
      <div style={{ padding: "2px 10px 6px" }}>
        <label style={row}>
          on:
          <select value={node.device ?? ""} onChange={(e) => onAssign(id, e.target.value || null)} style={sel}>
            <option value="">(unassigned)</option>
            {assigned && !devices.some((x) => x.deviceId === node.device) && <option value={node.device!}>offline device</option>}
            {devices.map((x) => (
              <option key={x.deviceId} value={x.deviceId}>{x.name}{x.me ? " (me)" : x.online ? "" : " (offline)"}</option>
            ))}
          </select>
        </label>

        {vt === "stt" && (
          <label style={row}>model:
            <select value={(config?.model as string) ?? DEFAULT_SENSEVOICE_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
              {SENSEVOICE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        {vt === "translate" && (
          <>
            <label style={row}>to:
              <select value={(config?.lang as string) ?? DEFAULT_TRANSLATE_LANG} onChange={(e) => onConfig(id, { lang: e.target.value })} style={sel}>
                {TRANSLATE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label style={row}>via:
              <select value={provider} onChange={(e) => onConfig(id, { provider: e.target.value })} style={sel}>
                {TRANSLATE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {provider === "llm" && (
              <label style={row}>model:
                <select value={(config?.model as string) ?? DEFAULT_TRANSLATE_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
                  {TRANSLATE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size}</option>)}
                </select>
              </label>
            )}
          </>
        )}

        {(vt === "mic-vad" || vt === "mic-raw") && (
          <>
            <label style={row}>mic:
              <select value={(config?.inputDeviceId as string) ?? ""} onChange={(e) => onConfig(id, { inputDeviceId: e.target.value || undefined })} style={sel}>
                <option value="">(default mic)</option>
                {inputDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `mic ${dev.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </label>
            <label style={{ ...row, fontSize: 11 }} title="Browser echo cancellation, noise suppression & auto-gain.">
              <input type="checkbox" checked={(config?.aec as boolean) ?? true} onChange={(e) => onConfig(id, { aec: e.target.checked })} />
              echo cancel / denoise
            </label>
          </>
        )}

        {vt === "audio-mix" && (
          <label style={row}>jitter:
            <input type="number" min={0} max={2000} step={50} defaultValue={(config?.jitterMs as number) ?? 300}
              onBlur={(e) => onConfig(id, { jitterMs: Math.max(0, Number(e.target.value) || 0) })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: 56 }} />
            <span style={{ fontSize: 9, color: "#a0aec0" }}>ms</span>
          </label>
        )}

        {vt === "speaker" && (
          <label style={row}>out:
            <select value={(config?.sinkId as string) ?? ""} onChange={(e) => onConfig(id, { sinkId: e.target.value || undefined })} style={sel}>
              <option value="">(default speaker)</option>
              {outputDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `speaker ${dev.deviceId.slice(0, 8)}`}</option>)}
            </select>
          </label>
        )}

        {vt === "tts" && (
          <>
            <label style={row}>voice:
              <select value={(config?.voice as string) ?? AUTO_TTS_VOICE} onChange={(e) => onConfig(id, { voice: e.target.value })} style={sel}>
                <option value={AUTO_TTS_VOICE}>Auto (match language)</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
              </select>
            </label>
            <label style={row}>rate:
              <select value={String((config?.rate as number) ?? 1)} onChange={(e) => onConfig(id, { rate: Number(e.target.value) })} style={sel}>
                {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
          </>
        )}

        {vt === "tts-model" && (
          <label style={row}>model:
            <select value={(config?.model as string) ?? AUTO_TTS_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
              <option value={AUTO_TTS_MODEL}>Auto (match language)</option>
              {NEURAL_TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        {vt === "web-speech" && (
          <label style={row}>lang:
            <input type="text" defaultValue={(config?.lang as string) ?? ""} placeholder="e.g. en-US, ja-JP"
              onBlur={(e) => onConfig(id, { lang: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={sel} />
          </label>
        )}

        {vt === "camera" && (
          <>
            <label style={row}>cam:
              <select value={(config?.cameraId as string) ?? ""} onChange={(e) => onConfig(id, { cameraId: e.target.value || undefined })} style={sel}>
                <option value="">(default camera)</option>
                {cameraDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `camera ${dev.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </label>
            <label style={row}>fps:
              <input type="number" min={0.2} max={30} step={0.5} defaultValue={(config?.fps as number) ?? DEFAULT_CAMERA_FPS}
                onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: 56 }} />
            </label>
          </>
        )}

        {vt === "screen-share" && (
          <label style={row}>fps:
            <input type="number" min={0.2} max={30} step={0.5} defaultValue={(config?.fps as number) ?? DEFAULT_CAMERA_FPS}
              onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: 56 }} />
            <span style={{ fontSize: 9, color: "#a0aec0" }}>audio→STT</span>
          </label>
        )}

        {vt === "vision-model" && (
          <>
            <label style={row}>task:
              <select value={task} onChange={(e) => onConfig(id, { task: e.target.value })} style={sel}>
                <option value="detect">Object detection</option>
                <option value="depth">Depth map</option>
                <option value="pose">Pose (MediaPipe)</option>
                <option value="hand">Hand (MediaPipe)</option>
              </select>
            </label>
            {task === "detect" && (
              <>
                <label style={row}>model:
                  <select value={(config?.model as string) ?? DEFAULT_DETECT_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
                    {DETECT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label style={row}>min score:
                  <input type="number" min={0.05} max={0.95} step={0.05} defaultValue={(config?.threshold as number) ?? 0.5}
                    onBlur={(e) => onConfig(id, { threshold: Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.5)) })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: 56 }} />
                </label>
              </>
            )}
          </>
        )}

        {vt === "text-diff" && (
          <label style={row}>style:
            <select value={(config?.style as string) ?? DEFAULT_DIFF_STYLE} onChange={(e) => onConfig(id, { style: e.target.value })} style={sel}>
              {DIFF_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {vt === "vosk" && (
          <label style={row}>model:
            <select value={(config?.model as string) ?? DEFAULT_VOSK_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
              {VOSK_MODELS.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
            </select>
          </label>
        )}

        {vt === "sherpa" && (
          <>
            <label style={row}>server:
              <input value={(config?.serverUrl as string) ?? DEFAULT_SHERPA_SERVER_URL} onChange={(e) => onConfig(id, { serverUrl: e.target.value })}
                placeholder={DEFAULT_SHERPA_SERVER_URL} spellCheck={false} style={sel} />
            </label>
            <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>run <code>otoji server</code> locally (native sherpa-onnx)</div>
          </>
        )}

        {vt === "model" && (
          <>
            <label style={row}>task:
              <select value={(config?.task as string) ?? "asr"} onChange={(e) => onConfig(id, { task: e.target.value })} style={sel}>
                {MODEL_TASKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model (HF repo id or URL):
              <input type="text" defaultValue={(config?.model as string) ?? ""} placeholder="e.g. Xenova/whisper-tiny.en"
                onBlur={(e) => onConfig(id, { model: e.target.value.trim() })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box" }} />
            </label>
            <label style={row}>dtype:
              <select value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </label>
          </>
        )}

        {vt === "pipe" && (() => {
          const room = typeof location !== "undefined" ? location.pathname.replace(/^\/+|\/+$/g, "") : "";
          const cmd = `npx otoji node ${typeof location !== "undefined" ? location.host : "otoji.org"}/${room || "<room>"}/${id}`;
          return (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: "#a0aec0", marginBottom: 2 }}>bridge stdio in a terminal:</div>
              <div style={{ display: "flex", gap: 4 }}>
                <code style={{ flex: 1, minWidth: 0, fontSize: 9.5, background: "#f7fafc", border: "1px solid #e2e8f0", borderRadius: 4, padding: "3px 5px", overflowX: "auto", whiteSpace: "nowrap" }}>{cmd}</code>
                <button onClick={() => { navigator.clipboard?.writeText(cmd); setCmdCopied(true); setTimeout(() => setCmdCopied(false), 1200); }}
                  style={{ fontSize: 10, border: "1px solid #cbd5e0", borderRadius: 4, background: "#fff", cursor: "pointer", padding: "0 6px" }}>{cmdCopied ? "✓" : "⧉"}</button>
              </div>
            </div>
          );
        })()}

        {(vt === "file-audio" || vt === "file-text") && (() => {
          const url = config?.url as string | undefined;
          const useUrl = (u: string | undefined) => { fileStore.delete(id); onConfig(id, { url: u || undefined, file: undefined }); };
          return (
            <div style={{ marginTop: 6, fontSize: 11, color: "#718096" }}>
              <div style={{ marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName ? `📄 ${fileName}` : url ? `🔗 ${url}` : "no file"}</div>
              <input type="file" accept={vt === "file-audio" ? "audio/*" : ".md,.txt,.srt,.vtt,text/*"} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(id, f); }} style={{ fontSize: 10, width: "100%" }} />
              <input type="text" defaultValue={url ?? ""} placeholder="…or paste a URL"
                onBlur={(e) => useUrl(e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 10, width: "100%", marginTop: 3, boxSizing: "border-box" }} />
            </div>
          );
        })()}

        {vt === "sink" && (() => {
          // Recordings live IN the sink node (the floating "Sink output" card is
          // gone). Newest first, capped for render; the overlay scrolls (rgui
          // clip:"node" + overflow:"auto") if the list outgrows the node.
          const recs = getRecords(id);
          const shownRecs = recs.slice(-8).reverse();
          return (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#718096" }}>
                <span>recordings ({recs.length})</span>
                {recs.length > 0 && <button style={{ fontSize: 10 }} onClick={() => clearRecords?.(id)}>Clear</button>}
              </div>
              {recs.length === 0 ? (
                <div style={{ color: "#a0aec0", fontSize: 11 }}>Run the graph to collect transcripts.</div>
              ) : (
                shownRecs.map((r, i) => <RecordingPlayer key={r.id} rec={r} index={recs.length - 1 - i} />)
              )}
            </div>
          );
        })()}

        {vt === "audio-out" && (
          <button style={{ fontSize: 11, marginTop: 6 }} disabled={getRecords(id).length === 0}
            onClick={() => {
              const samples = getRecords(id).map((r) => r.samples).filter((s): s is Float32Array => !!s && s.length > 0);
              if (!samples.length) return;
              download(samplesToWavBlob(concatSamples(samples), 16000), "otoji-audio.wav");
            }}>⬇ download audio ({getRecords(id).length})</button>
        )}

        {vt === "srt-out" && (
          <button style={{ fontSize: 11, marginTop: 6 }} disabled={getRecords(id).length === 0}
            onClick={() => {
              const srt = buildSrt(getRecords(id).map((r) => ({ text: r.text, durationMs: r.durationMs, startMs: r.tStartMs, endMs: r.tEndMs })));
              download(new Blob([srt], { type: "text/plain" }), "otoji.srt");
            }}>⬇ download .srt ({getRecords(id).length})</button>
        )}

        {vt === "tracker" && (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "#718096", marginBottom: 3 }}>Connected ({trackerActive.length}):</div>
            {trackerActive.map((t) => (
              <div key={t} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: "#38a169", flex: "0 0 auto" }} />
                <code style={{ flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{display(t)}</code>
                <button onClick={() => trackerState?.revoke(t)} title="disconnect" style={{ fontSize: 11, border: "none", background: "transparent", cursor: "pointer", color: "#a0aec0" }}>✕</button>
              </div>
            ))}
            {trackerPending.length > 0 && (
              <>
                <div style={{ color: "#c05621", margin: "6px 0 3px" }}>Proposed — approve to join:</div>
                {trackerPending.map((t) => (
                  <div key={t} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
                    <code style={{ flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t}>{display(t)}</code>
                    <button onClick={() => { const e2 = trackerState?.approve(t); setTrackerErr(e2 ?? null); }} style={{ fontSize: 10, cursor: "pointer", color: "#2f855a", border: "1px solid #9ae6b4", borderRadius: 4, background: "#f0fff4" }}>approve</button>
                  </div>
                ))}
              </>
            )}
            <input type="text" placeholder="https://… add server"
              onBlur={(e) => { addTracker(e.target.value); e.target.value = ""; }}
              onKeyDown={(e) => { if (e.key === "Enter") { addTracker((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
              style={{ fontSize: 11, width: "100%", marginTop: 6, boxSizing: "border-box" }} />
            {trackerErr && <div style={{ color: "#e53e3e", fontSize: 9, marginTop: 2 }}>{trackerErr}</div>}
          </div>
        )}

        {(queue.processing || queue.queued.length > 0) && (
          <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.4 }}>
            {queue.processing && <div style={{ color: "#dd6b20", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▶ {queue.processing}</div>}
            {queue.queued.length > 0 && <div style={{ color: "#a0aec0" }}>⋯ {queue.queued.length} queued</div>}
          </div>
        )}

        {!node.device && <div style={{ color: "#e53e3e", fontSize: 10, marginTop: 4 }}>unassigned</div>}
        {assigned && !assigned.online && <div style={{ color: "#c05621", fontSize: 10, marginTop: 4 }}>● {assigned.name} offline</div>}
        {/* Live preview (waveform / image / text) is drawn natively by rgui on
            the node body — the inspector holds only the editable controls. */}
      </div>
    </div>
  );
}

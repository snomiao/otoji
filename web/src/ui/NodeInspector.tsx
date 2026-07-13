import React, { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { VideoClipPlayer } from "./VideoClipPlayer";
import { DIFF_STYLES, DEFAULT_DIFF_STYLE } from "../lib/textdiff";
import { DEFAULT_CAMERA_FPS } from "../providers/vision/camera";
import { preselectScreenShare, releaseScreenShare } from "../providers/vision/screen";
import { DETECT_MODELS, DEFAULT_DETECT_MODEL } from "../providers/vision/detect";
import { isPreviewShown, setPreviewShown, subscribePrefs } from "../lib/prefs";
import { samplesToWavBlob, concatSamples } from "../lib/peaks";
import { buildSrt } from "../lib/srt";
import { MonacoText } from "./MonacoText";

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

// Full-bleed cards (textarea / screen-share): the overlay covers the whole
// node, so the card paints its own title bar where rgui's canvas title sits
// (same 26px header, same bold-13 source-orange), keeping the node readable
// while the content runs edge to edge. The bar background is click-through —
// rgui forwards it to the canvas, so it doubles as the drag handle it covers.
const bar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, height: 26, flex: "0 0 auto",
  padding: "0 8px 0 10px", boxSizing: "border-box", borderRadius: "8px 8px 0 0",
};
const barTitle: React.CSSProperties = {
  color: "#e07a3f", fontWeight: 700, fontSize: 13,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "0 1 auto",
};

const DEFAULT_LLM_AGENT_MODEL = "Xenova/flan-t5-small";
const TEXT2TEXT_MODEL_OPTIONS = [
  { id: "Xenova/flan-t5-small", label: "FLAN-T5 small · default / light" },
  { id: "Xenova/flan-t5-base", label: "FLAN-T5 base · better, heavier" },
  { id: "Xenova/t5-small", label: "T5 small · compact text2text" },
  { id: "Xenova/t5-base", label: "T5 base · heavier text2text" },
  { id: "Xenova/mt5-small", label: "mT5 small · multilingual" },
] as const;
const MODEL_OPTIONS: Partial<Record<string, readonly { id: string; label: string }[]>> = {
  text2text: TEXT2TEXT_MODEL_OPTIONS,
  "text-generation": [
    { id: "onnx-community/gemma-3-1b-it-ONNX", label: "Gemma 3 1B IT ONNX · browser text-generation" },
    { id: "onnx-community/gemma-3-1b-it-ONNX-GQA", label: "Gemma 3 1B IT GQA ONNX · smaller KV cache" },
    { id: "huggingworld/gemma-3-270m-it-ONNX", label: "Gemma 3 270M IT ONNX · tiny" },
    { id: "onnx-community/gemma-2-2b-jpn-it", label: "Gemma 2 2B Japanese IT · heavier" },
    { id: "HuggingFaceTB/SmolLM2-135M-Instruct", label: "SmolLM2 135M Instruct · very light" },
    { id: "HuggingFaceTB/SmolLM2-360M-Instruct", label: "SmolLM2 360M Instruct · light" },
    { id: "HuggingFaceTB/SmolLM2-1.7B-Instruct", label: "SmolLM2 1.7B Instruct · heavier" },
    { id: "onnx-community/Qwen2.5-0.5B-Instruct", label: "Qwen2.5 0.5B Instruct ONNX" },
    { id: "onnx-community/Llama-3.2-1B-Instruct-ONNX", label: "Llama 3.2 1B Instruct ONNX" },
    { id: "onnx-community/tiny-gpt2-ONNX", label: "tiny GPT-2 ONNX · smoke test" },
  ],
  asr: [
    { id: "Xenova/whisper-tiny", label: "Whisper tiny · light" },
    { id: "Xenova/whisper-tiny.en", label: "Whisper tiny.en · English light" },
    { id: "Xenova/whisper-base", label: "Whisper base · heavier" },
    { id: "distil-whisper/distil-large-v3.5-ONNX", label: "Distil Whisper large v3.5 ONNX · heavy" },
    { id: "onnx-community/kotoba-whisper-v2.2-ONNX", label: "Kotoba Whisper v2.2 ONNX · Japanese" },
  ],
  translation: [
    { id: "Xenova/nllb-200-distilled-600M", label: "NLLB 200 distilled 600M · multilingual" },
    { id: "Xenova/opus-mt-ja-en", label: "OPUS MT ja-en" },
    { id: "Xenova/opus-mt-en-jap", label: "OPUS MT en-ja" },
  ],
  tts: [
    { id: "Xenova/speecht5_tts", label: "SpeechT5 TTS" },
    { id: "onnx-community/Kokoro-82M-v1.0-ONNX", label: "Kokoro 82M ONNX · popular" },
    { id: "onnx-community/Supertonic-TTS-ONNX", label: "Supertonic TTS ONNX" },
  ],
};
const DEFAULT_LLM_AGENT_INSTRUCTION =
  "You are an assistant watching a shared screen and listening to its audio. Summarize what changed, answer any spoken request, and keep the response concise.";
const DEFAULT_OCR_FILTER_INSTRUCTION =
  "Clean noisy OCR into human-readable text in stable top-to-bottom reading order. Keep meaningful visible content and important numbers/names. Remove duplicated lines, OCR gibberish, browser/navigation clutter, and random fragments. Do not summarize or add commentary. Output plain text only.";

type DisplayMode = "full-bleed" | "fit" | "stack";
function displayModeOf(config: Record<string, unknown> | undefined): DisplayMode {
  const mode = config?.displayMode;
  return mode === "fit" || mode === "stack" || mode === "full-bleed" ? mode : "full-bleed";
}

function modelOptionsFor(task: string | undefined) {
  return MODEL_OPTIONS[task ?? "text2text"] ?? TEXT2TEXT_MODEL_OPTIONS;
}

function defaultModelForTask(task: string | undefined) {
  return modelOptionsFor(task)[0]?.id ?? DEFAULT_LLM_AGENT_MODEL;
}

function ModelRepoInput({
  value,
  listId,
  placeholder = DEFAULT_LLM_AGENT_MODEL,
  task = "text2text",
  onCommit,
}: {
  value: string | undefined;
  listId: string;
  placeholder?: string;
  task?: string;
  onCommit: (model: string | undefined) => void;
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        defaultValue={value ?? DEFAULT_LLM_AGENT_MODEL}
        placeholder={placeholder}
        spellCheck={false}
        onBlur={(e) => onCommit(e.target.value.trim() || undefined)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box" }}
      />
      <datalist id={listId}>
        {modelOptionsFor(task).map((m) => <option key={m.id} value={m.id} label={m.label} />)}
      </datalist>
    </>
  );
}

export interface InspectorNode {
  id: string;
  voiceType: NodeType;
  device: string | null;
  config?: Record<string, unknown>;
}

export function NodeInspector({ node, controls = true, onClose }: { node: InspectorNode; controls?: boolean; onClose?: () => void }) {
  const { devices, myDeviceId, onAssign, onConfig, onDelete, getRecords, getVideoClips, getVideoClip, spawnVideoClipNode, clearRecords, clearVideoClips, setFile, counts, live, trackerState } =
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
  const shown = useSyncExternalStore(subscribePrefs, () => isPreviewShown(id, true));
  const [cmdCopied, setCmdCopied] = useState(false);
  const [trackerErr, setTrackerErr] = useState<string | null>(null);

  const provider = (config?.provider as string | undefined) ?? DEFAULT_TRANSLATE_PROVIDER;
  const task = (config?.task as string | undefined) ?? "detect";
  const displayMode = displayModeOf(config);
  const text2textModelListId = `text2text-models-${id}`;

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

  const deviceSel = (style: React.CSSProperties) => (
    <select value={node.device ?? ""} onChange={(e) => onAssign(id, e.target.value || null)} style={style} title="run on device">
      <option value="">(unassigned)</option>
      {assigned && !devices.some((x) => x.deviceId === node.device) && <option value={node.device!}>offline device</option>}
      {devices.map((x) => (
        <option key={x.deviceId} value={x.deviceId}>{x.name}{x.me ? " (me)" : x.online ? "" : " (offline)"}</option>
      ))}
    </select>
  );
  const warn = !node.device ? "unassigned" : assigned && !assigned.online ? `● ${assigned.name} offline` : null;
  const warnColor = !node.device ? "#e53e3e" : "#c05621";

  // ---- full-bleed cards: content fills the node rect, no padding ----------
  if (vt === "textarea") {
    const text = (config?.text as string | undefined) ?? "";
    return (
      <div
        className="rgui-node-cfg"
        style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontSize: 12, fontFamily: "system-ui, sans-serif" }}
      >
        {/* opaque bar: the fixed-scale overlay can't track the zoomed canvas
            title, so it replaces it instead of tinting it */}
        <div style={{ ...bar, background: "#2b3036" }}>
          <span style={barTitle}>{spec.label}</span>
          {deviceSel({ fontSize: 11, flex: "0 1 130px", minWidth: 0, marginLeft: "auto" })}
          <button
            style={{ fontSize: 10, cursor: "pointer", flex: "0 0 auto" }}
            title="Re-send the current text downstream"
            onClick={() => onConfig(id, { seq: ((config?.seq as number) ?? 0) + 1 })}
          >▶ resend</button>
        </div>
        <MonacoText
          value={text}
          onCommit={(t) => { if (t !== text) onConfig(id, { text: t }); }}
          style={{ flex: 1, minHeight: 0, height: "auto", border: "none", borderRadius: 0 }}
        />
        {/* control-free strip: hint text, and it keeps the resize grip and a
            drag area reachable under the editor */}
        <div style={{ flex: "0 0 auto", height: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", fontSize: 9, color: "#a0aec0", boxSizing: "border-box" }}>
          <span>⌘/Ctrl+Enter or blur to send</span>
          {warn && <span style={{ color: warnColor }}>{warn}</span>}
        </div>
      </div>
    );
  }

  if (vt === "url") {
    const url = (config?.url as string | undefined) ?? "";
    const advanced = (config?.advancedRender as boolean | undefined) ?? false;
    return (
      <div className="rgui-node-cfg" style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", fontSize: 12, fontFamily: "system-ui, sans-serif", background: "#1c2025", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ ...bar, background: "rgba(28,32,37,0.92)" }}>
          <span style={barTitle}>{spec.label}</span>
          {advanced && (
            <>
              <button type="button" title="Back" onClick={() => { try { (document.getElementById(`url-frame-${id}`) as HTMLIFrameElement | null)?.contentWindow?.history.back(); } catch {} }} style={{ fontSize: 10 }}>‹</button>
              <button type="button" title="Forward" onClick={() => { try { (document.getElementById(`url-frame-${id}`) as HTMLIFrameElement | null)?.contentWindow?.history.forward(); } catch {} }} style={{ fontSize: 10 }}>›</button>
              <button type="button" title="Refresh" onClick={() => { const f = document.getElementById(`url-frame-${id}`) as HTMLIFrameElement | null; if (f) f.src = f.src; }} style={{ fontSize: 10 }}>↻</button>
            </>
          )}
          <input
            type="url"
            defaultValue={url}
            placeholder="https://..."
            onBlur={(e) => onConfig(id, { url: e.target.value.trim() || undefined })}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            style={{ flex: 1, minWidth: 0, fontSize: 11, border: "1px solid rgba(203,213,224,0.45)", borderRadius: 4, background: "rgba(255,255,255,0.95)", color: "#1a202c", padding: "2px 5px" }}
          />
          {deviceSel({ fontSize: 11, flex: "0 1 110px", minWidth: 0 })}
        </div>
        {url ? (
          <iframe
            id={`url-frame-${id}`}
            src={url}
            title={url}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{ flex: 1, width: "100%", border: 0, background: "#fff" }}
          />
        ) : (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#a0aec0", fontSize: 12 }}>drop or paste a URL</div>
        )}
        {warn && <div style={{ position: "absolute", left: 8, bottom: 4, fontSize: 10, color: warnColor, background: "rgba(28,32,37,0.55)", borderRadius: 4, padding: "1px 5px" }}>{warn}</div>}
      </div>
    );
  }

  if (vt === "screen-share" || vt === "camera" || vt === "vision-model" || vt === "depth-field" || vt === "hand-space" || vt === "spatial-renderer" || vt === "image-match") {
    const stacked = displayMode === "stack";
    const pickState = config?.screenPickState as string | undefined;
    const pickError = (config?.screenPickError as string | undefined) ?? "";
    const needsFrontmostWindow = pickState === "error" && /invalid state/i.test(pickError);
    const pickMsg =
      pickState === "opening"
        ? "waiting for picker"
        : pickState === "selected"
          ? "screen selected"
          : pickState === "dismissed"
            ? "picker dismissed"
            : pickState === "error"
              ? needsFrontmostWindow ? "bring window front, retry" : "picker error"
              : "";
    return (
      <div
        className="rgui-node-cfg"
        style={{ position: "relative", width: "100%", height: "100%", fontSize: 12, fontFamily: "system-ui, sans-serif" }}
      >
        <LiveImageFill id={id} mode={displayMode} />
        {(vt === "screen-share" || vt === "camera") && <LiveVideo id={id} mode={displayMode} />}
        {controls && (
          <div style={{ ...bar, position: "absolute", top: 0, left: 0, right: 0, background: stacked ? "#2b3036" : "rgba(28,32,37,0.68)" }}>
            <span style={barTitle}>{spec.label}</span>
            {deviceSel({ fontSize: 11, flex: "0 1 120px", minWidth: 0, marginLeft: "auto" })}
            {(vt === "screen-share" || vt === "camera") && (
              <label
                style={{ display: "flex", alignItems: "center", gap: 3, color: "#a0aec0", fontSize: 10, flex: "0 0 auto" }}
                title={vt === "screen-share" ? "frame grab rate — captured screen audio feeds STT" : "frame grab rate"}
              >
                fps
                <input type="number" min={0.2} max={30} step={0.5} defaultValue={(config?.fps as number) ?? DEFAULT_CAMERA_FPS}
                  onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 11, width: 44 }} />
              </label>
            )}
            {vt === "screen-share" && (
              <button
                type="button"
                title="Choose a different screen, window, or tab"
                onClick={async () => {
                  onConfig(id, { screenPickState: "opening", screenPickError: undefined });
                  try {
                    await preselectScreenShare(id);
                    onConfig(id, { screenPickState: "selected", screenPickError: undefined, reselectionSeq: Date.now() });
                  } catch (e) {
                    releaseScreenShare(id);
                    const name = e instanceof DOMException ? e.name : "";
                    const dismissed = name === "NotAllowedError" || name === "AbortError";
                    onConfig(id, {
                      screenPickState: dismissed ? "dismissed" : "error",
                      screenPickError: e instanceof Error ? e.message : String(e),
                      reselectionSeq: Date.now(),
                    });
                  }
                }}
                style={{ fontSize: 11, border: "1px solid rgba(203,213,224,0.55)", borderRadius: 4, background: "rgba(255,255,255,0.12)", color: "#e6e9ec", cursor: "pointer", padding: "2px 6px", flex: "0 0 auto" }}
              >
                Change
              </button>
            )}
            {vt === "screen-share" && pickMsg && (
              <span style={{ color: pickState === "dismissed" || pickState === "error" ? "#f6ad55" : "#a0aec0", fontSize: 10, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pickMsg}
              </span>
            )}
            {vt === "camera" && (
              <select value={(config?.cameraId as string) ?? ""} onChange={(e) => onConfig(id, { cameraId: e.target.value || undefined })} style={{ fontSize: 11, flex: "0 1 120px", minWidth: 0 }} title="camera device">
                <option value="">(default camera)</option>
                {cameraDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `camera ${dev.deviceId.slice(0, 8)}`}</option>)}
              </select>
            )}
            {vt === "vision-model" && (
              <>
                <select value={task} onChange={(e) => onConfig(id, { task: e.target.value })} style={{ fontSize: 11, flex: "0 1 120px", minWidth: 0 }} title="vision task">
                  <option value="detect">Object detection</option>
                  <option value="depth">Depth map</option>
                  <option value="pose">Pose</option>
                  <option value="hand">Hand</option>
                  <option value="gesture">Hand gesture</option>
                  <option value="spatial-monkey">3D fingertip monkey</option>
                </select>
                {task === "detect" && (
                  <>
                    <select value={(config?.model as string) ?? DEFAULT_DETECT_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={{ fontSize: 11, flex: "0 1 130px", minWidth: 0 }} title="vision model">
                      {DETECT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" min={0.05} max={0.95} step={0.05} defaultValue={(config?.threshold as number) ?? 0.5}
                      title="minimum score"
                      onBlur={(e) => onConfig(id, { threshold: Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.5)) })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      style={{ fontSize: 11, width: 44 }} />
                  </>
                )}
              </>
            )}
            {vt === "image-match" && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 3, color: "#a0aec0", fontSize: 10, flex: "0 0 auto" }} title="minimum match score (0–1)">
                  score
                  <input type="number" min={0.5} max={0.99} step={0.05} defaultValue={(config?.threshold as number) ?? 0.8}
                    onBlur={(e) => onConfig(id, { threshold: Math.min(0.99, Math.max(0.5, Number(e.target.value) || 0.8)) })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ fontSize: 11, width: 44 }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 3, color: "#a0aec0", fontSize: 10, flex: "0 0 auto" }} title="max matches reported">
                  max
                  <input type="number" min={1} max={64} step={1} defaultValue={(config?.maxMatches as number) ?? 16}
                    onBlur={(e) => onConfig(id, { maxMatches: Math.min(64, Math.max(1, Math.round(Number(e.target.value)) || 16)) })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ fontSize: 11, width: 40 }} />
                </label>
              </>
            )}
          </div>
        )}
        {warn && (
          <div style={{ position: "absolute", left: 8, bottom: 4, fontSize: 10, color: warnColor, background: "rgba(28,32,37,0.55)", borderRadius: 4, padding: "1px 5px" }}>
            {warn}
          </div>
        )}
      </div>
    );
  }

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
          {deviceSel(sel)}
        </label>

        {vt === "environment" && (
          <>
            <label style={row}>label:
              <input type="text" defaultValue={(config?.label as string) ?? ""}
                placeholder={assigned?.name ?? "Browser environment"}
                onBlur={(e) => onConfig(id, { label: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={sel} />
            </label>
            <label style={row}>scope:
              <select value={(config?.scope as string) ?? "browser-tab"} onChange={(e) => onConfig(id, { scope: e.target.value })} style={sel}>
                <option value="browser-tab">Browser tab</option>
                <option value="browser-device">Browser device</option>
                <option value="native-device">Native device</option>
                <option value="room">Room shared</option>
              </select>
            </label>
            <label style={row}>runtime:
              <select value={(config?.runtime as string) ?? "browser"} onChange={(e) => onConfig(id, { runtime: e.target.value })} style={sel}>
                <option value="browser">Browser</option>
                <option value="native">Native bridge</option>
                <option value="worker">Worker</option>
                <option value="cloud">Cloud</option>
              </select>
            </label>
            <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: "#718096" }}>
              {(["mic", "camera", "screen", "webgpu", "storage", "network"] as const).map((cap) => (
                <label key={cap} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={(config?.[cap] as boolean | undefined) ?? true}
                    onChange={(e) => onConfig(id, { [cap]: e.target.checked })}
                  />
                  {cap}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#a0aec0", lineHeight: 1.35 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={(config?.deviceId as string | undefined) ?? node.device ?? ""}>device: {(config?.deviceId as string | undefined) ?? node.device ?? "unassigned"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={(config?.url as string | undefined) ?? ""}>url: {(config?.url as string | undefined) ?? "current tab"}</div>
            </div>
          </>
        )}

        {vt === "stt" && (
          <label style={row}>model:
            <select value={(config?.model as string) ?? DEFAULT_SENSEVOICE_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
              {SENSEVOICE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}

        {vt === "model-3d" && (
          <>
            <label style={row}>shape:
              <select value={(config?.primitive as string) ?? "suzanne"} onChange={(e) => onConfig(id, { primitive: e.target.value, url: undefined })} style={sel}>
                <option value="suzanne">Suzanne</option>
                <option value="cube">Cube</option>
                <option value="sphere">Sphere</option>
              </select>
            </label>
            <label style={row}>GLB:
              <input type="url" defaultValue={(config?.url as string) ?? ""} placeholder="https://…/model.glb"
                onBlur={(e) => onConfig(id, { url: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={sel} />
            </label>
            <label style={row}>scale:
              <input type="number" min={0.05} max={10} step={0.05} defaultValue={(config?.scale as number) ?? 1}
                onBlur={(e) => onConfig(id, { scale: Number(e.target.value) || 1 })} style={{ fontSize: 12, width: 60 }} />
            </label>
          </>
        )}

        {vt === "spatial-calibration" && (
          <>
            <label style={row}>near m:
              <input type="number" min={0.05} max={5} step={0.05} defaultValue={(config?.nearMeters as number) ?? 0.2}
                onBlur={(e) => onConfig(id, { nearMeters: Number(e.target.value) || 0.2 })} style={{ fontSize: 12, width: 60 }} />
            </label>
            <label style={row}>far m:
              <input type="number" min={0.1} max={20} step={0.1} defaultValue={(config?.farMeters as number) ?? 2.5}
                onBlur={(e) => onConfig(id, { farMeters: Number(e.target.value) || 2.5 })} style={{ fontSize: 12, width: 60 }} />
            </label>
            <label style={row}>FOV°:
              <input type="number" min={20} max={140} step={1} defaultValue={(config?.fovDegrees as number) ?? 60}
                onBlur={(e) => onConfig(id, { fovDegrees: Number(e.target.value) || 60 })} style={{ fontSize: 12, width: 60 }} />
            </label>
          </>
        )}

        {vt === "rgbd-point-cloud" && (
          <>
            <label style={row}>stride:
              <input type="number" min={2} max={32} step={1} defaultValue={(config?.stride as number) ?? 8}
                onBlur={(e) => onConfig(id, { stride: Math.max(2, Number(e.target.value) || 8) })} style={{ fontSize: 12, width: 60 }} />
            </label>
            <label style={row}>near m:
              <input type="number" min={0.05} max={5} step={0.05} defaultValue={(config?.nearMeters as number) ?? 0.2}
                onBlur={(e) => onConfig(id, { nearMeters: Number(e.target.value) || 0.2 })} style={{ fontSize: 12, width: 60 }} />
            </label>
            <label style={row}>far m:
              <input type="number" min={0.1} max={20} step={0.1} defaultValue={(config?.farMeters as number) ?? 2.5}
                onBlur={(e) => onConfig(id, { farMeters: Number(e.target.value) || 2.5 })} style={{ fontSize: 12, width: 60 }} />
            </label>
          </>
        )}

        {(vt === "translate" || vt === "browser-translate-api") && (
          <>
            <label style={row}>to:
              <select value={(config?.lang as string) ?? DEFAULT_TRANSLATE_LANG} onChange={(e) => onConfig(id, { lang: e.target.value })} style={sel}>
                {TRANSLATE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            {vt === "translate" && (
              <label style={row}>via:
                <select value={provider} onChange={(e) => onConfig(id, { provider: e.target.value })} style={sel}>
                  {TRANSLATE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            {vt === "translate" && provider === "llm" && (
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

        {vt === "text-diff" && (
          <label style={row}>style:
            <select value={(config?.style as string) ?? DEFAULT_DIFF_STYLE} onChange={(e) => onConfig(id, { style: e.target.value })} style={sel}>
              {DIFF_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {vt === "text-normalize" && (
          <>
            <label style={row}>mode:
              <select value={(config?.mode as string) ?? "ocr-stable"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={sel}>
                <option value="ocr-stable">OCR stable lines</option>
                <option value="light">Light cleanup</option>
                <option value="llm-filter">Small LLM filter</option>
              </select>
            </label>
            {config?.mode === "llm-filter" && (
              <>
                <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model:
                  <ModelRepoInput
                    value={config?.model as string | undefined}
                    listId={`${text2textModelListId}-normalize`}
                    task="text2text"
                    onCommit={(model) => onConfig(id, { model })}
                  />
                </label>
                <label style={row}>dtype:
                  <select value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                    {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </label>
                <label style={{ display: "block", color: "#718096", marginTop: 6 }}>filter prompt:
                  <textarea defaultValue={(config?.instruction as string) ?? ""} placeholder={DEFAULT_OCR_FILTER_INSTRUCTION}
                    onBlur={(e) => onConfig(id, { instruction: e.target.value.trim() || undefined })}
                    style={{ fontSize: 12, width: "100%", minHeight: 74, marginTop: 2, boxSizing: "border-box", resize: "vertical", fontFamily: "system-ui, sans-serif" }} />
                </label>
              </>
            )}
          </>
        )}

        {vt === "text-filter" && (
          <>
            <label style={row}>mode:
              <select value={(config?.mode as string) ?? "diff-added"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={sel}>
                <option value="diff-added">diff added only (A)</option>
                <option value="diff-removed">diff removed only (D)</option>
                <option value="regex-keep">regex keep lines</option>
                <option value="regex-drop">regex drop lines</option>
                <option value="regex-replace">regex replace</option>
              </select>
            </label>
            {String(config?.mode ?? "diff-added").startsWith("diff-") && (
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>
                <input type="checkbox" checked={(config?.stripPrefix as boolean | undefined) ?? false} onChange={(e) => onConfig(id, { stripPrefix: e.target.checked })} />
                strip +/- prefix
              </label>
            )}
            {String(config?.mode ?? "").startsWith("regex-") && (
              <>
                <label style={{ display: "block", color: "#718096", marginTop: 6 }}>pattern:
                  <input type="text" defaultValue={(config?.pattern as string) ?? ""} placeholder="regex"
                    onBlur={(e) => onConfig(id, { pattern: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box" }} />
                </label>
                <label style={row}>flags:
                  <input type="text" defaultValue={(config?.flags as string) ?? "i"} placeholder="i"
                    onBlur={(e) => onConfig(id, { flags: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={sel} />
                </label>
                {config?.mode === "regex-replace" && (
                  <label style={{ display: "block", color: "#718096", marginTop: 6 }}>replace:
                    <input type="text" defaultValue={(config?.replace as string) ?? ""}
                      onBlur={(e) => onConfig(id, { replace: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box" }} />
                  </label>
                )}
              </>
            )}
          </>
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
            {(() => {
              const modelTask = (config?.task as string | undefined) ?? "asr";
              return (
                <>
            <label style={row}>task:
              <select
                value={modelTask}
                onChange={(e) => {
                  const nextTask = e.target.value;
                  const current = (config?.model as string | undefined)?.trim();
                  onConfig(id, { task: nextTask, model: current || defaultModelForTask(nextTask) });
                }}
                style={sel}
              >
                {MODEL_TASKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model (HF repo id or URL):
              <ModelRepoInput
                value={config?.model as string | undefined}
                listId={`${text2textModelListId}-generic`}
                task={modelTask}
                placeholder={defaultModelForTask(modelTask)}
                onCommit={(model) => onConfig(id, { model })}
              />
            </label>
                </>
              );
            })()}
            <label style={row}>dtype:
              <select value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </label>
          </>
        )}

        {vt === "llm-agent" && (
          <>
            {(() => {
              const agentTask = ((config?.task as string | undefined) === "text-generation" ? "text-generation" : "text2text");
              return (
                <>
                  <label style={row}>task:
                    <select
                      value={agentTask}
                      onChange={(e) => {
                        const nextTask = e.target.value;
                        const current = (config?.model as string | undefined)?.trim();
                        const wasDefaultish = !current || TEXT2TEXT_MODEL_OPTIONS.some((m) => m.id === current) || modelOptionsFor("text-generation").some((m) => m.id === current);
                        onConfig(id, { task: nextTask, model: wasDefaultish ? defaultModelForTask(nextTask) : current });
                      }}
                      style={sel}
                    >
                      <option value="text2text">Text → Text</option>
                      <option value="text-generation">Text generation (Gemma/SmolLM/Qwen)</option>
                    </select>
                  </label>
                  <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model (HF repo id or URL):
                    <ModelRepoInput
                      value={config?.model as string | undefined}
                      listId={`${text2textModelListId}-agent`}
                      task={agentTask}
                      placeholder={defaultModelForTask(agentTask)}
                      onCommit={(model) => onConfig(id, { model })}
                    />
                  </label>
                </>
              );
            })()}
            <label style={row}>dtype:
              <select value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>system prompt:
              <textarea defaultValue={(config?.instruction as string) ?? ""} placeholder={DEFAULT_LLM_AGENT_INSTRUCTION}
                onBlur={(e) => onConfig(id, { instruction: e.target.value.trim() || undefined })}
                style={{ fontSize: 12, width: "100%", minHeight: 74, marginTop: 2, boxSizing: "border-box", resize: "vertical", fontFamily: "system-ui, sans-serif" }} />
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

        {vt === "video-recorder" && (() => {
          const clips = getVideoClips(id);
          const shownClips = clips.slice(-6).reverse();
          const recording = (config?.recording as boolean | undefined) ?? false;
          return (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => onConfig(id, { recording: !recording })}
                  style={{
                    fontSize: 11,
                    border: "1px solid #cbd5e0",
                    borderRadius: 4,
                    background: recording ? "#fed7d7" : "#fff",
                    color: recording ? "#9b2c2c" : "#2d3748",
                    cursor: "pointer",
                    padding: "3px 8px",
                  }}
                >
                  {recording ? "Stop" : "Record"}
                </button>
                <label style={{ ...row, margin: 0, flex: 1 }}>fps:
                  <input type="number" min={1} max={30} step={1} defaultValue={(config?.fps as number) ?? DEFAULT_CAMERA_FPS}
                    onBlur={(e) => onConfig(id, { fps: Number(e.target.value) || DEFAULT_CAMERA_FPS })}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 11, width: 48 }} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#718096" }}>
                <span>clips ({clips.length})</span>
                {clips.length > 0 && <button style={{ fontSize: 10 }} onClick={() => clearVideoClips?.(id)}>Clear</button>}
              </div>
              {clips.length === 0 ? (
                <div style={{ color: "#a0aec0", fontSize: 11 }}>Pipe image + audio here, then record a clip.</div>
              ) : (
                shownClips.map((clip, i) => (
                  <VideoClipPlayer
                    key={clip.id}
                    clip={clip}
                    index={clips.length - 1 - i}
                    onSpawn={(c) => spawnVideoClipNode?.(id, c)}
                  />
                ))
              )}
            </div>
          );
        })()}

        {vt === "video-clip" && (() => {
          const clipId = config?.clipId as string | undefined;
          const clip = getVideoClip(clipId);
          return (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: "#718096", marginBottom: 4 }}>generated clip source</div>
              {clip ? (
                <VideoClipPlayer clip={clip} index={0} />
              ) : (
                <div style={{ color: "#a0aec0", fontSize: 11 }}>clip missing on this device</div>
              )}
              <button
                type="button"
                disabled={!clipId}
                onClick={() => onConfig(id, { playSeq: Date.now() })}
                style={{ fontSize: 11, marginTop: 6, border: "1px solid #cbd5e0", borderRadius: 4, background: "#fff", cursor: clipId ? "pointer" : "default" }}
              >
                replay to outputs
              </button>
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={(config?.loop as boolean | undefined) ?? false}
                  onChange={(e) => onConfig(id, { loop: e.target.checked })}
                />
                loop output
              </label>
            </div>
          );
        })()}

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
            the node body — the inspector holds only the editable controls, plus
            the <video> live feed for camera/screen nodes (see LiveVideo). */}
      </div>
    </div>
  );
}

/** Live camera/screen preview: a <video> on the node's MediaStream. The
 *  compositor renders it at the stream's native fps off the main thread, so
 *  it stays smooth regardless of the pipeline's grab rate; the canvas body
 *  draw skips its bitmap while this is visible. Inline (camera): sized to sit
 *  in the node's bottom preview strip. `fill` (screen-share): covers the whole
 *  node rect behind the card's title bar — the node IS the monitor. */
function LiveVideo({ id, mode }: { id: string; mode: DisplayMode }) {
  const { live } = useContext(GraphContext);
  const stream = useSyncExternalStore(
    useCallback((cb: () => void) => live.subscribe(id, cb), [live, id]),
    () => live.getMedia(id) ?? null,
  );
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  const style: React.CSSProperties =
    mode === "stack"
      ? { position: "absolute", left: 0, right: 0, top: 26, bottom: 0, width: "100%", height: "calc(100% - 26px)", objectFit: "contain", background: "#1c2025", borderRadius: "0 0 8px 8px" }
      : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: mode === "fit" ? "contain" : "cover", background: "#1c2025", borderRadius: 8 };
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={style}
    />
  );
}

function LiveImageFill({ id, mode }: { id: string; mode: DisplayMode }) {
  const { live } = useContext(GraphContext);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#1c2025";
        ctx.fillRect(0, 0, w, h);
        const img = live.getImage(id);
        if (img?.width && img.height) {
          const top = mode === "stack" ? 26 : 0;
          const availH = Math.max(1, h - top);
          const s = mode === "full-bleed" ? Math.max(w / img.width, availH / img.height) : Math.min(w / img.width, availH / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          try {
            ctx.drawImage(img, (w - dw) / 2, top + (availH - dh) / 2, dw, dh);
          } catch {
            /* bitmap was closed between get and draw */
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, id, mode]);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", background: "#1c2025", borderRadius: 8 }} />;
}

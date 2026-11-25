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
import { DEFAULT_GDOC_LIVE_SERVER } from "../providers/text/google-doc";
import { DEFAULT_VIBEVOICE_MLX_MODEL, DEFAULT_VIBEVOICE_SERVER, DEFAULT_VIBEVOICE_VLLM_MODEL } from "../providers/stt/vibevoice";
import { DEFAULT_TRANSLATE_PROMPT_TEMPLATE, listWebLlmModels } from "../providers/translate/webllm";
import { useNodeLive } from "./useNodeLive";
import { RecordingPlayer } from "./RecordingPlayer";
import { VideoClipPlayer } from "./VideoClipPlayer";
import { DIFF_STYLES, DEFAULT_DIFF_STYLE } from "../lib/textdiff";
import { DEFAULT_CAMERA_FPS } from "../providers/vision/camera";
import { preselectScreenShare, releaseScreenShare } from "../providers/vision/screen";
import { DETECT_MODELS, DEFAULT_DETECT_MODEL } from "../providers/vision/detect";
import { DEFAULT_QWEN_IMAGE_MODEL, DEFAULT_QWEN_IMAGE_SERVER, qwenImageHardwareHint } from "../providers/vision/qwen-image";
import {
  searchModelSources,
  type ModelFormat,
  type ModelRuntime,
  type ModelSearchFilters,
  type ModelSearchResult,
  type ModelSourceProvider,
  type ModelTaskGroup,
} from "../providers/model/model-source";
import { isPreviewShown, setPreviewShown, subscribePrefs } from "../lib/prefs";
import { samplesToWavBlob, concatSamples } from "../lib/peaks";
import { buildSrt } from "../lib/srt";
import { MonacoText } from "./MonacoText";
import { EnumOmnibox, SelectOmnibox, type EnumOption } from "./EnumOmnibox";
import { canHostNode } from "../lib/device-role";

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

function AudioSeedPreview({ nodeId, fallbackUrl, fileKey }: { nodeId: string; fallbackUrl?: string; fileKey?: string }) {
  const [src, setSrc] = useState(fallbackUrl ?? "");
  useEffect(() => {
    const file = fileStore.get(nodeId)?.file;
    if (!file) { setSrc(fallbackUrl ?? ""); return; }
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [nodeId, fallbackUrl, fileKey]);
  if (!src) return null;
  return <audio src={src} controls preload="metadata" style={{ width: "100%", height: 30, marginTop: 5 }} />;
}

function WebLlmModelOmnibox({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const fallback = TRANSLATE_MODELS.map((model) => ({ value: model.id, label: `${model.name} · ${model.size}`, keywords: model.id }));
  const [options, setOptions] = useState<EnumOption[]>(fallback);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    listWebLlmModels().then((models) => {
      if (!active) return;
      setOptions(models.map((model) => ({ value: model.id, label: model.label, keywords: model.keywords })));
      setStatus("ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);
  const all = options.some((option) => option.value === value) ? options : [{ value, label: value }, ...options];
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <EnumOmnibox value={value} options={all} onChange={onChange} disabled={disabled} ariaLabel="WebLLM model" title={disabled ? "Controlled by connected Model provider" : "Search every model in WebLLM prebuiltAppConfig.model_list"} />
      <div style={{ marginTop: 2, fontSize: 9, color: status === "error" ? "#c53030" : "#a0aec0" }}>
        {status === "loading" ? "loading supported model catalog…" : status === "error" ? "catalog unavailable · showing curated fallback" : `${options.length} WebLLM models`}
      </div>
    </div>
  );
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
  "image-to-text": [
    { id: "Xenova/vit-gpt2-image-captioning", label: "ViT-GPT2 image captioning · browser ONNX" },
    { id: "onnx-community/Florence-2-base-ft", label: "Florence 2 base FT · browser ONNX" },
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

const MODEL_FORMAT_OPTIONS: EnumOption[] = [
  { value: "any", label: "Any format" }, { value: "onnx", label: "ONNX" },
  { value: "gguf", label: "GGUF" }, { value: "safetensors", label: "Safetensors" },
  { value: "diffusers", label: "Diffusers" }, { value: "mlx", label: "MLX" }, { value: "mlc", label: "MLC (WebLLM)" },
];
const MODEL_RUNTIME_OPTIONS: EnumOption[] = [
  { value: "any", label: "Any runtime" }, { value: "browser", label: "Browser", keywords: "web wasm webgpu transformers.js" },
  { value: "mlx", label: "MLX", keywords: "apple silicon" }, { value: "llama.cpp", label: "llama.cpp", keywords: "gguf" },
  { value: "diffusers", label: "Diffusers/CUDA", keywords: "python gpu" }, { value: "remote", label: "Remote API" },
];
const MODEL_TASK_OPTIONS: EnumOption[] = [
  { value: "any", label: "Any task" }, { value: "text", label: "Text" }, { value: "asr", label: "ASR", keywords: "speech recognition" },
  { value: "tts", label: "TTS", keywords: "speech synthesis" }, { value: "image", label: "Any image gen" },
  { value: "text-to-image", label: "Text → Image", keywords: "text2img t2i generation" },
  { value: "image-to-image", label: "Image → Image", keywords: "img2img edit" },
  { value: "image-to-text", label: "Image → Text", keywords: "caption image2text" },
  { value: "vision", label: "Vision" },
];
const MODEL_PROVIDER_OPTIONS: EnumOption[] = [
  { value: "webllm", label: "WebLLM", keywords: "MLC WebGPU browser" },
  { value: "huggingface", label: "Hugging Face", keywords: "hf" },
  { value: "civitai", label: "Civitai" },
  { value: "url", label: "Direct URL" },
];

function ModelRepoInput({
  value,
  listId,
  placeholder = DEFAULT_LLM_AGENT_MODEL,
  task = "text2text",
  onCommit,
  disabled = false,
  controlledValue,
}: {
  value: string | undefined;
  listId: string;
  placeholder?: string;
  task?: string;
  onCommit: (model: string | undefined) => void;
  disabled?: boolean;
  controlledValue?: string;
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        {...(disabled
          ? { value: controlledValue ?? value ?? DEFAULT_LLM_AGENT_MODEL, readOnly: true }
          : { defaultValue: value ?? DEFAULT_LLM_AGENT_MODEL })}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        aria-readonly={disabled}
        title={disabled ? "Controlled by connected Model provider" : undefined}
        onBlur={(e) => onCommit(e.target.value.trim() || undefined)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box", ...(disabled ? { opacity: 1, color: "#4a5568", background: "#edf2f7", borderColor: "#4299e1", boxShadow: "inset 3px 0 0 #3182ce", cursor: "not-allowed" } : {}) }}
      />
      <datalist id={listId}>
        {modelOptionsFor(task).map((m) => <option key={m.id} value={m.id} label={m.label} />)}
      </datalist>
    </>
  );
}

function ModelSourceOmnibox({
  provider,
  value,
  onCommit,
  filters,
  onFilters,
}: {
  provider: ModelSourceProvider;
  value?: string;
  onCommit: (ref: string | undefined) => void;
  filters: ModelSearchFilters;
  onFilters: (filters: ModelSearchFilters) => void;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [results, setResults] = useState<ModelSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const suppressBlurCommit = useRef(false);

  useEffect(() => {
    setQuery(value ?? "");
    setResults([]);
    setActive(0);
  }, [provider, value]);

  useEffect(() => {
    const q = query.trim();
    if (!open || provider === "url" || q.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = window.setTimeout(() => {
      searchModelSources(provider, q, { signal: controller.signal, limit: 8, filters })
        .then((next) => {
          setResults(next);
          setActive(0);
          setStatus("idle");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
          setStatus("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, provider, query, filters.format, filters.runtime, filters.task]);

  const pick = (result: ModelSearchResult) => {
    setQuery(result.ref);
    setResults([]);
    setOpen(false);
    onCommit(result.ref);
  };
  const commitDraft = () => {
    const ref = query.trim();
    setOpen(false);
    onCommit(ref || undefined);
  };
  const isCompleteRef = (ref: string) => {
    if (!ref) return true;
    if (provider === "url") return true;
    if (/^https?:\/\//i.test(ref)) return true;
    return provider === "huggingface" && /^[^/\s]+\/[^/\s]+$/.test(ref);
  };
  const placeholder = provider === "civitai"
    ? "Search Civitai models"
    : provider === "url"
      ? "https://.../model.safetensors"
      : "Search Hugging Face models";

  return (
    <div style={{ position: "relative", marginTop: 2 }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          if (suppressBlurCommit.current) {
            suppressBlurCommit.current = false;
            return;
          }
          const ref = query.trim();
          if (isCompleteRef(ref)) onCommit(ref || undefined);
          else setQuery(value ?? "");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && results.length) {
            e.preventDefault();
            setActive((index) => Math.min(results.length - 1, index + 1));
          } else if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const result = results[active];
            if (result) pick(result);
            else commitDraft();
          } else if (e.key === "Escape") {
            e.preventDefault();
            suppressBlurCommit.current = true;
            setQuery(value ?? "");
            setOpen(false);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        style={{ fontSize: 12, width: "100%", boxSizing: "border-box" }}
      />
      {provider !== "url" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 3, marginTop: 4 }}>
          <EnumOmnibox ariaLabel="Model format" title="Artifact format" value={filters.format ?? "any"} options={MODEL_FORMAT_OPTIONS}
            onChange={(value) => onFilters({ ...filters, format: value as ModelFormat | "any" })} inputStyle={{ fontSize: 9.5 }} />
          <EnumOmnibox ariaLabel="Model runtime" title="Compatible runtime (inferred from repository metadata)" value={filters.runtime ?? "any"} options={MODEL_RUNTIME_OPTIONS}
            onChange={(value) => onFilters({ ...filters, runtime: value as ModelRuntime | "any" })} inputStyle={{ fontSize: 9.5 }} />
          <EnumOmnibox ariaLabel="Model compatibility" title="Compatible Otoji task" value={filters.task ?? "any"} options={MODEL_TASK_OPTIONS}
            onChange={(value) => onFilters({ ...filters, task: value as ModelTaskGroup | "any" })} inputStyle={{ fontSize: 9.5 }} />
        </div>
      )}
      {open && provider !== "url" && query.trim().length >= 2 && (
        <div style={{ marginTop: 3, maxHeight: 132, overflowY: "auto", border: "1px solid #4a5568", borderRadius: 4, background: "#1f252c" }}>
          {status === "loading" && results.length === 0 && (
            <div style={{ fontSize: 10, color: "#a0aec0", padding: "6px 7px" }}>searching…</div>
          )}
          {status === "error" && (
            <div style={{ fontSize: 10, color: "#fc8181", padding: "6px 7px" }}>search unavailable</div>
          )}
          {status === "idle" && results.length === 0 && (
            <div style={{ fontSize: 10, color: "#a0aec0", padding: "6px 7px" }}>no models found</div>
          )}
          {results.map((result, index) => (
            <button
              key={`${result.provider}:${result.id}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(result)}
              style={{ display: "block", width: "100%", padding: "5px 7px", border: 0, borderRadius: 0, cursor: "pointer", textAlign: "left", background: index === active ? "#34404d" : "transparent", color: "#edf2f7" }}
            >
              <span style={{ display: "block", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.title}</span>
              {result.detail && <span style={{ display: "block", fontSize: 9.5, color: "#a0aec0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface InspectorNode {
  id: string;
  voiceType: NodeType;
  device: string | null;
  config?: Record<string, unknown>;
  connectedInputs?: string[];
  controlledModel?: string;
  controlledBackend?: "webllm" | "transformers";
}

export function NodeInspector({ node, controls = true, onClose }: { node: InspectorNode; controls?: boolean; onClose?: () => void }) {
  const { devices, myDeviceId, onAssign, onConfig, onDelete, getRecords, getVideoClips, getVideoClip, spawnVideoClipNode, clearRecords, clearVideoClips, setFile, replayNode, counts, live, trackerState } =
    useContext(GraphContext);
  const id = node.id;
  const vt = node.voiceType;
  const spec = NODE_SPECS[vt];
  const config = node.config;
  const modelInputConnected = node.connectedInputs?.includes("model") ?? false;
  const controlledModel = node.controlledModel?.trim();
  const controlledBackend = node.controlledBackend;
  const readonlyModelStyle = modelInputConnected
    ? { opacity: 1, color: "#4a5568", background: "#edf2f7", borderColor: "#4299e1", boxShadow: "inset 3px 0 0 #3182ce", cursor: "not-allowed" }
    : {};
  const fileName = config?.file as string | undefined;
  const assigned = devices.find((x) => x.deviceId === node.device);
  const count = counts[id] ?? 0;
  const { queue, texts } = useNodeLive(live, id);
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
    <SelectOmnibox value={node.device ?? ""} onChange={(e) => onAssign(id, e.target.value || null)} style={style} title="run on device">
      <option value="">(unassigned)</option>
      {assigned && !devices.some((x) => x.deviceId === node.device) && <option value={node.device!}>offline device</option>}
      {devices.map((x) => (
        <option key={x.deviceId} value={x.deviceId}>{x.name}{x.me ? " (me)" : x.online ? "" : " (offline)"}</option>
      ))}
    </SelectOmnibox>
  );
  const warn = !node.device ? "unassigned" : assigned && !assigned.online ? `● ${assigned.name} offline` : null;
  const warnColor = !node.device ? "#e53e3e" : "#c05621";
  const micWarning = assigned && !canHostNode(vt, assigned) ? `● ${assigned.name} reports no microphone` : null;

  // ---- full-bleed cards: content fills the node rect, no padding ----------
  if (vt === "textarea") {
    const configuredText = (config?.text as string | undefined) ?? "";
    const text = texts[0] ?? configuredText;
    const title = (config?.title as string | undefined) ?? spec.label;
    return (
      <div
        className="rgui-node-cfg"
        style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontSize: 12, fontFamily: "system-ui, sans-serif" }}
      >
        {/* opaque bar: the fixed-scale overlay can't track the zoomed canvas
            title, so it replaces it instead of tinting it */}
        <div style={{ ...bar, background: "#2b3036" }}>
          <input
            aria-label="Text node title"
            defaultValue={title}
            onBlur={(event) => onConfig(id, { title: event.target.value.trim() || undefined })}
            onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
            style={{ ...barTitle, minWidth: 56, maxWidth: 150, border: 0, borderBottom: "1px solid #718096", color: "#edf2f7", background: "transparent" }}
          />
          {deviceSel({ fontSize: 11, flex: "0 1 130px", minWidth: 0, marginLeft: "auto" })}
          <button
            style={{ fontSize: 10, cursor: "pointer", flex: "0 0 auto" }}
            title="Re-send the current text downstream"
            onClick={() => replayNode(id)}
          >▶ resend</button>
        </div>
        <MonacoText
          value={text}
          onCommit={(t) => { if (t !== configuredText) onConfig(id, { text: t }); }}
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

  if (vt === "screen-share" || vt === "camera" || vt === "vision-model" || vt === "qwen-image" || vt === "depth-field" || vt === "hand-space" || vt === "spatial-renderer" || vt === "image-match" || vt === "ar-notes") {
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
              <SelectOmnibox value={(config?.cameraId as string) ?? ""} onChange={(e) => onConfig(id, { cameraId: e.target.value || undefined })} style={{ fontSize: 11, flex: "0 1 120px", minWidth: 0 }} title="camera device">
                <option value="">(default camera)</option>
                {cameraDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `camera ${dev.deviceId.slice(0, 8)}`}</option>)}
              </SelectOmnibox>
            )}
            {vt === "vision-model" && (
              <>
                <SelectOmnibox value={task} onChange={(e) => onConfig(id, { task: e.target.value })} style={{ fontSize: 11, flex: "0 1 120px", minWidth: 0 }} title="vision task">
                  <option value="detect">Object detection</option>
                  <option value="depth">Depth map</option>
                  <option value="pose">Pose</option>
                  <option value="hand">Hand</option>
                  <option value="gesture">Hand gesture</option>
                  <option value="spatial-monkey">3D fingertip monkey</option>
                </SelectOmnibox>
                {task === "detect" && (
                  <>
                    <SelectOmnibox value={modelInputConnected && controlledModel ? controlledModel : (config?.model as string) ?? DEFAULT_DETECT_MODEL} disabled={modelInputConnected} aria-readonly={modelInputConnected} onChange={(e) => onConfig(id, { model: e.target.value })} style={{ fontSize: 11, flex: "0 1 130px", minWidth: 0, ...readonlyModelStyle }} title={modelInputConnected ? `Controlled by ${controlledModel ?? "Model provider"}` : "vision model"}>
                      {modelInputConnected && controlledModel && <option value={controlledModel}>{controlledModel}</option>}
                      {DETECT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SelectOmnibox>
                    <input type="number" min={0.05} max={0.95} step={0.05} defaultValue={(config?.threshold as number) ?? 0.5}
                      title="minimum score"
                      onBlur={(e) => onConfig(id, { threshold: Math.min(0.95, Math.max(0.05, Number(e.target.value) || 0.5)) })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      style={{ fontSize: 11, width: 44 }} />
                  </>
                )}
              </>
            )}
            {vt === "qwen-image" && (
              <>
                <SelectOmnibox value={(config?.mode as string) ?? "generate"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={{ fontSize: 11, flex: "0 1 92px", minWidth: 0 }} title="generation mode">
                  <option value="generate">generate</option>
                  <option value="edit">edit</option>
                </SelectOmnibox>
                <input type="number" min={256} max={2048} step={64} defaultValue={(config?.width as number) ?? 1024}
                  title="output width"
                  onBlur={(e) => onConfig(id, { width: Math.max(256, Math.min(2048, Number(e.target.value) || 1024)) })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 11, width: 50 }} />
                <input type="number" min={256} max={2048} step={64} defaultValue={(config?.height as number) ?? 1024}
                  title="output height"
                  onBlur={(e) => onConfig(id, { height: Math.max(256, Math.min(2048, Number(e.target.value) || 1024)) })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 11, width: 50 }} />
              </>
            )}
            {vt === "ar-notes" && (
              <>
                <input type="text" defaultValue={(config?.text as string) ?? ""} placeholder="📌 note text"
                  title="text placed on the next pinch"
                  onBlur={(e) => onConfig(id, { text: e.target.value.trim() || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 11, flex: 1, minWidth: 60 }} />
                <button type="button" style={{ fontSize: 10, flex: "0 0 auto" }}
                  title={`remove all ${(Array.isArray(config?.notes) ? (config!.notes as unknown[]).length : 0)} notes`}
                  onClick={() => onConfig(id, { notes: [], notesSeq: Date.now() })}>
                  clear
                </button>
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
        {controls && vt === "qwen-image" && (
          <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, display: "grid", gap: 4, padding: 6, background: "rgba(28,32,37,0.72)", border: "1px solid rgba(203,213,224,0.24)", borderRadius: 6, color: "#e6e9ec" }}>
            <textarea defaultValue={(config?.prompt as string) ?? ""} placeholder="prompt, or wire transcript into prompt"
              onBlur={(e) => onConfig(id, { prompt: e.target.value.trim() || undefined, promptSeq: Date.now() })}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.target as HTMLTextAreaElement).blur(); }}
              style={{ fontSize: 11, minHeight: 44, resize: "vertical", border: "1px solid rgba(203,213,224,0.38)", borderRadius: 4, background: "rgba(255,255,255,0.9)", color: "#1a202c", boxSizing: "border-box", width: "100%" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 76px 70px", gap: 4, alignItems: "center" }}>
              <input type="url" defaultValue={(config?.serverUrl as string) ?? DEFAULT_QWEN_IMAGE_SERVER} placeholder={DEFAULT_QWEN_IMAGE_SERVER}
                title="Qwen Image runner URL"
                onBlur={(e) => onConfig(id, { serverUrl: e.target.value.trim() || undefined })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 10, minWidth: 0, border: "1px solid rgba(203,213,224,0.38)", borderRadius: 4, padding: "2px 4px" }} />
              <input type="number" min={1} max={80} step={1} defaultValue={(config?.steps as number) ?? 20}
                title="inference steps"
                onBlur={(e) => onConfig(id, { steps: Math.max(1, Math.min(80, Math.round(Number(e.target.value)) || 20)) })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 10, minWidth: 0, border: "1px solid rgba(203,213,224,0.38)", borderRadius: 4, padding: "2px 4px" }} />
              <label style={{ display: "flex", alignItems: "center", gap: 3, color: "#cbd5e0", fontSize: 10 }}>
                <input type="checkbox" checked={(config?.autoRun as boolean | undefined) !== false} onChange={(e) => onConfig(id, { autoRun: e.target.checked })} />
                auto
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, alignItems: "center" }}>
              <SelectOmnibox value={(config?.backend as string) ?? "diffusers"} onChange={(e) => onConfig(id, { backend: e.target.value })} title="runner backend" style={{ minWidth: 0 }}>
                <option value="diffusers">Diffusers</option>
                <option value="diffsynth">DiffSynth</option>
                <option value="mlx">MLX</option>
                <option value="gguf">GGUF</option>
                <option value="remote">Remote API</option>
              </SelectOmnibox>
              <label style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, fontSize: 10, color: "#cbd5e0" }}>
                strength
                <input type="number" min={0} max={1} step={0.05} defaultValue={(config?.strength as number) ?? 0.75}
                  onBlur={(e) => onConfig(id, { strength: Math.max(0, Math.min(1, Number(e.target.value) || 0.75)) })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 10, width: 48, minWidth: 0, boxSizing: "border-box" }} />
              </label>
            </div>
            <input type="text" {...(modelInputConnected ? { value: controlledModel ?? (config?.model as string) ?? DEFAULT_QWEN_IMAGE_MODEL, readOnly: true } : { defaultValue: (config?.model as string) ?? DEFAULT_QWEN_IMAGE_MODEL })} placeholder={DEFAULT_QWEN_IMAGE_MODEL}
              disabled={modelInputConnected} aria-readonly={modelInputConnected}
              title={modelInputConnected ? "Controlled by connected Model provider" : qwenImageHardwareHint((config?.backend as string | undefined) ?? "diffusers")}
              onBlur={(e) => onConfig(id, { model: e.target.value.trim() || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ fontSize: 10, minWidth: 0, border: "1px solid rgba(203,213,224,0.38)", borderRadius: 4, padding: "2px 4px", ...readonlyModelStyle }} />
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
      // Fill the node's width (the rgui overlay wrapper is exactly the node
      // rect); 190 is only a floor so controls stay usable on tiny nodes.
      style={{ width: "100%", minWidth: 190, boxSizing: "border-box", fontSize: 12, fontFamily: "system-ui, sans-serif" }}
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
              <SelectOmnibox value={(config?.scope as string) ?? "browser-tab"} onChange={(e) => onConfig(id, { scope: e.target.value })} style={sel}>
                <option value="browser-tab">Browser tab</option>
                <option value="browser-device">Browser device</option>
                <option value="native-device">Native device</option>
                <option value="room">Room shared</option>
              </SelectOmnibox>
            </label>
            <label style={row}>runtime:
              <SelectOmnibox value={(config?.runtime as string) ?? "browser"} onChange={(e) => onConfig(id, { runtime: e.target.value })} style={sel}>
                <option value="browser">Browser</option>
                <option value="native">Native bridge</option>
                <option value="worker">Worker</option>
                <option value="cloud">Cloud</option>
              </SelectOmnibox>
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
          <>
            <label style={row}>browser model:
            <SelectOmnibox value={modelInputConnected && controlledModel ? controlledModel : (config?.model as string) ?? DEFAULT_SENSEVOICE_MODEL} disabled={modelInputConnected} aria-readonly={modelInputConnected} title={modelInputConnected ? `Controlled by ${controlledModel ?? "Model provider"}` : undefined} onChange={(e) => onConfig(id, { model: e.target.value })} style={{ ...sel, ...readonlyModelStyle }}>
              {modelInputConnected && controlledModel && <option value={controlledModel}>{controlledModel}</option>}
                {SENSEVOICE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </SelectOmnibox>
            </label>
            <div style={{ fontSize: 9.5, color: modelInputConnected ? "#3182ce" : "#a0aec0", marginTop: 2 }}>{modelInputConnected ? "Provider-controlled · disconnect model input to edit" : "Fallback until a Model provider is connected."}</div>
          </>
        )}

        {vt === "model-3d" && (
          <>
            <label style={row}>shape:
              <SelectOmnibox value={(config?.primitive as string) ?? "suzanne"} onChange={(e) => onConfig(id, { primitive: e.target.value, url: undefined })} style={sel}>
                <option value="suzanne">Suzanne</option>
                <option value="cube">Cube</option>
                <option value="sphere">Sphere</option>
              </SelectOmnibox>
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
              <SelectOmnibox value={(config?.lang as string) ?? DEFAULT_TRANSLATE_LANG} onChange={(e) => onConfig(id, { lang: e.target.value })} style={sel}>
                {TRANSLATE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </SelectOmnibox>
            </label>
            {vt === "translate" && (
              <label style={row}>via:
                <SelectOmnibox value={provider} onChange={(e) => onConfig(id, { provider: e.target.value })} style={sel}>
                  {TRANSLATE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SelectOmnibox>
              </label>
            )}
            {vt === "translate" && provider === "llm" && (
              <>
                <label style={row}>model:
                  <SelectOmnibox value={(config?.model as string) ?? DEFAULT_TRANSLATE_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
                    {TRANSLATE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size}</option>)}
                  </SelectOmnibox>
                </label>
                <label style={{ display: "block", color: "#718096", marginTop: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    prompt template:
                    {(config?.promptTemplate as string | undefined)?.trim() && (
                      <button type="button" title="Reset translation prompt template" onClick={() => onConfig(id, { promptTemplate: undefined })} style={{ fontSize: 9, padding: "1px 4px" }}>Reset</button>
                    )}
                  </span>
                  <textarea
                    key={(config?.promptTemplate as string | undefined) ?? "__default_translate_prompt__"}
                    defaultValue={(config?.promptTemplate as string | undefined) ?? DEFAULT_TRANSLATE_PROMPT_TEMPLATE}
                    title="Available placeholders: {text}, {source_language}, {target_language}"
                    onBlur={(e) => onConfig(id, { promptTemplate: e.target.value.trim() || undefined })}
                    style={{ fontSize: 10, width: "100%", minHeight: 112, marginTop: 2, boxSizing: "border-box", resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  />
                </label>
              </>
            )}
          </>
        )}

        {(vt === "mic-vad" || vt === "mic-raw") && (
          <>
            <label style={row}>mic:
              <SelectOmnibox value={(config?.inputDeviceId as string) ?? ""} onChange={(e) => onConfig(id, { inputDeviceId: e.target.value || undefined })} style={sel}>
                <option value="">(default mic)</option>
                {inputDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `mic ${dev.deviceId.slice(0, 8)}`}</option>)}
              </SelectOmnibox>
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
            <SelectOmnibox value={(config?.sinkId as string) ?? ""} onChange={(e) => onConfig(id, { sinkId: e.target.value || undefined })} style={sel}>
              <option value="">(default speaker)</option>
              {outputDevices.map((dev) => <option key={dev.deviceId} value={dev.deviceId}>{dev.label || `speaker ${dev.deviceId.slice(0, 8)}`}</option>)}
            </SelectOmnibox>
          </label>
        )}

        {vt === "tts" && (
          <>
            <label style={row}>voice:
              <SelectOmnibox value={(config?.voice as string) ?? AUTO_TTS_VOICE} onChange={(e) => onConfig(id, { voice: e.target.value })} style={sel}>
                <option value={AUTO_TTS_VOICE}>Auto (match language)</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
              </SelectOmnibox>
            </label>
            <label style={row}>rate:
              <SelectOmnibox value={String((config?.rate as number) ?? 1)} onChange={(e) => onConfig(id, { rate: Number(e.target.value) })} style={sel}>
                {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
              </SelectOmnibox>
            </label>
          </>
        )}

        {vt === "tts-model" && (
          <label style={row}>model:
            <SelectOmnibox value={modelInputConnected && controlledModel ? controlledModel : (config?.model as string) ?? AUTO_TTS_MODEL} disabled={modelInputConnected} aria-readonly={modelInputConnected} title={modelInputConnected ? `Controlled by ${controlledModel ?? "Model provider"}` : undefined} onChange={(e) => onConfig(id, { model: e.target.value })} style={{ ...sel, ...readonlyModelStyle }}>
              {modelInputConnected && controlledModel && <option value={controlledModel}>{controlledModel}</option>}
              <option value={AUTO_TTS_MODEL}>Auto (match language)</option>
              {NEURAL_TTS_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </SelectOmnibox>
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
            <SelectOmnibox value={(config?.style as string) ?? DEFAULT_DIFF_STYLE} onChange={(e) => onConfig(id, { style: e.target.value })} style={sel}>
              {DIFF_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectOmnibox>
          </label>
        )}

        {vt === "text-normalize" && (
          <>
            <label style={row}>mode:
              <SelectOmnibox value={(config?.mode as string) ?? "ocr-stable"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={sel}>
                <option value="ocr-stable">OCR stable lines</option>
                <option value="light">Light cleanup</option>
                <option value="llm-filter">Small LLM filter</option>
              </SelectOmnibox>
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
                  <SelectOmnibox value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                    {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
                  </SelectOmnibox>
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
              <SelectOmnibox value={(config?.mode as string) ?? "diff-added"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={sel}>
                <option value="diff-added">diff added only (A)</option>
                <option value="diff-removed">diff removed only (D)</option>
                <option value="regex-keep">regex keep lines</option>
                <option value="regex-drop">regex drop lines</option>
                <option value="regex-replace">regex replace</option>
                <option value="wake">🎙 wake word gate</option>
              </SelectOmnibox>
            </label>
            {String(config?.mode ?? "diff-added").startsWith("diff-") && (
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>
                <input type="checkbox" checked={(config?.stripPrefix as boolean | undefined) ?? false} onChange={(e) => onConfig(id, { stripPrefix: e.target.checked })} />
                strip +/- prefix
              </label>
            )}
            {config?.mode === "wake" && (
              <label style={{ display: "block", color: "#718096", marginTop: 6 }}>wake words (comma-sep):
                <input type="text" defaultValue={(config?.wakeWords as string) ?? "hey otoji, ok otoji, otoji"} placeholder="hey otoji, ok otoji"
                  onBlur={(e) => onConfig(id, { wakeWords: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 12, width: "100%", marginTop: 2, boxSizing: "border-box" }} />
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
            <SelectOmnibox value={(config?.model as string) ?? DEFAULT_VOSK_MODEL} onChange={(e) => onConfig(id, { model: e.target.value })} style={sel}>
              {VOSK_MODELS.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
            </SelectOmnibox>
          </label>
        )}

        {vt === "wake-word" && (
          <>
            <label style={row}>source:
              <SelectOmnibox value={(config?.source as string) ?? "onnx"} onChange={(e) => onConfig(id, { source: e.target.value })} style={sel}>
                <option value="onnx">openWakeWord (browser)</option>
                <option value="native">native trigger (otoji kws)</option>
              </SelectOmnibox>
            </label>
            {(config?.source ?? "onnx") === "native" ? (
              <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>wire a pipe node fed by <code>otoji kws | otoji node &lt;room&gt;</code> into the trigger port; the mic audio after each wake goes to ASR</div>
            ) : (
            <label style={row}>wake model:
              <input value={(config?.model as string) ?? ""} onChange={(e) => onConfig(id, { model: e.target.value })}
                placeholder="hey_jarvis_v0.1.onnx" spellCheck={false} style={sel} />
            </label>
            )}
            <label style={row}>threshold:
              <input type="number" step="0.05" min="0" max="1" value={(config?.threshold as number | undefined) ?? 0.5}
                onChange={(e) => onConfig(id, { threshold: Number(e.target.value) })} style={sel} />
            </label>
            <label style={row}>capture ms:
              <input type="number" step="500" min="500" value={(config?.captureMs as number | undefined) ?? 3000}
                onChange={(e) => onConfig(id, { captureMs: Number(e.target.value) })} style={sel} />
            </label>
            <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>real on-device KWS — feed Mic (raw); wake opens the audio port for ASR</div>
          </>
        )}

        {vt === "stream-asr" && (
          <>
            <label style={row}>models base:
              <input value={(config?.modelsBase as string) ?? ""} onChange={(e) => onConfig(id, { modelsBase: e.target.value })}
                placeholder="default: streaming-zipformer-en int8" spellCheck={false} style={sel} />
            </label>
            <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>true streaming transducer — feed Mic (raw); partials stream live, silence finalizes</div>
          </>
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

        {vt === "google-doc-live" && (
          <>
            <label style={row}>doc:
              <input value={(config?.url as string) ?? ""} onChange={(e) => onConfig(id, { url: e.target.value })}
                placeholder="https://docs.google.com/document/d/..." spellCheck={false} style={sel} />
            </label>
            <label style={row}>mode:
              <SelectOmnibox value={(config?.mode as string) ?? "poll"} onChange={(e) => onConfig(id, { mode: e.target.value })} style={sel}>
                <option value="poll">poll (Docs API)</option>
                <option value="live">live (local bridge)</option>
              </SelectOmnibox>
            </label>
            {((config?.mode as string) ?? "poll") === "poll" ? (
              <>
                <label style={row}>poll ms:
                  <input type="number" min={1000} step={500} value={Number(config?.pollMs ?? 3000)}
                    onChange={(e) => onConfig(id, { pollMs: Number(e.target.value) || 3000 })} style={sel} />
                </label>
                <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>needs Google OAuth Token in settings → keys</div>
              </>
            ) : (
              <>
                <label style={row}>bridge:
                  <input value={(config?.serverUrl as string) ?? DEFAULT_GDOC_LIVE_SERVER} onChange={(e) => onConfig(id, { serverUrl: e.target.value })}
                    placeholder={DEFAULT_GDOC_LIVE_SERVER} spellCheck={false} style={sel} />
                </label>
                <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 2 }}>run <code>otoji gdoc</code> locally (realtime edits via headless Chrome)</div>
              </>
            )}
          </>
        )}

        {vt === "vibevoice-asr" && (
          <>
            {(() => {
              const backend = (config?.backend as string | undefined) ?? "mlx";
              const defaultModel = backend === "mlx" ? DEFAULT_VIBEVOICE_MLX_MODEL : DEFAULT_VIBEVOICE_VLLM_MODEL;
              return <>
            <label style={row}>backend:
              <SelectOmnibox value={backend} onChange={(e) => {
                const next = e.target.value;
                onConfig(id, { backend: next, apiModel: next === "mlx" ? DEFAULT_VIBEVOICE_MLX_MODEL : DEFAULT_VIBEVOICE_VLLM_MODEL });
              }} style={sel}>
                <option value="mlx">MLX (Apple Silicon)</option>
                <option value="vllm">vLLM (NVIDIA)</option>
              </SelectOmnibox>
            </label>
            <label style={row}>server:
              <input value={(config?.serverUrl as string) ?? DEFAULT_VIBEVOICE_SERVER} onChange={(e) => onConfig(id, { serverUrl: e.target.value })}
                placeholder={DEFAULT_VIBEVOICE_SERVER} spellCheck={false} style={sel} />
            </label>
            <label style={row}>API model:
              <SelectOmnibox value={modelInputConnected && controlledModel ? controlledModel : (config?.apiModel as string) ?? defaultModel} disabled={modelInputConnected} aria-readonly={modelInputConnected} title={modelInputConnected ? `Controlled by ${controlledModel ?? "Model provider"}` : undefined} onChange={(e) => onConfig(id, { apiModel: e.target.value })} style={{ ...sel, ...readonlyModelStyle }}>
                {modelInputConnected && controlledModel && <option value={controlledModel}>{controlledModel}</option>}
                <option value={defaultModel}>{defaultModel}</option>
                {backend === "mlx" && defaultModel !== DEFAULT_VIBEVOICE_MLX_MODEL && <option value={DEFAULT_VIBEVOICE_MLX_MODEL}>{DEFAULT_VIBEVOICE_MLX_MODEL}</option>}
                {backend === "vllm" && defaultModel !== DEFAULT_VIBEVOICE_VLLM_MODEL && <option value={DEFAULT_VIBEVOICE_VLLM_MODEL}>{DEFAULT_VIBEVOICE_VLLM_MODEL}</option>}
              </SelectOmnibox>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>hotwords:
              <input value={(config?.hotwords as string) ?? ""} onChange={(e) => onConfig(id, { hotwords: e.target.value })}
                placeholder="names, terms, context" style={{ ...sel, width: "100%", marginTop: 2, boxSizing: "border-box" }} />
            </label>
            <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 4 }}>
              {modelInputConnected ? "Provider-controlled. " : "Fallback model. "}{backend === "mlx" ? "Run mlx_audio.server locally; the first transcription downloads the model." : "Requires the Microsoft VibeVoice vLLM server."}
            </div>
              </>;
            })()}
          </>
        )}

        {vt === "model-source" && (
          <>
            {(() => {
              const sourceProvider = ((config?.provider as ModelSourceProvider | undefined) ?? "huggingface");
              const filters: ModelSearchFilters = {
                format: (config?.formatFilter as ModelFormat | "any" | undefined) ?? "any",
                runtime: (config?.runtimeFilter as ModelRuntime | "any" | undefined) ?? (sourceProvider === "civitai" ? "diffusers" : "browser"),
                task: (config?.taskFilter as ModelTaskGroup | "any" | undefined) ?? (sourceProvider === "webllm" ? "text" : "any"),
              };
              return <>
            <label style={row}>source:
              <EnumOmnibox
                ariaLabel="Model source provider"
                value={sourceProvider}
                options={MODEL_PROVIDER_OPTIONS}
                onChange={(provider) => onConfig(id, {
                  provider,
                  ref: undefined,
                  resolveSeq: undefined,
                  formatFilter: provider === "webllm" ? "mlc" : "any",
                  runtimeFilter: provider === "civitai" ? "diffusers" : "browser",
                  taskFilter: provider === "webllm" ? "text" : "any",
                })}
                style={{ width: 140 }}
              />
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model:
              {sourceProvider === "webllm" ? (
                <WebLlmModelOmnibox
                  value={(config?.ref as string | undefined) ?? ""}
                  onChange={(ref) => onConfig(id, { ref, formatFilter: "mlc", runtimeFilter: "browser", taskFilter: "text", resolveSeq: Date.now() })}
                />
              ) : (
                <ModelSourceOmnibox
                  provider={sourceProvider}
                  value={config?.ref as string | undefined}
                  onCommit={(ref) => onConfig(id, { ref, resolveSeq: Date.now() })}
                  filters={filters}
                  onFilters={(next) => onConfig(id, {
                    formatFilter: next.format ?? "any",
                    runtimeFilter: next.runtime ?? "any",
                    taskFilter: next.task ?? "any",
                  })}
                />
              )}
            </label>
            <div style={{ fontSize: 9.5, color: "#a0aec0", marginTop: 4 }}>
              Emits model metadata to Custom model, LLM agent, Vision model, Qwen Image, or Neural TTS.
            </div>
              </>;
            })()}
          </>
        )}

        {vt === "model" && (
          <>
            {(() => {
              const modelTask = (config?.task as string | undefined) ?? "asr";
              return (
                <>
            <label style={row}>task:
              <SelectOmnibox
                value={modelTask}
                onChange={(e) => {
                  const nextTask = e.target.value;
                  const current = (config?.model as string | undefined)?.trim();
                  onConfig(id, { task: nextTask, model: current || defaultModelForTask(nextTask) });
                }}
                style={sel}
              >
                {MODEL_TASKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectOmnibox>
            </label>
            <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model (HF repo id or URL):
              <ModelRepoInput
                value={config?.model as string | undefined}
                listId={`${text2textModelListId}-generic`}
                task={modelTask}
                placeholder={defaultModelForTask(modelTask)}
                onCommit={(model) => onConfig(id, { model })}
                disabled={modelInputConnected}
                controlledValue={controlledModel}
              />
            </label>
                </>
              );
            })()}
            <label style={row}>dtype:
              <SelectOmnibox value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </SelectOmnibox>
            </label>
          </>
        )}

        {vt === "llm-agent" && (
          <>
            {(() => {
              const agentBackend = controlledBackend ?? (config?.backend === "webllm" ? "webllm" : "transformers");
              const agentTask = ((config?.task as string | undefined) === "text-generation" ? "text-generation" : "text2text");
              return (
                <>
                  <label style={row}>backend:
                    <SelectOmnibox
                      value={agentBackend}
                      disabled={modelInputConnected && !!controlledBackend}
                      aria-readonly={modelInputConnected && !!controlledBackend}
                      title={modelInputConnected && controlledBackend ? `Controlled by connected ${controlledBackend} provider` : undefined}
                      onChange={(e) => {
                        const backend = e.target.value;
                        onConfig(id, backend === "webllm"
                          ? { backend, task: "text-generation", model: TRANSLATE_MODELS[0]!.id, dtype: undefined }
                          : { backend, task: "text-generation", model: defaultModelForTask("text-generation") });
                      }}
                      style={{ ...sel, ...(modelInputConnected && controlledBackend ? readonlyModelStyle : {}) }}
                    >
                      <option value="webllm">WebLLM (WebGPU)</option>
                      <option value="transformers">Transformers.js (ONNX/WASM)</option>
                    </SelectOmnibox>
                  </label>
                  {agentBackend === "webllm" ? (
                    <label style={row}>model:
                      <WebLlmModelOmnibox
                        value={modelInputConnected ? (controlledModel ?? (config?.model as string | undefined) ?? TRANSLATE_MODELS[0]!.id) : ((config?.model as string | undefined) ?? TRANSLATE_MODELS[0]!.id)}
                        onChange={(model) => onConfig(id, { model })}
                        disabled={modelInputConnected}
                      />
                    </label>
                  ) : (
                    <>
                      <label style={row}>task:
                        <SelectOmnibox
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
                        </SelectOmnibox>
                      </label>
                      <label style={{ display: "block", color: "#718096", marginTop: 6 }}>model (search Hugging Face):
                        {modelInputConnected ? (
                          <ModelRepoInput value={config?.model as string | undefined} listId={`${text2textModelListId}-agent`} task={agentTask}
                            placeholder={defaultModelForTask(agentTask)} onCommit={(model) => onConfig(id, { model })} disabled controlledValue={controlledModel} />
                        ) : (
                          <ModelSourceOmnibox
                            provider="huggingface"
                            value={config?.model as string | undefined}
                            filters={{ runtime: "browser", task: "text", format: "any" }}
                            onFilters={() => {}}
                            onCommit={(model) => onConfig(id, { model })}
                          />
                        )}
                      </label>
                      <label style={row}>dtype:
                        <SelectOmnibox value={(config?.dtype as string) ?? DEFAULT_MODEL_DTYPE} onChange={(e) => onConfig(id, { dtype: e.target.value })} style={sel}>
                          {MODEL_DTYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
                        </SelectOmnibox>
                      </label>
                    </>
                  )}
                  {modelInputConnected && <div style={{ fontSize: 9.5, color: "#3182ce", marginTop: 3 }}>Provider-controlled · disconnect model input to edit</div>}
                </>
              );
            })()}
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

        {(vt === "file-audio" || vt === "file-image" || vt === "file-text") && (() => {
          const url = config?.url as string | undefined;
          const useUrl = (u: string | undefined) => { fileStore.delete(id); onConfig(id, { url: u || undefined, file: undefined }); };
          const title = (config?.title as string | undefined) ?? fileName ?? spec.label;
          const latestAudio = vt === "file-audio" ? getRecords(id).at(-1) : undefined;
          const accept = vt === "file-audio" ? "audio/*" : vt === "file-image" ? "image/*" : ".md,.txt,.srt,.vtt,text/*";
          return (
            <div style={{ marginTop: 6, fontSize: 11, color: "#718096" }}>
              <label style={row}>title:
                <input type="text" defaultValue={title} aria-label={`${spec.label} title`}
                  onBlur={(event) => onConfig(id, { title: event.target.value.trim() || undefined })}
                  onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
                  style={{ fontSize: 10, flex: 1, minWidth: 0 }} />
              </label>
              <div style={{ marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName ? `📄 ${fileName}` : url ? `🔗 ${url}` : "no file"}</div>
              <input type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(id, f); }} style={{ fontSize: 10, width: "100%" }} />
              <input type="text" defaultValue={url ?? ""} placeholder="…or paste a URL"
                onBlur={(e) => useUrl(e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ fontSize: 10, width: "100%", marginTop: 3, boxSizing: "border-box" }} />
              {vt === "file-audio" && <AudioSeedPreview nodeId={id} fallbackUrl={url} fileKey={fileName} />}
              {latestAudio && <RecordingPlayer rec={latestAudio} index={0} />}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                <button type="button" onClick={() => replayNode(id)} style={{ fontSize: 10 }}>▶ send current</button>
                {vt === "file-audio" && <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                  <input type="checkbox" checked={(config?.loop as boolean | undefined) ?? false} onChange={(event) => onConfig(id, { loop: event.target.checked })} />
                  loop output
                </label>}
              </div>
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
          const title = (config?.title as string | undefined) ?? fileName ?? spec.label;
          return (
            <div style={{ marginTop: 6 }}>
              <label style={row}>title:
                <input type="text" defaultValue={title} aria-label="Video title"
                  onBlur={(event) => onConfig(id, { title: event.target.value.trim() || undefined })}
                  onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
                  style={{ fontSize: 10, flex: 1, minWidth: 0 }} />
              </label>
              <input type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFile(id, file); }} style={{ fontSize: 10, width: "100%", marginBottom: 4 }} />
              {clip ? (
                <VideoClipPlayer clip={clip} index={0} />
              ) : (
                <div style={{ color: "#a0aec0", fontSize: 11 }}>clip missing on this device</div>
              )}
              <button
                type="button"
                disabled={!clipId}
                onClick={() => replayNode(id)}
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

        {vt === "srt-out" && (() => {
          const records = getRecords(id);
          const srt = buildSrt(records.map((r) => ({ text: r.text, durationMs: r.durationMs, startMs: r.tStartMs, endMs: r.tEndMs })));
          return (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#718096" }}>
                <span>captions ({records.length})</span>
                {records.length > 0 && <button style={{ fontSize: 10 }} onClick={() => clearRecords?.(id)}>Clear</button>}
              </div>
              <pre style={{ maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 10, lineHeight: 1.35, color: "#4a5568", background: "#f7fafc", padding: 6, borderRadius: 4 }}>
                {srt || "Run the graph to collect captions."}
              </pre>
              <button style={{ fontSize: 11, width: "100%" }} disabled={records.length === 0}
                onClick={() => download(new Blob([srt], { type: "application/x-subrip;charset=utf-8" }), "otoji-transcript.srt")}>
                Download .srt
              </button>
            </div>
          );
        })()}

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
        {micWarning && <div style={{ color: "#c05621", fontSize: 10, marginTop: 4 }}>{micWarning}</div>}
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

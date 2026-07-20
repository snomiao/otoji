// Voice-graph data model. Nodes carry typed ports; an edge is valid only when
// the source output type matches the target input type. The whole graph is the
// authoritative state synced via the Durable Object (see signaling graph-patch).

// segment = audio PCM, transcript = text, image = a captured frame,
// control = a feedback signal (a "next"/credit pulse or a target rate number),
// environment = runtime/capability metadata link from an Environment node,
// model = model repository/download metadata selected by a Model source node.
export type PortType = "segment" | "transcript" | "image" | "control" | "environment" | "spatial" | "model";
export type NodeType =
  | "environment"
  | "mic-vad"
  | "mic-raw"
  | "file-audio"
  | "file-image"
  | "file-text"
  | "url"
  | "textarea"
  | "stt"
  | "web-speech"
  | "vosk"
  | "stream-asr"
  | "sherpa"
  | "vibevoice-asr"
  | "translate"
  | "browser-translate-api"
  | "text-aggregate"
  | "text-normalize"
  | "text-filter"
  | "llm-agent"
  | "graph-edit"
  | "sink"
  | "audio-out"
  | "video-recorder"
  | "video-clip"
  | "speaker"
  | "tts"
  | "tts-model"
  | "model-source"
  | "model"
  | "pipe"
  | "srt-out"
  | "tracker"
  | "camera"
  | "screen-share"
  | "paddle-ocr"
  | "text-diff"
  | "vision-model"
  | "qwen-image"
  | "depth-field"
  | "hand-space"
  | "spatial-calibration"
  | "rgbd-point-cloud"
  | "model-3d"
  | "spatial-renderer"
  | "image-match"
  | "ar-notes"
  | "audio-mix";

export interface NodeSpec {
  type: NodeType;
  label: string;
  // acceptsPartial: this transcript input wants high-rate partial revisions
  // (live captions). Ports without it only ever see provisional/final
  // transcripts — the runtime filters partials out at the adjacency layer, for
  // local and cross-device edges alike.
  inputs: { id: string; type: PortType; acceptsPartial?: boolean }[];
  outputs: { id: string; type: PortType }[];
}

const RAW_NODE_SPECS: Record<NodeType, NodeSpec> = {
  environment: {
    type: "environment",
    label: "Environment",
    // A browser/device/tab capability provider. First draft: metadata only;
    // connected nodes can declare which environment they intend to use.
    inputs: [],
    outputs: [{ id: "env", type: "environment" }],
  },
  "mic-vad": {
    type: "mic-vad",
    label: "Mic + VAD",
    inputs: [],
    outputs: [{ id: "out", type: "segment" }],
  },
  "mic-raw": {
    type: "mic-raw",
    label: "Mic (raw, no VAD)",
    // Continuous fixed-size frames for streaming consumers (no segmentation).
    inputs: [],
    outputs: [{ id: "out", type: "segment" }],
  },
  "audio-mix": {
    type: "audio-mix",
    label: "Mix audio",
    // Combine multiple audio sources (wire several segment edges into `in`).
    // Segments are time-aligned by wall-clock ts, overlaps summed and soft-
    // clipped, then emitted as one mixed segment per overlap cluster. A small
    // jitter buffer absorbs arrival skew before a cluster is flushed.
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "segment" }],
  },
  "file-audio": {
    type: "file-audio",
    label: "Audio",
    // A replaceable whole-audio state cell. File/URL seeds the current value;
    // an incoming segment replaces it and is emitted unchanged.
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "segment" }],
  },
  "file-image": {
    type: "file-image",
    label: "Image",
    // Optional file/URL seed plus a replaceable current image. This makes the
    // node useful as an image state cell in bounded feedback workflows.
    inputs: [{ id: "in", type: "image" }],
    outputs: [{ id: "out", type: "image" }],
  },
  "file-text": {
    type: "file-text",
    label: "Text file",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  url: {
    type: "url",
    label: "URL",
    // Dropped/pasted URL source. It tries to fetch readable content for text
    // output, and its inspector renders the URL in an iframe when embeddable.
    inputs: [],
    outputs: [{ id: "out", type: "transcript" }],
  },
  textarea: {
    type: "textarea",
    label: "Text",
    // Type text on the canvas (Monaco), commit to `config.text`, and the source
    // emits it as one replaceable value (same wire shape as file-text).
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  stt: {
    type: "stt",
    label: "ASR (browser)",
    // The configured model is the fallback. A connected Model provider wins at
    // runtime, while Environment selects where the node executes.
    inputs: [
      { id: "in", type: "segment" },
      { id: "model", type: "model" },
      { id: "env", type: "environment" },
    ],
    outputs: [
      { id: "out", type: "transcript" },
      { id: "caption", type: "transcript" },
      { id: "audio", type: "segment" },
    ],
  },
  "web-speech": {
    type: "web-speech",
    label: "Streaming STT (Web Speech)",
    // Browser-native streaming ASR with live interim results; opens its own mic on
    // the device it runs on (no audio input port).
    inputs: [],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "stream-asr": {
    type: "stream-asr",
    label: "Streaming ASR (browser)",
    // True streaming transducer (zipformer via onnxruntime-web): feed continuous
    // audio (mic-raw at a small frameMs), partial revisions stream out per
    // chunk and a silence endpoint finalizes each utterance (M6.1). A connected
    // Model provider with a sherpa encoder/decoder/joiner/tokens export
    // overrides the default model.
    inputs: [
      { id: "in", type: "segment" },
      { id: "model", type: "model" },
    ],
    outputs: [
      { id: "out", type: "transcript" },
      // Two-pass: each finalized utterance's raw audio, tagged with the
      // provisional's segmentId/revision — wire into an offline ASR (stt) to
      // get an accuracy-upgraded final that supersedes the streaming text.
      { id: "utterance", type: "segment" },
    ],
  },
  vosk: {
    type: "vosk",
    label: "Streaming STT (Vosk)",
    // On-device streaming ASR (Kaldi/WASM): feed continuous audio (e.g. mic-raw),
    // emits a finalized transcript at each endpoint; partials show in the preview.
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  sherpa: {
    type: "sherpa",
    label: "Native STT (sherpa-onnx)",
    // Bridges to a local `otoji server` (WebSocket) running the native
    // sherpa-onnx worker: partials → live preview, finals → downstream
    // transcript. Unlocks heavy native models (whisper-large-v3, zipformer,
    // dolphin, full-precision SenseVoice) that are impractical in-browser.
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "vibevoice-asr": {
    type: "vibevoice-asr",
    label: "VibeVoice ASR",
    // Long-form diarized ASR through Microsoft's OpenAI-compatible vLLM server.
    inputs: [
      { id: "in", type: "segment" },
      { id: "model", type: "model" },
      { id: "env", type: "environment" },
    ],
    outputs: [
      { id: "out", type: "transcript" },
      { id: "caption", type: "transcript" },
      { id: "audio", type: "segment" },
    ],
  },
  translate: {
    type: "translate",
    label: "Translate (in-browser LLM)",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "browser-translate-api": {
    type: "browser-translate-api",
    label: "Browser Translator API",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "text-aggregate": {
    type: "text-aggregate",
    label: "Text aggregate",
    // Merge OCR + spoken transcript context into one promptable text stream.
    inputs: [
      { id: "ocr", type: "transcript" },
      { id: "voice", type: "transcript" },
    ],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "text-normalize": {
    type: "text-normalize",
    label: "Text normalize",
    // Stabilize noisy OCR/STT text before diffing or prompting.
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "text-filter": {
    type: "text-filter",
    label: "Text filter",
    // Filter/transform transcript lines, commonly after Text diff.
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "llm-agent": {
    type: "llm-agent",
    label: "LLM agent",
    // Prompt-shaped text2text generation via the generic transformers.js runner.
    inputs: [{ id: "in", type: "transcript" }, { id: "model", type: "model" }, { id: "env", type: "environment" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "graph-edit": {
    type: "graph-edit",
    label: "Graph editor (agent)",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  sink: {
    type: "sink",
    label: "Transcript + Recordings",
    // Partials render as the node's live preview; only provisional/final
    // transcripts append recordings.
    inputs: [{ id: "in", type: "transcript", acceptsPartial: true }],
    outputs: [],
  },
  "audio-out": {
    type: "audio-out",
    label: "Audio file (out)",
    // Accepts raw audio (tap mic/file directly) OR transcripts (uses their audio).
    inputs: [
      { id: "seg", type: "segment" },
      { id: "in", type: "transcript" },
    ],
    outputs: [],
  },
  "video-recorder": {
    type: "video-recorder",
    label: "Video recorder",
    // Folder-like recorder: collect image+audio into WebM clips, then replay a
    // chosen clip downstream as image frames plus one decoded audio segment.
    inputs: [
      { id: "video", type: "image" },
      { id: "audio", type: "segment" },
    ],
    outputs: [
      { id: "video", type: "image" },
      { id: "audio", type: "segment" },
    ],
  },
  "video-clip": {
    type: "video-clip",
    label: "Video",
    // Stored clips replay as image+audio. Incoming streams replace the current
    // frame/audio state and pass through using the same cross-device-safe ports.
    inputs: [
      { id: "video", type: "image" },
      { id: "audio", type: "segment" },
    ],
    outputs: [
      { id: "video", type: "image" },
      { id: "audio", type: "segment" },
    ],
  },
  speaker: {
    type: "speaker",
    label: "Speaker (play)",
    // Plays raw audio (tap mic/file directly) OR transcripts (uses their audio).
    inputs: [
      { id: "seg", type: "segment" },
      { id: "in", type: "transcript" },
    ],
    outputs: [],
  },
  tts: {
    type: "tts",
    label: "Text-to-Speech (local)",
    // Speaks a transcript via the browser's on-device SpeechSynthesis.
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [],
  },
  "tts-model": {
    type: "tts-model",
    label: "Neural TTS (on-device)",
    // Synthesizes a transcript to raw PCM (ONNX MMS-TTS) so it can route to a
    // device-targetable speaker / audio-out.
    inputs: [{ id: "in", type: "transcript" }, { id: "model", type: "model" }, { id: "env", type: "environment" }],
    outputs: [{ id: "out", type: "segment" }],
  },
  "model-source": {
    type: "model-source",
    label: "Model provider",
    // Resolves a WebLLM, Hugging Face, Civitai, or direct URL reference to model metadata
    // and a preferred model id/download URL that downstream model nodes can use.
    inputs: [],
    outputs: [
      { id: "model", type: "model" },
      { id: "info", type: "transcript" },
    ],
  },
  model: {
    type: "model",
    label: "Custom model",
    // A generic transformers.js node: the active task picks which ports it uses
    // (ASR: seg→txt, translate/text2text: txt→txt, TTS: txt→seg). Unused handles
    // simply stay unconnected.
    inputs: [
      { id: "in_seg", type: "segment" },
      { id: "in_txt", type: "transcript" },
      { id: "in_img", type: "image" },
      { id: "model", type: "model" },
      { id: "env", type: "environment" },
    ],
    outputs: [
      { id: "out_txt", type: "transcript" },
      { id: "out_seg", type: "segment" },
    ],
  },
  pipe: {
    type: "pipe",
    label: "CLI pipe (stdio)",
    // Bridges text to/from an external `otoji node` process over the signaling
    // relay: input text → the CLI's stdout; the CLI's stdin → output text.
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "srt-out": {
    type: "srt-out",
    label: "Transcript (SRT)",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [],
  },
  tracker: {
    type: "tracker",
    label: "Signaling (trackers)",
    // Config-only node (no data ports): declares which signaling servers this
    // room is discoverable on. Synced via the graph, so adding a tracker
    // federates the room to everyone. See lib/trackers + MultiSignalingClient.
    inputs: [],
    outputs: [],
  },
  camera: {
    type: "camera",
    label: "Camera",
    // Captures frames from a webcam at a configurable FPS. The optional `rate`
    // control input enables backpressure: a "next" pulse makes it grab exactly
    // one frame (credit). Unwired = free-run.
    inputs: [{ id: "rate", type: "control" }],
    outputs: [{ id: "out", type: "image" }],
  },
  "screen-share": {
    type: "screen-share",
    label: "Screen share",
    // getDisplayMedia: screen/window/tab frames + (where granted) system audio.
    // `out` mirrors the Camera node (image frames). `audio` carries
    // VAD-segmented system audio for STT — only when the browser provides an
    // audio track (often tab-share only).
    inputs: [],
    outputs: [
      { id: "out", type: "image" },
      { id: "audio", type: "segment" },
    ],
  },
  "paddle-ocr": {
    type: "paddle-ocr",
    label: "OCR (browser)",
    // image → recognized text. PaddleOCR (PP-OCRv4) is the default; a connected
    // Model provider pointing at a Paddle-format det/rec/dict trio overrides it.
    // Latest-only: while busy it keeps just the newest frame and drops the rest
    // (never queues). `rate` emits a credit pulse after each frame, to feed back
    // into a Camera's rate input.
    inputs: [
      { id: "in", type: "image" },
      { id: "model", type: "model" },
    ],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "text-diff": {
    type: "text-diff",
    label: "Text diff",
    // Emits only what changed vs the previous input. First input emits as all
    // additions; subsequent inputs emit the delta in the chosen style (gitdiff).
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "vision-model": {
    type: "vision-model",
    label: "Vision model",
    // image → results via transformers.js (object-detection now; depth/segment
    // later). Latest-only. Outputs are LAZY: each is produced only when
    // connected. `out` = annotated overlay, `labels` = readable summary
    // (for TTS/diff), `json` = structured detections.
    inputs: [{ id: "in", type: "image" }, { id: "model", type: "model" }, { id: "env", type: "environment" }],
    outputs: [
      { id: "out", type: "image" },
      { id: "labels", type: "transcript" },
      { id: "json", type: "transcript" },
    ],
  },
  "qwen-image": {
    type: "qwen-image",
    label: "Qwen Image",
    // External runner-backed text/image → generated image. The browser sends
    // prompt + optional source image to a local/remote CUDA, GGUF, DiffSynth, or
    // MLX bridge and receives a bitmap result.
    inputs: [
      { id: "prompt", type: "transcript" },
      { id: "image", type: "image" },
      { id: "model", type: "model" },
      { id: "env", type: "environment" },
    ],
    outputs: [
      { id: "out", type: "image" },
      { id: "info", type: "transcript" },
    ],
  },
  "depth-field": {
    type: "depth-field",
    label: "Depth field",
    inputs: [{ id: "in", type: "image" }],
    outputs: [{ id: "depth", type: "spatial" }, { id: "preview", type: "image" }],
  },
  "hand-space": {
    type: "hand-space",
    label: "Hand space",
    inputs: [{ id: "in", type: "image" }],
    outputs: [{ id: "hand", type: "spatial" }, { id: "preview", type: "image" }],
  },
  "spatial-calibration": {
    type: "spatial-calibration",
    label: "3D calibration",
    inputs: [{ id: "depth", type: "spatial" }, { id: "hand", type: "spatial" }],
    outputs: [{ id: "space", type: "spatial" }],
  },
  "rgbd-point-cloud": {
    type: "rgbd-point-cloud",
    label: "RGB-D point cloud",
    inputs: [{ id: "frame", type: "image" }, { id: "depth", type: "spatial" }],
    outputs: [{ id: "scene", type: "spatial" }],
  },
  "model-3d": {
    type: "model-3d",
    label: "3D model",
    inputs: [],
    outputs: [{ id: "object", type: "spatial" }],
  },
  "spatial-renderer": {
    type: "spatial-renderer",
    label: "Spatial renderer",
    inputs: [
      { id: "frame", type: "image" },
      { id: "depth", type: "spatial" },
      { id: "space", type: "spatial" },
      { id: "object", type: "spatial" },
      { id: "scene", type: "spatial" },
    ],
    outputs: [{ id: "out", type: "image" }],
  },
  "ar-notes": {
    type: "ar-notes",
    label: "AR notes",
    // Pinch to place a sticky note at the calibrated fingertip position; notes
    // persist in config (synced to the room) and render into the frame.
    inputs: [
      { id: "frame", type: "image" },
      { id: "space", type: "spatial" },
    ],
    outputs: [{ id: "out", type: "image" }],
  },
  "image-match": {
    type: "image-match",
    label: "Image match",
    // Template matching: find every occurrence of a small `pattern` image
    // (wire a file-image or any image source) inside each `in` frame.
    // Latest-only, pure NCC — no model download. `out` = annotated overlay,
    // `count` = "N matches" text, `json` = count + per-match positions.
    inputs: [
      { id: "in", type: "image" },
      { id: "pattern", type: "image" },
    ],
    outputs: [
      { id: "out", type: "image" },
      { id: "count", type: "transcript" },
      { id: "json", type: "transcript" },
    ],
  },
};

const ENV_INPUT: NodeSpec["inputs"][number] = { id: "env", type: "environment" };
const ENV_TARGET_TYPES = new Set<NodeType>(
  (Object.keys(RAW_NODE_SPECS) as NodeType[]).filter((t) => t !== "environment" && t !== "tracker"),
);

export const NODE_SPECS: Record<NodeType, NodeSpec> = Object.fromEntries(
  (Object.entries(RAW_NODE_SPECS) as [NodeType, NodeSpec][]).map(([type, spec]) => [
    type,
    ENV_TARGET_TYPES.has(type) && !spec.inputs.some((p) => p.id === ENV_INPUT.id)
      ? { ...spec, inputs: [...spec.inputs, ENV_INPUT] }
      : spec,
  ]),
) as Record<NodeType, NodeSpec>;

/** Palette grouping for the node types. */
export const NODE_CATEGORIES: { id: string; label: string; types: NodeType[] }[] = [
  { id: "input", label: "Input", types: ["mic-vad", "mic-raw", "audio-mix", "file-audio", "file-image", "file-text", "url", "textarea", "video-clip"] },
  { id: "stt", label: "Speech → Text", types: ["stt", "stream-asr", "web-speech", "vosk"] },
  { id: "translate", label: "Text → Text", types: ["translate", "browser-translate-api", "text-aggregate", "text-normalize", "text-filter"] },
  { id: "tts", label: "Text → Speech", types: ["tts", "tts-model"] },
  { id: "output", label: "Output", types: ["sink", "audio-out", "video-recorder", "srt-out", "speaker"] },
  { id: "model", label: "Custom model", types: ["model-source", "llm-agent", "graph-edit", "model"] },
  { id: "vision", label: "Vision", types: ["camera", "screen-share", "paddle-ocr", "vision-model", "depth-field", "hand-space", "spatial-calibration", "rgbd-point-cloud", "model-3d", "spatial-renderer", "image-match", "ar-notes"] },
  { id: "text", label: "Text", types: ["text-diff"] },
  { id: "net", label: "Network", types: ["environment", "tracker"] },
  { id: "advanced", label: "Advanced / Native", types: ["sherpa", "vibevoice-asr", "qwen-image", "pipe"] },
];

export interface VoiceNode {
  id: string;
  type: NodeType;
  device: string | null; // peerId the node runs on (null = unassigned)
  pos: { x: number; y: number };
  /** user-resized world box (rgui corner grip); absent = renderer default */
  size?: { w: number; h: number };
  /** rgui content scale (shift+grip rescale magnifies the node); absent = 1 */
  scale?: number;
  config?: Record<string, unknown>;
}

export interface VoiceEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface VoiceGraph {
  version: number;
  nodes: Record<string, VoiceNode>;
  edges: VoiceEdge[];
}

export const emptyGraph = (): VoiceGraph => ({ version: 0, nodes: {}, edges: [] });

function portType(nodeType: NodeType, handleId: string, dir: "in" | "out"): PortType | null {
  const spec = NODE_SPECS[nodeType];
  const list = dir === "in" ? spec.inputs : spec.outputs;
  return list.find((p) => p.id === handleId)?.type ?? null;
}

/** Whether a node's input port opted into receiving partial transcript revisions. */
export function acceptsPartialInput(nodeType: NodeType, handleId: string): boolean {
  return NODE_SPECS[nodeType]?.inputs.find((p) => p.id === handleId)?.acceptsPartial === true;
}

/** An edge is valid iff the output port type equals the input port type. */
export function canConnect(
  graph: VoiceGraph,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): boolean {
  if (source === target) return false;
  const sNode = graph.nodes[source];
  const tNode = graph.nodes[target];
  if (!sNode || !tNode) return false;
  const out = portType(sNode.type, sourceHandle, "out");
  const inp = portType(tNode.type, targetHandle, "in");
  if (!out || !inp || out !== inp) return false;
  // no duplicate edge into the same input handle
  if (graph.edges.some((e) => e.target === target && e.targetHandle === targetHandle)) return false;
  return true;
}

export function edgeId(e: Omit<VoiceEdge, "id">): string {
  return `${e.source}:${e.sourceHandle}->${e.target}:${e.targetHandle}`;
}

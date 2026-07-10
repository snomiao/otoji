// Voice-graph data model. Nodes carry typed ports; an edge is valid only when
// the source output type matches the target input type. The whole graph is the
// authoritative state synced via the Durable Object (see signaling graph-patch).

// segment = audio PCM, transcript = text, image = a captured frame,
// control = a feedback signal (a "next"/credit pulse or a target rate number),
// environment = runtime/capability metadata link from an Environment node.
export type PortType = "segment" | "transcript" | "image" | "control" | "environment";
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
  | "sherpa"
  | "translate"
  | "browser-translate-api"
  | "text-aggregate"
  | "text-normalize"
  | "text-filter"
  | "llm-agent"
  | "sink"
  | "audio-out"
  | "video-recorder"
  | "video-clip"
  | "speaker"
  | "tts"
  | "tts-model"
  | "model"
  | "pipe"
  | "srt-out"
  | "tracker"
  | "camera"
  | "screen-share"
  | "paddle-ocr"
  | "text-diff"
  | "vision-model"
  | "audio-mix";

export interface NodeSpec {
  type: NodeType;
  label: string;
  inputs: { id: string; type: PortType }[];
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
    label: "Audio file (in)",
    inputs: [],
    outputs: [{ id: "out", type: "segment" }],
  },
  "file-image": {
    type: "file-image",
    label: "Image file (in)",
    inputs: [],
    outputs: [{ id: "out", type: "image" }],
  },
  "file-text": {
    type: "file-text",
    label: "Text file (in)",
    inputs: [],
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
    label: "Text editor (in)",
    // Type text on the canvas (Monaco), commit to `config.text`, and the source
    // re-emits it paragraph-by-paragraph (same wire shape as file-text). A
    // `config.seq` bump re-sends unchanged text (auto-run restarts on config).
    inputs: [],
    outputs: [{ id: "out", type: "transcript" }],
  },
  stt: {
    type: "stt",
    label: "SenseVoice STT",
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  "web-speech": {
    type: "web-speech",
    label: "Streaming STT (Web Speech)",
    // Browser-native streaming ASR with live interim results; opens its own mic on
    // the device it runs on (no audio input port).
    inputs: [],
    outputs: [{ id: "out", type: "transcript" }],
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
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  sink: {
    type: "sink",
    label: "Transcript + Recordings",
    inputs: [{ id: "in", type: "transcript" }],
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
    label: "Video clip",
    // Generated by a Video recorder. Replays one stored clip as image frames
    // plus decoded audio so downstream nodes can process it like any source.
    inputs: [],
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
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [{ id: "out", type: "segment" }],
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
    label: "SRT subtitles (out)",
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
    label: "OCR (PaddleOCR)",
    // image → recognized text. Latest-only: while busy it keeps just the newest
    // frame and drops the rest (never queues). `rate` emits a credit pulse
    // after each frame, to feed back into a Camera's rate input.
    inputs: [{ id: "in", type: "image" }],
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
    inputs: [{ id: "in", type: "image" }],
    outputs: [
      { id: "out", type: "image" },
      { id: "labels", type: "transcript" },
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
  { id: "stt", label: "Speech → Text", types: ["stt", "web-speech", "vosk", "sherpa"] },
  { id: "translate", label: "Text → Text", types: ["translate", "browser-translate-api", "text-aggregate", "text-normalize", "text-filter"] },
  { id: "tts", label: "Text → Speech", types: ["tts", "tts-model"] },
  { id: "output", label: "Output", types: ["sink", "audio-out", "video-recorder", "srt-out", "speaker"] },
  { id: "model", label: "Custom model", types: ["llm-agent", "model"] },
  { id: "pipe", label: "Pipe (CLI)", types: ["pipe"] },
  { id: "vision", label: "Vision", types: ["camera", "screen-share", "paddle-ocr", "vision-model"] },
  { id: "text", label: "Text", types: ["text-diff"] },
  { id: "net", label: "Network", types: ["environment", "tracker"] },
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

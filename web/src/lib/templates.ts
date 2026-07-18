// Graph templates: small, reusable subgraphs that drop onto the canvas. A
// template is device-neutral data (node types + relative positions + edges by
// local key); the editor remaps keys to fresh ids and offsets to the drop point.
// Built-in demos ship in code; users can save the current selection as one
// (persisted in localStorage).

import type { NodeType } from "../graph/model";

export interface TemplateNode {
  key: string; // local id used to wire edges within the template
  type: NodeType;
  dx: number; // position relative to the template origin
  dy: number;
  config?: Record<string, unknown>;
}
export interface TemplateEdge {
  from: string;
  fromHandle: string;
  to: string;
  toHandle: string;
}
export interface GraphTemplate {
  id: string;
  name: string;
  desc?: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  builtin?: boolean;
  area?: "default" | "advanced";
}

const COL = 240;
const ROW = 160;
const WORKFLOW_COL = 440;
const WORKFLOW_ROW = 280;

export const BUILTIN_TEMPLATES: GraphTemplate[] = [
  {
    id: "yolo-webcam",
    name: "YOLO webcam",
    desc: "Camera → object detection → labels",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "labels", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "narrated-yolo",
    name: "Narrated YOLO",
    desc: "Camera → detection → spoken labels (TTS)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "tts", type: "tts", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "labels", to: "tts", toHandle: "in" },
    ],
  },
  {
    id: "live-captions",
    name: "Live captions",
    desc: "Mic → STT → transcript",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "qwen-agent-browser",
    name: "Qwen Agent (browser)",
    desc: "Searchable WebLLM provider + prompt → WebGPU Qwen 2.5 agent → editable response",
    builtin: true,
    nodes: [
      { key: "prompt", type: "textarea", dx: 0, dy: 0, config: { title: "Prompt", text: "Reply with exactly: OTOJI QWEN READY" } },
      { key: "provider", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "webllm", ref: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", formatFilter: "mlc", runtimeFilter: "browser", taskFilter: "text" } },
      {
        key: "agent",
        type: "llm-agent",
        dx: WORKFLOW_COL,
        dy: 0,
        config: {
          backend: "webllm",
          task: "text-generation",
          model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
          instruction: "You are Qwen running locally in Otoji. Follow the user request directly and keep the response concise.",
        },
      },
      { key: "response", type: "textarea", dx: WORKFLOW_COL * 2, dy: 0, config: { title: "Response", text: "" } },
    ],
    edges: [
      { from: "prompt", fromHandle: "out", to: "agent", toHandle: "in" },
      { from: "provider", fromHandle: "model", to: "agent", toHandle: "model" },
      { from: "agent", fromHandle: "out", to: "response", toHandle: "in" },
    ],
  },
  {
    id: "image-caption-browser",
    name: "Image → text (browser)",
    desc: "Image + searchable browser ONNX provider → editable caption",
    builtin: true,
    nodes: [
      { key: "image", type: "file-image", dx: 0, dy: 0, config: { title: "Input image" } },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "huggingface", ref: "Xenova/vit-gpt2-image-captioning", formatFilter: "onnx", runtimeFilter: "browser", taskFilter: "image-to-text" } },
      { key: "captioner", type: "model", dx: WORKFLOW_COL, dy: WORKFLOW_ROW / 2, config: { task: "image-to-text", model: "Xenova/vit-gpt2-image-captioning", dtype: "fp32" } },
      { key: "caption", type: "textarea", dx: WORKFLOW_COL * 2, dy: WORKFLOW_ROW / 2, config: { title: "Image caption", text: "" } },
    ],
    edges: [
      { from: "image", fromHandle: "out", to: "captioner", toHandle: "in_img" },
      { from: "source", fromHandle: "model", to: "captioner", toHandle: "model" },
      { from: "captioner", fromHandle: "out_txt", to: "caption", toHandle: "in" },
    ],
  },
  {
    id: "vibevoice-asr",
    name: "Speech round-trip (browser)",
    desc: "Text → browser TTS → browser ASR → downloadable SRT",
    builtin: true,
    nodes: [
      { key: "text", type: "textarea", dx: 0, dy: 0, config: { text: "Welcome to Otoji. This is a generated voice transcription test.", seq: 1 } },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "huggingface", ref: "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17", runtimeFilter: "browser", taskFilter: "asr" } },
      { key: "tts", type: "tts-model", dx: WORKFLOW_COL, dy: 0 },
      { key: "asr", type: "stt", dx: WORKFLOW_COL * 2, dy: WORKFLOW_ROW / 2, config: { model: "sensevoice-small-int8" } },
      { key: "transcript", type: "srt-out", dx: WORKFLOW_COL * 3, dy: WORKFLOW_ROW / 2 },
    ],
    edges: [
      { from: "text", fromHandle: "out", to: "tts", toHandle: "in" },
      { from: "tts", fromHandle: "out", to: "asr", toHandle: "in" },
      { from: "source", fromHandle: "model", to: "asr", toHandle: "model" },
      { from: "asr", fromHandle: "caption", to: "transcript", toHandle: "in" },
    ],
  },
  {
    id: "vibevoice-native-asr",
    name: "VibeVoice long-form ASR",
    desc: "Native MLX/VLLM model provider → ASR → SRT",
    builtin: true,
    area: "advanced",
    nodes: [
      { key: "audio", type: "file-audio", dx: 0, dy: 0 },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "huggingface", ref: "mlx-community/VibeVoice-ASR-bf16", runtimeFilter: "mlx", taskFilter: "asr" } },
      { key: "asr", type: "vibevoice-asr", dx: WORKFLOW_COL, dy: WORKFLOW_ROW / 2, config: { backend: "mlx", serverUrl: "http://localhost:8000", apiModel: "mlx-community/VibeVoice-ASR-bf16" } },
      { key: "transcript", type: "srt-out", dx: WORKFLOW_COL * 2, dy: WORKFLOW_ROW / 2 },
    ],
    edges: [
      { from: "audio", fromHandle: "out", to: "asr", toHandle: "in" },
      { from: "source", fromHandle: "model", to: "asr", toHandle: "model" },
      { from: "asr", fromHandle: "caption", to: "transcript", toHandle: "in" },
    ],
  },
  {
    id: "text-to-image-native",
    name: "Text → image",
    desc: "Prompt + searchable image provider → native/remote runner → image",
    builtin: true,
    area: "advanced",
    nodes: [
      { key: "prompt", type: "textarea", dx: 0, dy: 0, config: { title: "Image prompt", text: "A clean white poster with large black text: OTOJI IMAGE MODEL" } },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "huggingface", ref: "Qwen/Qwen-Image-2512", formatFilter: "diffusers", runtimeFilter: "diffusers", taskFilter: "text-to-image" } },
      { key: "env", type: "environment", dx: 0, dy: WORKFLOW_ROW * 2, config: { label: "Diffusers image runner", scope: "native-device", runtime: "native", mic: false, camera: false, screen: false, webgpu: false } },
      { key: "generator", type: "qwen-image", dx: WORKFLOW_COL, dy: WORKFLOW_ROW / 2, config: { mode: "generate", backend: "diffusers", serverUrl: "http://127.0.0.1:7861/generate", model: "Qwen/Qwen-Image-2512", width: 1024, height: 1024, steps: 20 } },
      { key: "output", type: "file-image", dx: WORKFLOW_COL * 2, dy: WORKFLOW_ROW / 2, config: { title: "Generated image" } },
    ],
    edges: [
      { from: "prompt", fromHandle: "out", to: "generator", toHandle: "prompt" },
      { from: "source", fromHandle: "model", to: "generator", toHandle: "model" },
      { from: "env", fromHandle: "env", to: "generator", toHandle: "env" },
      { from: "generator", fromHandle: "out", to: "output", toHandle: "in" },
    ],
  },
  {
    id: "image-to-image-native",
    name: "Image → image",
    desc: "Seed image + prompt + searchable edit provider → native/remote runner → image",
    builtin: true,
    area: "advanced",
    nodes: [
      { key: "seed", type: "file-image", dx: 0, dy: 0, config: { title: "Seed image" } },
      { key: "prompt", type: "textarea", dx: 0, dy: WORKFLOW_ROW, config: { title: "Edit prompt", text: "Turn this into a clean editorial illustration while preserving the composition." } },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW * 2, config: { provider: "huggingface", ref: "Qwen/Qwen-Image-Edit-2511", formatFilter: "diffusers", runtimeFilter: "diffusers", taskFilter: "image-to-image" } },
      { key: "env", type: "environment", dx: 0, dy: WORKFLOW_ROW * 3, config: { label: "Diffusers image runner", scope: "native-device", runtime: "native", mic: false, camera: false, screen: false, webgpu: false } },
      { key: "editor", type: "qwen-image", dx: WORKFLOW_COL, dy: WORKFLOW_ROW, config: { mode: "edit", backend: "diffusers", serverUrl: "http://127.0.0.1:7861/generate", model: "Qwen/Qwen-Image-Edit-2511", width: 1024, height: 1024, steps: 20, strength: 0.75 } },
      { key: "output", type: "file-image", dx: WORKFLOW_COL * 2, dy: WORKFLOW_ROW, config: { title: "Edited image" } },
    ],
    edges: [
      { from: "seed", fromHandle: "out", to: "editor", toHandle: "image" },
      { from: "prompt", fromHandle: "out", to: "editor", toHandle: "prompt" },
      { from: "source", fromHandle: "model", to: "editor", toHandle: "model" },
      { from: "env", fromHandle: "env", to: "editor", toHandle: "env" },
      { from: "editor", fromHandle: "out", to: "output", toHandle: "in" },
    ],
  },
  {
    id: "text-image-text",
    name: "Text → image → text",
    desc: "Generate an image from text, then recover its visible text with OCR",
    builtin: true,
    area: "advanced",
    nodes: [
      { key: "text", type: "textarea", dx: 0, dy: 0, config: { text: "A clean white poster with large black text: OTOJI CONNECTS EVERY MODEL", seq: 1, maxUpdates: 4 } },
      { key: "source", type: "model-source", dx: 0, dy: WORKFLOW_ROW, config: { provider: "huggingface", ref: "Qwen/Qwen-Image-2512", runtimeFilter: "diffusers", taskFilter: "text-to-image" } },
      { key: "image", type: "qwen-image", dx: WORKFLOW_COL, dy: WORKFLOW_ROW / 2, config: { backend: "diffusers", serverUrl: "http://127.0.0.1:7861/generate", model: "Qwen/Qwen-Image-2512" } },
      { key: "state", type: "file-image", dx: WORKFLOW_COL * 2, dy: 0, config: { maxUpdates: 4 } },
      { key: "ocr", type: "paddle-ocr", dx: WORKFLOW_COL * 3, dy: 0 },
      { key: "transcript", type: "srt-out", dx: WORKFLOW_COL * 4, dy: 0 },
    ],
    edges: [
      { from: "text", fromHandle: "out", to: "image", toHandle: "prompt" },
      { from: "source", fromHandle: "model", to: "image", toHandle: "model" },
      { from: "image", fromHandle: "out", to: "state", toHandle: "in" },
      { from: "state", fromHandle: "out", to: "image", toHandle: "image" },
      { from: "state", fromHandle: "out", to: "ocr", toHandle: "in" },
      { from: "ocr", fromHandle: "out", to: "text", toHandle: "in" },
      { from: "ocr", fromHandle: "out", to: "transcript", toHandle: "in" },
    ],
  },
  {
    id: "live-translate",
    name: "Live translate",
    desc: "Mic → STT → translate → transcript",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "tr", type: "translate", dx: COL * 2, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 3, dy: 0 },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "tr", toHandle: "in" },
      { from: "tr", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "mix-two-mics",
    name: "Mix two mics",
    desc: "Two mics → time-aligned mix → STT (pick a device on each mic)",
    builtin: true,
    nodes: [
      { key: "mic1", type: "mic-vad", dx: 0, dy: 0 },
      { key: "mic2", type: "mic-vad", dx: 0, dy: ROW },
      { key: "mix", type: "audio-mix", dx: COL, dy: ROW / 2 },
      { key: "stt", type: "stt", dx: COL * 2, dy: ROW / 2 },
      { key: "sink", type: "sink", dx: COL * 3, dy: ROW / 2 },
    ],
    edges: [
      { from: "mic1", fromHandle: "out", to: "mix", toHandle: "in" },
      { from: "mic2", fromHandle: "out", to: "mix", toHandle: "in" },
      { from: "mix", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-audio-stt",
    name: "Screen audio → STT",
    desc: "Capture tab/system audio → transcript (share a tab with audio)",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "screen", fromHandle: "audio", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-yolo",
    name: "Screen YOLO",
    desc: "Screen share → object detection → labels",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "yolo", type: "vision-model", dx: COL, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 2, dy: 0 },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "labels", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "screen-depth",
    name: "Screen depth",
    desc: "Screen share → live depth map (preview)",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "depth", type: "vision-model", dx: COL, dy: 0, config: { task: "depth" } },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "depth", toHandle: "in" },
    ],
  },
  {
    id: "screen-ocr-diff-tts",
    name: "Screen + voice agent → TTS",
    desc: "Screen share → OCR → normalize → diff, plus screen-audio STT → context aggregate → LLM agent → spoken output",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "ocr", type: "paddle-ocr", dx: COL, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: ROW },
      { key: "norm", type: "text-normalize", dx: COL * 2, dy: 0 },
      { key: "diff", type: "text-diff", dx: COL * 3, dy: 0 },
      { key: "filter", type: "text-filter", dx: COL * 4, dy: 0, config: { mode: "diff-added", stripPrefix: false } },
      { key: "agg", type: "text-aggregate", dx: COL * 5, dy: ROW / 2 },
      { key: "agent", type: "llm-agent", dx: COL * 6, dy: ROW / 2 },
      { key: "tts", type: "tts", dx: COL * 7, dy: ROW / 2 },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "ocr", toHandle: "in" },
      { from: "screen", fromHandle: "audio", to: "stt", toHandle: "in" },
      { from: "ocr", fromHandle: "out", to: "norm", toHandle: "in" },
      { from: "norm", fromHandle: "out", to: "diff", toHandle: "in" },
      { from: "diff", fromHandle: "out", to: "filter", toHandle: "in" },
      { from: "filter", fromHandle: "out", to: "agg", toHandle: "ocr" },
      { from: "stt", fromHandle: "out", to: "agg", toHandle: "voice" },
      { from: "agg", fromHandle: "out", to: "agent", toHandle: "in" },
      { from: "agent", fromHandle: "out", to: "tts", toHandle: "in" },
    ],
  },
  {
    id: "depth-cam",
    name: "Depth camera",
    desc: "Camera → live depth map (preview)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "depth", type: "vision-model", dx: COL, dy: 0, config: { task: "depth" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "depth", toHandle: "in" },
    ],
  },
  {
    id: "pose-mirror",
    name: "Pose mirror",
    desc: "Camera → body pose skeleton (MediaPipe)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "pose", type: "vision-model", dx: COL, dy: 0, config: { task: "pose" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "pose", toHandle: "in" },
    ],
  },
  {
    id: "hand-tracking",
    name: "Hand tracking",
    desc: "Camera → hand landmarks (MediaPipe)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "hand", type: "vision-model", dx: COL, dy: 0, config: { task: "hand" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "hand", toHandle: "in" },
    ],
  },
  {
    id: "gesture-mirror",
    name: "Gesture recognition",
    desc: "Camera → hand gestures (👍 ✌️ ✋ …, MediaPipe)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "gest", type: "vision-model", dx: COL, dy: 0, config: { task: "gesture" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "gest", toHandle: "in" },
    ],
  },
  {
    id: "spatial-monkey",
    name: "Spatial fingertip model",
    desc: "Camera → hand calibration + 3D model → spatial renderer",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "depth", type: "depth-field", dx: COL, dy: -ROW, config: {} },
      { key: "hand", type: "hand-space", dx: COL, dy: 0, config: {} },
      { key: "cal", type: "spatial-calibration", dx: COL * 2, dy: -ROW / 2, config: { nearMeters: 0.2, farMeters: 2.5, fovDegrees: 60 } },
      { key: "cloud", type: "rgbd-point-cloud", dx: COL * 2, dy: -ROW * 1.5, config: { stride: 8, nearMeters: 0.2, farMeters: 2.5, fovDegrees: 60 } },
      { key: "model", type: "model-3d", dx: COL * 2, dy: ROW, config: { primitive: "suzanne", scale: 1 } },
      { key: "render", type: "spatial-renderer", dx: COL * 3, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "depth", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "hand", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "render", toHandle: "frame" },
      { from: "cam", fromHandle: "out", to: "cloud", toHandle: "frame" },
      { from: "depth", fromHandle: "depth", to: "cal", toHandle: "depth" },
      { from: "depth", fromHandle: "depth", to: "render", toHandle: "depth" },
      { from: "depth", fromHandle: "depth", to: "cloud", toHandle: "depth" },
      { from: "hand", fromHandle: "hand", to: "cal", toHandle: "hand" },
      { from: "cal", fromHandle: "space", to: "render", toHandle: "space" },
      { from: "cloud", fromHandle: "scene", to: "render", toHandle: "scene" },
      { from: "model", fromHandle: "object", to: "render", toHandle: "object" },
    ],
  },
  {
    id: "ar-notes",
    name: "AR sticky notes",
    desc: "Pinch to place sticky notes in 3D space (synced to the room)",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "depth", type: "depth-field", dx: COL, dy: -ROW, config: {} },
      { key: "hand", type: "hand-space", dx: COL, dy: 0, config: {} },
      { key: "cal", type: "spatial-calibration", dx: COL * 2, dy: -ROW / 2, config: { nearMeters: 0.2, farMeters: 2.5, fovDegrees: 60 } },
      { key: "notes", type: "ar-notes", dx: COL * 3, dy: 0, config: { text: "📌 note" } },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "depth", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "hand", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "notes", toHandle: "frame" },
      { from: "depth", fromHandle: "depth", to: "cal", toHandle: "depth" },
      { from: "hand", fromHandle: "hand", to: "cal", toHandle: "hand" },
      { from: "cal", fromHandle: "space", to: "notes", toHandle: "space" },
    ],
  },
  {
    id: "vision-narrator",
    name: "Vision narrator",
    desc: "Describe what the camera sees, out loud — caption → translate → speech",
    builtin: true,
    nodes: [
      // 0.5 fps: vit-gpt2 captioning takes ~1–2s/frame, keep the queue drained.
      { key: "cam", type: "camera", dx: 0, dy: 0, config: { fps: 0.5 } },
      { key: "cap", type: "model", dx: COL, dy: 0, config: { task: "image-to-text", model: "Xenova/vit-gpt2-image-captioning", dtype: "fp32" } },
      // diff+filter gate: speak only when the caption actually changes, and
      // strip the git-diff markup down to the fresh caption text.
      { key: "diff", type: "text-diff", dx: COL * 2, dy: 0, config: { style: "gitdiff" } },
      { key: "fresh", type: "text-filter", dx: COL * 3, dy: 0, config: { mode: "diff-added", stripPrefix: true } },
      { key: "tr", type: "browser-translate-api", dx: COL * 4, dy: 0, config: { lang: "ja", sourceLang: "en" } },
      { key: "tts", type: "tts", dx: COL * 5, dy: 0 },
      { key: "sink", type: "sink", dx: COL * 5, dy: ROW },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "cap", toHandle: "in_img" },
      { from: "cap", fromHandle: "out_txt", to: "diff", toHandle: "in" },
      { from: "diff", fromHandle: "out", to: "fresh", toHandle: "in" },
      { from: "fresh", fromHandle: "out", to: "tr", toHandle: "in" },
      { from: "tr", fromHandle: "out", to: "tts", toHandle: "in" },
      { from: "tr", fromHandle: "out", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "gesture-speak",
    name: "Gesture → speech",
    desc: "Camera → hand gesture recognition → spoken when the gesture changes",
    builtin: true,
    nodes: [
      { key: "cam", type: "camera", dx: 0, dy: 0 },
      { key: "gest", type: "vision-model", dx: COL, dy: 0, config: { task: "gesture" } },
      { key: "diff", type: "text-diff", dx: COL * 2, dy: 0 },
      { key: "tts", type: "tts", dx: COL * 3, dy: 0 },
    ],
    edges: [
      { from: "cam", fromHandle: "out", to: "gest", toHandle: "in" },
      { from: "gest", fromHandle: "labels", to: "diff", toHandle: "in" },
      { from: "diff", fromHandle: "out", to: "tts", toHandle: "in" },
    ],
  },
  {
    id: "find-image",
    name: "Find image on screen",
    desc: "Screen share + pattern image → highlighted matches, count & positions",
    builtin: true,
    nodes: [
      { key: "screen", type: "screen-share", dx: 0, dy: 0 },
      { key: "pat", type: "file-image", dx: 0, dy: ROW },
      { key: "match", type: "image-match", dx: COL, dy: ROW / 2 },
      { key: "sink", type: "sink", dx: COL * 2, dy: ROW / 2 },
    ],
    edges: [
      { from: "screen", fromHandle: "out", to: "match", toHandle: "in" },
      { from: "pat", fromHandle: "out", to: "match", toHandle: "pattern" },
      { from: "match", fromHandle: "json", to: "sink", toHandle: "in" },
    ],
  },
  {
    id: "caption-objects",
    name: "Caption + objects",
    desc: "Voice captions and webcam object labels side by side",
    builtin: true,
    nodes: [
      { key: "mic", type: "mic-vad", dx: 0, dy: 0 },
      { key: "stt", type: "stt", dx: COL, dy: 0 },
      { key: "vsink", type: "sink", dx: COL * 2, dy: 0 },
      { key: "cam", type: "camera", dx: 0, dy: ROW },
      { key: "yolo", type: "vision-model", dx: COL, dy: ROW },
      { key: "osink", type: "sink", dx: COL * 2, dy: ROW },
    ],
    edges: [
      { from: "mic", fromHandle: "out", to: "stt", toHandle: "in" },
      { from: "stt", fromHandle: "out", to: "vsink", toHandle: "in" },
      { from: "cam", fromHandle: "out", to: "yolo", toHandle: "in" },
      { from: "yolo", fromHandle: "labels", to: "osink", toHandle: "in" },
    ],
  },
];

// ---- User templates (localStorage) ----------------------------------------

const KEY = "otoji.templates";

export function loadUserTemplates(): GraphTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GraphTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(list: GraphTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota */
  }
}

export function saveUserTemplate(t: GraphTemplate): GraphTemplate[] {
  const list = loadUserTemplates().filter((x) => x.id !== t.id);
  list.push(t);
  persist(list);
  return list;
}

export function deleteUserTemplate(id: string): GraphTemplate[] {
  const list = loadUserTemplates().filter((x) => x.id !== id);
  persist(list);
  return list;
}

/** Build a template from a selection of nodes (+ the edges fully inside it).
 *  Positions are normalized so the top-left node sits at the origin. */
export function templateFromSelection(
  name: string,
  sel: { id: string; type: NodeType; x: number; y: number; config?: Record<string, unknown> }[],
  edges: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }[],
  idSuffix: string,
): GraphTemplate {
  const minX = Math.min(...sel.map((n) => n.x));
  const minY = Math.min(...sel.map((n) => n.y));
  const keyOf = new Map(sel.map((n, i) => [n.id, `n${i}`]));
  const ids = new Set(sel.map((n) => n.id));
  return {
    id: `user-${idSuffix}`,
    name,
    nodes: sel.map((n) => ({
      key: keyOf.get(n.id)!,
      type: n.type,
      dx: n.x - minX,
      dy: n.y - minY,
      config: n.config && Object.keys(n.config).length ? n.config : undefined,
    })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        from: keyOf.get(e.source)!,
        fromHandle: e.sourceHandle ?? "out",
        to: keyOf.get(e.target)!,
        toHandle: e.targetHandle ?? "in",
      })),
  };
}

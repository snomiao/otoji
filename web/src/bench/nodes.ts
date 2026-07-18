import { GraphRuntime, type RuntimeHooks } from "../graph/runtime";
import { NODE_SPECS, edgeId, emptyGraph, type NodeType, type VoiceGraph } from "../graph/model";

export interface NodeBenchResult {
  node: NodeType;
  label: string;
  status: "ran" | "skipped" | "failed";
  reason?: string;
  iterations?: number;
  meanMs?: number;
  p50Ms?: number;
  p95Ms?: number;
  minMs?: number;
  maxMs?: number;
  outputs?: number;
  errors?: string[];
}

export interface NodeBenchOptions {
  iterations?: number;
  includeHeavy?: boolean;
}

const EMPTY_AUDIO = { samples: new Float32Array(0), sampleRate: 16000, durationMs: 0 };
const SAMPLE_TEXT = [
  "hello world",
  "this line is added",
  "screen OCR changed the visible content",
].join("\n");

const SKIP: Partial<Record<NodeType, string>> = {
  "mic-vad": "needs microphone permission and real-time audio",
  "mic-raw": "needs microphone permission and real-time audio",
  stt: "downloads/runs SenseVoice model; enable includeHeavy for separate model benchmarks",
  "web-speech": "opens browser-native speech recognizer and microphone",
  vosk: "downloads/runs Vosk model; streaming model benchmark should be separate",
  sherpa: "requires local otoji server websocket",
  "vibevoice-asr": "requires an external VibeVoice vLLM server",
  translate: "downloads/runs WebLLM model unless configured as browser provider",
  "browser-translate-api": "depends on Chrome built-in Translator availability/download packs",
  "llm-agent": "downloads/runs transformers.js text model",
  "model-source": "fetches external model registry metadata",
  model: "generic model node; benchmark per configured task/model",
  "tts-model": "downloads/runs neural TTS model",
  tts: "speaks through OS/browser SpeechSynthesis as an audible side effect",
  speaker: "plays audio through output hardware",
  camera: "needs camera permission and real-time video",
  "screen-share": "needs getDisplayMedia picker and real screen frames",
  "paddle-ocr": "downloads/runs OCR ONNX models; benchmark separately with fixed image set",
  "vision-model": "downloads/runs vision model; benchmark per task/model",
  "qwen-image": "requires an external Qwen Image runner URL",
  "video-recorder": "uses MediaRecorder and wall-clock recording duration",
  "video-clip": "needs an IndexedDB/video blob fixture",
};

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

function summarize(node: NodeType, samples: number[], outputs: number, errors: string[]): NodeBenchResult {
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  return {
    node,
    label: NODE_SPECS[node].label,
    status: errors.length ? "failed" : "ran",
    iterations: samples.length,
    meanMs: mean,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    outputs,
    errors: errors.length ? errors : undefined,
  };
}

function textSourceGraph(node: NodeType, config: Record<string, unknown> = {}): VoiceGraph {
  const g = emptyGraph();
  g.nodes.src = { id: "src", type: "textarea", device: null, pos: { x: 0, y: 0 }, config: { text: SAMPLE_TEXT } };
  g.nodes.n = { id: "n", type: node, device: null, pos: { x: 1, y: 0 }, config };
  g.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 2, y: 0 } };
  g.edges = [
    { id: edgeId({ source: "src", sourceHandle: "out", target: "n", targetHandle: "in" }), source: "src", sourceHandle: "out", target: "n", targetHandle: "in" },
    { id: edgeId({ source: "n", sourceHandle: "out", target: "sink", targetHandle: "in" }), source: "n", sourceHandle: "out", target: "sink", targetHandle: "in" },
  ];
  return g;
}

function sourceToSinkGraph(node: NodeType, sourceHandle = "out", config: Record<string, unknown> = {}): VoiceGraph {
  const g = emptyGraph();
  g.nodes.n = { id: "n", type: node, device: null, pos: { x: 0, y: 0 }, config };
  g.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 1, y: 0 } };
  g.edges = [{ id: edgeId({ source: "n", sourceHandle, target: "sink", targetHandle: "in" }), source: "n", sourceHandle, target: "sink", targetHandle: "in" }];
  return g;
}

function dataTextUrl(text: string): string {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

function wavUrl(): string {
  const sr = 16000;
  const samples = new Int16Array(sr / 20);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(Math.sin(i / 5) * 12000);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (off: number, s: string) => [...s].forEach((ch, i) => view.setUint8(off + i, ch.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i]!, true);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function pngUrl(): string {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(2, 2, 4, 4);
    return c.toDataURL("image/png");
  }
  // 1x1 black PNG fixture that createImageBitmap can decode in Chrome.
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mMAAQAABQABDQottAAAAABJRU5ErkJggg==";
}

function graphFor(node: NodeType): VoiceGraph | null {
  if (node === "environment") return sourceToSinkGraph("environment", "env", { label: "Bench env", runtime: "browser" });
  if (node === "textarea") return sourceToSinkGraph("textarea", "out", { text: SAMPLE_TEXT });
  if (node === "file-text") return sourceToSinkGraph("file-text", "out", { url: dataTextUrl(SAMPLE_TEXT) });
  if (node === "url") return sourceToSinkGraph("url", "out", { url: dataTextUrl(SAMPLE_TEXT) });
  if (node === "text-normalize") return textSourceGraph("text-normalize", { mode: "ocr-stable" });
  if (node === "text-filter") return textSourceGraph("text-filter", { mode: "regex-keep", pattern: "line|changed|hello", flags: "i" });
  if (node === "text-diff") return textSourceGraph("text-diff", { style: "gitdiff" });
  if (node === "pipe") return textSourceGraph("pipe");
  if (node === "sink" || node === "srt-out") {
    const g = emptyGraph();
    g.nodes.src = { id: "src", type: "textarea", device: null, pos: { x: 0, y: 0 }, config: { text: SAMPLE_TEXT } };
    g.nodes.n = { id: "n", type: node, device: null, pos: { x: 1, y: 0 } };
    g.edges = [{ id: "e", source: "src", sourceHandle: "out", target: "n", targetHandle: "in" }];
    return g;
  }
  if (node === "text-aggregate") {
    const g = emptyGraph();
    g.nodes.ocr = { id: "ocr", type: "textarea", device: null, pos: { x: 0, y: 0 }, config: { text: "OCR text changed" } };
    g.nodes.voice = { id: "voice", type: "textarea", device: null, pos: { x: 0, y: 1 }, config: { text: "voice asks translate it" } };
    g.nodes.n = { id: "n", type: "text-aggregate", device: null, pos: { x: 1, y: 0 } };
    g.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 2, y: 0 } };
    g.edges = [
      { id: "e1", source: "ocr", sourceHandle: "out", target: "n", targetHandle: "ocr" },
      { id: "e2", source: "voice", sourceHandle: "out", target: "n", targetHandle: "voice" },
      { id: "e3", source: "n", sourceHandle: "out", target: "sink", targetHandle: "in" },
    ];
    return g;
  }
  if (node === "file-audio" || node === "audio-out") {
    const g = emptyGraph();
    g.nodes.src = { id: "src", type: "file-audio", device: null, pos: { x: 0, y: 0 }, config: { url: wavUrl() } };
    g.nodes.n = { id: "n", type: node === "audio-out" ? "audio-out" : "sink", device: null, pos: { x: 1, y: 0 } };
    g.edges = [{ id: "e", source: "src", sourceHandle: "out", target: "n", targetHandle: node === "audio-out" ? "seg" : "in" }];
    return g;
  }
  if (node === "file-image") return sourceToSinkGraph("file-image", "out", { url: pngUrl() });
  if (node === "image-match") {
    const g = emptyGraph();
    g.nodes.pattern = { id: "pattern", type: "file-image", device: null, pos: { x: 0, y: 0 }, config: { url: pngUrl() } };
    g.nodes.frame = { id: "frame", type: "file-image", device: null, pos: { x: 0, y: 1 }, config: { url: pngUrl() } };
    g.nodes.n = { id: "n", type: "image-match", device: null, pos: { x: 1, y: 0 }, config: { threshold: 0.1, maxMatches: 1 } };
    g.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 2, y: 0 } };
    g.edges = [
      { id: "e1", source: "pattern", sourceHandle: "out", target: "n", targetHandle: "pattern" },
      { id: "e2", source: "frame", sourceHandle: "out", target: "n", targetHandle: "in" },
      { id: "e3", source: "n", sourceHandle: "count", target: "sink", targetHandle: "in" },
    ];
    return g;
  }
  if (node === "tracker") {
    const g = emptyGraph();
    g.nodes.n = { id: "n", type: "tracker", device: null, pos: { x: 0, y: 0 } };
    return g;
  }
  return null;
}

export async function benchmarkNode(node: NodeType, options: NodeBenchOptions = {}): Promise<NodeBenchResult> {
  const iterations = options.iterations ?? 12;
  const skip = SKIP[node];
  if (skip && !options.includeHeavy) return { node, label: NODE_SPECS[node].label, status: "skipped", reason: skip };
  const graph = graphFor(node);
  if (!graph) return { node, label: NODE_SPECS[node].label, status: "skipped", reason: "no synthetic fixture yet" };
  const samples: number[] = [];
  let outputs = 0;
  const errors: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const hooks: RuntimeHooks = {
      onSink: () => { outputs++; },
      onAudio: () => { outputs++; },
      onImage: () => { outputs++; },
      onPipeOut: () => { outputs++; },
      onRecognized: () => { outputs++; },
      onError: (e) => errors.push(e.message),
    };
    const rt = new GraphRuntime(graph, hooks);
    const t0 = performance.now();
    await rt.start();
    await rt.stop();
    samples.push(performance.now() - t0);
  }
  return summarize(node, samples, outputs, errors);
}

export async function benchmarkNodes(options: NodeBenchOptions = {}): Promise<NodeBenchResult[]> {
  const types = Object.keys(NODE_SPECS) as NodeType[];
  const out: NodeBenchResult[] = [];
  for (const node of types) out.push(await benchmarkNode(node, options));
  return out;
}

export function formatNodeBenchmarkTable(results: NodeBenchResult[]): string {
  const rows = results.map((r) => {
    if (r.status !== "ran") return `${r.node.padEnd(22)} ${r.status.padEnd(7)} ${r.reason ?? ""}`;
    const mean = r.meanMs!.toFixed(2).padStart(8);
    const p50 = r.p50Ms!.toFixed(2).padStart(8);
    const p95 = r.p95Ms!.toFixed(2).padStart(8);
    return `${r.node.padEnd(22)} ran     mean=${mean}ms p50=${p50}ms p95=${p95}ms outputs=${r.outputs}`;
  });
  return ["node                   status  result", ...rows].join("\n");
}

declare global {
  interface Window {
    __otojiBenchNodes?: typeof benchmarkNodes;
  }
}

if (typeof window !== "undefined") {
  window.__otojiBenchNodes = benchmarkNodes;
}

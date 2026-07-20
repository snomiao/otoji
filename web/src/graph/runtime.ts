// Single-device graph runtime (M3): instantiate node runners for a VoiceGraph
// and wire them per edges. Messages flow in-process; cross-device edges (M4)
// will later be realized over data channels.

import { acceptsPartialInput, type VoiceGraph, type NodeType, type VoiceNode } from "./model";
import { startMicVad, startMicRaw, segmentSamples, MIC_VAD_SR, type MicVadHandle } from "../lib/mic-vad";
import { clusterSegments, mixCluster, type TimedSegment } from "../lib/audio-mix";
import { fileStore } from "./file-store";
import { sttRecognize, warmSenseVoice } from "../providers/stt/sensevoice";
import { SENSEVOICE_MODELS } from "../providers/stt/sensevoice-models";
import { createZipformerStream, zipformerModelFromSource, zipformerPathsFromBase, type ZipformerStream } from "../providers/stt/zipformer";
import { webllmTranslate } from "../providers/translate/webllm";
import { browserTranslate } from "../providers/translate/browser-translator";
import { DEFAULT_TRANSLATE_LANG, DEFAULT_TRANSLATE_MODEL, langNameToCode } from "../providers/translate/translate-config";
import { neuralTts } from "../providers/tts/neural";
import { DEFAULT_NEURAL_TTS_MODEL, AUTO_TTS_MODEL, AUTO_TTS_VOICE, langToTtsModel, voiceMatchesLang } from "../providers/tts/tts-config";
import { runAsr, runImageToText, runText, runTts, warmPipe, type ModelTask } from "../providers/model/transformers-pipeline";
import { createVoskStream, warmVosk, DEFAULT_VOSK_MODEL, type VoskStream } from "../providers/stt/vosk";
import { createSherpaNativeStream, DEFAULT_SHERPA_SERVER_URL, type SherpaNativeStream } from "../providers/stt/sherpa_native";
import { checkVibeVoiceServer, transcribeVibeVoice, DEFAULT_VIBEVOICE_MLX_MODEL, DEFAULT_VIBEVOICE_SERVER, DEFAULT_VIBEVOICE_VLLM_MODEL, type VibeVoiceBackend } from "../providers/stt/vibevoice";
import { startCamera, clampFps, DEFAULT_CAMERA_FPS, type CameraCaptureInfo, type CameraHandle } from "../providers/vision/camera";
import { startScreenShare, type ScreenHandle } from "../providers/vision/screen";
import { ocrModelFromSource, ocrRecognize, warmOcr, type OcrModelRef } from "../providers/vision/paddleocr";
import { detect, drawDetections, warmDetect, DEFAULT_DETECT_MODEL } from "../providers/vision/detect";
import { estimateDepth, estimateDepthField, warmDepth } from "../providers/vision/depth";
import { landmarks, drawLandmarks, drawSpatialMonkey, formatLandmarksLabels, formatLandmarksJson, warmMediapipe, prewarmMediapipe, type MpTask } from "../providers/vision/mediapipe";
import { matchTemplate, drawMatches, formatMatchLabels, formatMatchJson, type Match } from "../providers/vision/match";
import { generateQwenImage } from "../providers/vision/qwen-image";
import { SpatialSceneRenderer, type CalibratedSpace, type DepthField, type RgbdPointCloud, type SpatialObjectDescriptor } from "../providers/vision/spatial-renderer";
import { ArNotesRenderer, PinchTracker, placeNote, type ArNote } from "../providers/vision/ar-notes";
import { calibrateSpatialCursor, SpatialCursorPublisher, type DepthFieldData, type HandSpaceData, type SpatialCalibrationOptions } from "./spatial-cursor";
import { formatLabels, formatJsonl, type Detection } from "../lib/detect-format";
import { diffText, type DiffStyle, DEFAULT_DIFF_STYLE } from "../lib/textdiff";
import { isPreviewShown } from "../lib/prefs";
import type { SttLevel } from "../providers/types";
import { buildControlFrame, buildImageFrame, buildModelFrame, buildSegmentFrame, buildSpatialFrame, buildTranscriptFrame, frameToMessage, type EdgeFrame } from "./frames";
import { videoClipsDB, type VideoClip } from "../lib/video-clips-db";
import { modelSourceToText, resolveModelSource, type ModelRuntime, type ModelSourceMsg } from "../providers/model/model-source";
import { parseGraphCommands, type GraphCommand } from "./graph-commands";

const DEFAULT_LLM_AGENT_MODEL = "Xenova/flan-t5-small";
const DEFAULT_LLM_AGENT_TEXT_GENERATION_MODEL = "onnx-community/gemma-3-1b-it-ONNX";
const DEFAULT_WEBLLM_AGENT_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const DEFAULT_LLM_AGENT_INSTRUCTION =
  "You are an assistant watching a shared screen and listening to its audio. Summarize what changed, answer any spoken request, and keep the response concise.";

function llmAgentTask(task: unknown): "text2text" | "text-generation" {
  return task === "text-generation" ? "text-generation" : "text2text";
}

function defaultLlmAgentModel(task: "text2text" | "text-generation"): string {
  return task === "text-generation" ? DEFAULT_LLM_AGENT_TEXT_GENERATION_MODEL : DEFAULT_LLM_AGENT_MODEL;
}

export function incompatibleModelRuntime(source: ModelSourceMsg, runtime: ModelRuntime): Error | null {
  const compatibility = source.compatibility;
  if (!compatibility || compatibility.runtimes.includes(runtime)) return null;
  const formats = compatibility.formats.join(", ") || "unknown format";
  const runtimes = compatibility.runtimes.join(", ") || "no compatible runtime inferred";
  const reason = compatibility.issues?.length ? ` ${compatibility.issues.join("; ")}.` : "";
  const runtimeLabel = runtime === "browser" ? "Browser" : runtime === "diffusers" ? "Diffusers" : runtime === "remote" ? "Remote" : runtime;
  return new Error(`${source.title || source.id} is not ${runtime}-runnable (${formats}; ${runtimes}).${reason} Choose the ${runtimeLabel} runtime filter or bind a compatible Environment.`);
}

type TextNormalizeMode = "light" | "ocr-stable" | "llm-filter";

function normalizeLineKey(line: string): string {
  return line
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu, "");
}

function normalizeTranscriptText(text: string, mode: TextNormalizeMode = "ocr-stable", prevKeys?: Set<string>): { text: string; keys: Set<string> } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .map((line) => line.normalize("NFKC"))
    .filter(Boolean);
  if (mode === "light") {
    const keys = new Set(lines.map(normalizeLineKey).filter(Boolean));
    return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), keys };
  }
  const out: string[] = [];
  const keys = new Set<string>();
  for (const line of lines) {
    const key = normalizeLineKey(line);
    if (!key || keys.has(key)) continue;
    // Drop very short OCR specks and symbol-heavy rows; keep CJK rows a little
    // shorter because each character carries more information.
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line);
    const minLen = cjk ? 3 : 5;
    if (key.length < minLen) continue;
    const signalChars = [...line].filter((ch) => /[\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)).length;
    if (signalChars / Math.max(1, [...line].length) < 0.45) continue;
    // After the first frame, prefer lines that persist across adjacent OCR
    // frames. This suppresses frame-to-frame OCR hallucinations before diffing.
    if (prevKeys && prevKeys.size && !prevKeys.has(key) && key.length < 18) continue;
    keys.add(key);
    out.push(line);
  }
  return { text: out.join("\n").trim(), keys };
}

type TextFilterMode = "diff-added" | "diff-removed" | "regex-keep" | "regex-drop" | "regex-replace";

function filterTranscriptText(text: string, cfg: Record<string, unknown>): string {
  const mode = ((cfg.mode as string | undefined) ?? "diff-added") as TextFilterMode;
  const lines = text.split("\n");
  const strip = (cfg.stripPrefix as boolean | undefined) ?? false;
  if (mode === "diff-added") return lines.filter((l) => l.startsWith("+")).map((l) => strip ? l.slice(1) : l).join("\n").trim();
  if (mode === "diff-removed") return lines.filter((l) => l.startsWith("-")).map((l) => strip ? l.slice(1) : l).join("\n").trim();
  const pattern = String(cfg.pattern ?? "").trim();
  if (!pattern) return text;
  let re: RegExp;
  try {
    re = new RegExp(pattern, String(cfg.flags ?? "i"));
  } catch {
    return text;
  }
  if (mode === "regex-keep") return lines.filter((l) => re.test(l)).join("\n").trim();
  if (mode === "regex-drop") return lines.filter((l) => !re.test(l)).join("\n").trim();
  return text.replace(re, String(cfg.replace ?? "")).trim();
}

export interface SegmentMsg {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  offsetMs?: number; // start of this segment in the source timeline (file/mic)
  ts?: number; // wall-clock epoch (ms) of the FIRST sample — used to time-align mixing
  // Two-pass linkage (M6.3): a streaming recognizer's `utterance` output tags
  // the audio with the provisional transcript it belongs to, so a second-pass
  // ASR can emit a final revision that supersedes it.
  segmentId?: number;
  revision?: number; // revision of the provisional this audio corresponds to
  sourceId?: string; // node that minted the segmentId (collision namespace)
}

const CONTINUOUS_FRAME_MAX_MS = 400;
const CONTINUOUS_OFFSET_TOLERANCE_MS = 50;

/** True when two short audio frames belong to the same continuous timeline. */
export function isContinuationSegment(prev: SegmentMsg | undefined, next: SegmentMsg): boolean {
  if (!prev || prev.offsetMs === undefined || next.offsetMs === undefined) return false;
  if (prev.durationMs >= CONTINUOUS_FRAME_MAX_MS || next.durationMs >= CONTINUOUS_FRAME_MAX_MS) return false;
  return Math.abs(next.offsetMs - (prev.offsetMs + prev.durationMs)) <= CONTINUOUS_OFFSET_TOLERANCE_MS;
}
export interface TranscriptMsg {
  text: string;
  audio: SegmentMsg;
  lang?: string; // SenseVoice-detected source language (BCP-47-ish)
  emotion?: string; // SenseVoice SER tag (e.g. "HAPPY")
  event?: string; // SenseVoice AED tag (e.g. "Applause"/"BGM")
  tStartMs?: number; // absolute speech start in the source timeline (CTC-derived)
  tEndMs?: number; // absolute speech end
  // --- revision protocol (M6.0). All optional; absent = a plain final. ---
  // A streaming recognizer emits many revisions of one utterance: rising
  // `revision` numbers under one `segmentId`, ending in provisional/final. A
  // later revision REPLACES earlier text for the same segmentId; consumers
  // that don't track segments can simply ignore everything but finals.
  segmentId?: number; // utterance id, stable across revisions of one utterance
  revision?: number; // monotonic within a segmentId; higher supersedes lower
  status?: "partial" | "provisional" | "final"; // absent = "final" (back-compat)
  replacesRevision?: number; // pass-2 rewrite: the revision this final supersedes
  sourceId?: string; // node that minted segmentId — sinks key replacements on
  // (sourceId, segmentId) so two recognizers (or a restarted stream) can
  // never replace each other's rows
}
/** A captured video/image frame flowing on an "image" edge (single-device). */
export interface ImageMsg {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  ts: number; // capture time (ms epoch)
  capture?: CameraCaptureInfo;
}
/** A feedback signal on a "control" edge: a "next" credit pulse. */
export interface ControlMsg {
  pulse?: boolean; // "next": produce one frame (credit-based backpressure)
  ts: number;
}
export interface SpatialMsg<T = unknown> {
  data: T;
  ts: number;
}

/** Cross-device transport (implemented over the WebRTC PeerMesh). */
export interface Transport {
  /** Returns true if the frame was actually sent (false = dropped: no route/closed). */
  send(toDevice: string, frame: EdgeFrame): boolean;
  setReceiver(cb: (frame: EdgeFrame) => void): void;
}

export interface RuntimeSelf {
  myId: string;
  deviceIds: string[];
  transport: Transport;
}

export interface RuntimeHooks {
  modelId?: string;
  /** Distributed mode: which device we are + transport. Omit for single-device. */
  self?: RuntimeSelf;
  onLevel?: (nodeId: string, level: SttLevel) => void;
  onSegment?: (nodeId: string) => void; // a mic node produced a VAD segment
  onImage?: (nodeId: string, bitmap: ImageBitmap) => void; // a camera/ocr node produced a frame (preview)
  // A camera/screen node's live video stream started (or stopped: null) — for a
  // compositor-rendered <video> preview at native fps, independent of grab rate.
  onMedia?: (nodeId: string, stream: MediaStream | null) => void;
  onRecognized?: (nodeId: string, text: string) => void; // an STT node finished (text may be empty)
  onNodeBusy?: (nodeId: string, busy: boolean) => void; // node started/finished processing
  onQueue?: (nodeId: string, processing: string | null, queued: string[]) => void; // work queue state
  // Whether anyone (this device's own preview, or a remote subscriber) is viewing
  // this node's preview — keeps a lazy vision node running for cross-device viewers.
  hasPreviewConsumer?: (nodeId: string) => boolean;
  onSink?: (nodeId: string, tr: TranscriptMsg) => void;
  onGraphCommands?: (nodeId: string, commands: GraphCommand[]) => string[];
  onAudio?: (nodeId: string, audio: SegmentMsg) => void; // raw audio collected at audio-out
  onVideoClip?: (nodeId: string, clip: VideoClip) => void; // encoded video+audio collected at video-recorder
  onPipeOut?: (nodeId: string, text: string) => void; // pipe node input -> external CLI stdout
  onEdgeBytes?: (edgeId: string, bytes: number) => void; // payload bytes sent over a cross-device edge
  onNodeMetric?: (nodeId: string, metric: NodeMetricSample) => void;
  // A node wants to persist state into its own config (broadcast like any
  // graph edit). Used by ar-notes to store pinch-placed notes.
  onConfigPatch?: (nodeId: string, patch: Record<string, unknown>) => void;
  onStatus?: (s: string) => void;
  onError?: (e: Error) => void;
}

export interface NodeMetricSample {
  event: "start" | "stop" | "input" | "process" | "emit";
  durationMs?: number;
  port?: string;
  label?: string;
  ts?: number;
}

/**
 * The device that runs a node: its explicit assignment, or — for unassigned
 * nodes — a single deterministic owner (smallest device id) so exactly one
 * device executes it. With no devices known, returns null.
 */
export function nodeOwner(node: VoiceNode, onlineDeviceIds: string[]): string | null {
  // Device ids are STABLE (persisted), so an explicit assignment is honored even
  // when that device is offline — the node stays owned by it (shown offline, not
  // run) and is reclaimed when the device rejoins.
  if (node.device) return node.device;
  if (onlineDeviceIds.length === 0) return null;
  // Unassigned: a single deterministic owner among online devices.
  return [...onlineDeviceIds].sort()[0];
}

interface RuntimeNode {
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  input?(port: string, msg: unknown): void;
  replay?(): Promise<void> | void;
  dims?(): { width: number; height: number } | null; // camera: live stream size
}

// Below this an audio segment is too short to recognize; feeding 0/near-0 samples
// to an ONNX model triggers "Tensor shape.Size() must be >= 0" in onnxruntime-web.
const MIN_STT_SAMPLES = 256; // ~16ms @ 16kHz

export function vibeVoiceBufferDecision(bufferedDurationMs: number, segmentDurationMs: number, configuredMaxBufferMs: unknown): { durationMs: number; flush: boolean } {
  const configured = typeof configuredMaxBufferMs === "number" && Number.isFinite(configuredMaxBufferMs) ? configuredMaxBufferMs : 15000;
  const maxBufferMs = Math.min(60000, Math.max(1000, configured));
  const durationMs = bufferedDurationMs + segmentDurationMs;
  return { durationMs, flush: durationMs >= maxBufferMs };
}

/** Short label for a queue item (a text snippet). */
function snippet(t: string): string {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > 22 ? s.slice(0, 22) + "…" : s || "…";
}

/** Map "sourceNode:sourceHandle" -> list of {node, port} targets. */
export function buildAdjacency(graph: VoiceGraph): Map<string, { node: string; port: string }[]> {
  const adj = new Map<string, { node: string; port: string }[]>();
  for (const e of graph.edges) {
    const k = `${e.source}:${e.sourceHandle}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k)!.push({ node: e.target, port: e.targetHandle });
  }
  return adj;
}

export class GraphRuntime {
  private nodes = new Map<string, RuntimeNode>();
  private adj = new Map<string, { node: string; port: string }[]>();
  private running = false;

  constructor(
    private graph: VoiceGraph,
    private hooks: RuntimeHooks = {},
  ) {}

  replay(nodeId: string): Promise<void> | void {
    return this.nodes.get(nodeId)?.replay?.();
  }

  private isLocal(nodeId: string): boolean {
    const node = this.graph.nodes[nodeId];
    if (!node) return false;
    const self = this.hooks.self;
    if (!self) return true; // single-device: every node runs here
    return nodeOwner(node, self.deviceIds) === self.myId;
  }

  private emit(nodeId: string, port: string, msg: unknown): void {
    this.hooks.onNodeMetric?.(nodeId, { event: "emit", port, ts: Date.now() });
    // Partial transcript revisions are high-rate replace-events; deliver them
    // only to input ports that opted in (acceptsPartial). One policy for local
    // and cross-device targets — non-opted nodes never see partials at all.
    const isPartial = (msg as Partial<TranscriptMsg>)?.status === "partial";
    for (const t of this.adj.get(`${nodeId}:${port}`) ?? []) {
      if (isPartial) {
        const targetType = this.graph.nodes[t.node]?.type;
        if (!targetType || !acceptsPartialInput(targetType, t.port)) continue;
      }
      if (this.isLocal(t.node)) {
        this.nodes.get(t.node)?.input?.(t.port, msg);
      } else if (this.hooks.self) {
        void this.sendRemote(nodeId, port, t, msg);
      }
    }
  }

  private async sendRemote(nodeId: string, port: string, target: { node: string; port: string }, msg: unknown): Promise<void> {
    const self = this.hooks.self;
    if (!self) return;
    const owner = nodeOwner(this.graph.nodes[target.node], self.deviceIds);
    if (!owner) return;
    const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg> & Partial<ImageMsg> & Partial<ControlMsg> & Partial<SpatialMsg> & Partial<ModelSourceMsg>;
    let frame: EdgeFrame | null = null;
    if (m.data !== undefined) frame = buildSpatialFrame(target.node, target.port, m as SpatialMsg);
    else if (m.provider && m.model) frame = buildModelFrame(target.node, target.port, m as ModelSourceMsg);
    else if (m.text !== undefined) frame = buildTranscriptFrame(target.node, target.port, m as TranscriptMsg);
    else if (m.samples instanceof Float32Array) frame = buildSegmentFrame(target.node, target.port, m as SegmentMsg);
    else if (m.bitmap instanceof ImageBitmap) frame = await buildImageFrame(target.node, target.port, m as ImageMsg);
    else if (m.pulse !== undefined || m.ts !== undefined) frame = buildControlFrame(target.node, target.port, m as ControlMsg);
    if (!frame) return;
    const ok = self.transport.send(owner, frame);
    if (ok) {
      const bytes = (frame.samplesPcm16B64?.length ?? frame.samplesB64?.length ?? 0) + (frame.imageDataUrl?.length ?? 0) + (frame.text?.length ?? 0) + (frame.spatial ? JSON.stringify(frame.spatial).length : 0) + 80;
      this.hooks.onEdgeBytes?.(`${nodeId}:${port}->${target.node}:${target.port}`, bytes);
    }
  }

  private async onFrame(frame: EdgeFrame): Promise<void> {
    if (!this.isLocal(frame.target)) return;
    this.nodes.get(frame.target)?.input?.(frame.port, await frameToMessage(frame));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.adj = buildAdjacency(this.graph);

    // Instantiate only the nodes this device owns.
    for (const n of Object.values(this.graph.nodes)) {
      if (this.isLocal(n.id)) this.nodes.set(n.id, this.instrumentNode(n.id, this.build(n.id, n.type)));
    }
    this.hooks.self?.transport.setReceiver((f) => this.onFrame(f));

    const sttModels = new Set<string | undefined>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "stt" && this.isLocal(n.id)) sttModels.add((n.config?.model as string | undefined) ?? this.hooks.modelId);
    }
    if (sttModels.size) {
      this.hooks.onStatus?.("loading model…");
      try {
        await Promise.all([...sttModels].map((m) => warmSenseVoice(m)));
      } catch (e) {
        // STT is one branch in a multimodal graph. A missing/broken worker should
        // disable that branch, not prevent screen/OCR/vision nodes from running.
        this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
        this.hooks.onStatus?.("STT model load failed");
      }
    }

    // Preload Vosk streaming models — non-fatal (a failure only disables that node).
    const voskModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "vosk" && this.isLocal(n.id)) voskModels.add((n.config?.model as string | undefined) ?? DEFAULT_VOSK_MODEL);
    }
    if (voskModels.size) {
      this.hooks.onStatus?.("loading streaming STT model…");
      await Promise.all([...voskModels].map((u) => warmVosk(u).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))))));
    }

    // Preload translate (in-browser LLM) models — only for nodes using the LLM
    // backend; the browser Translator API downloads packs lazily. Non-fatal: a
    // failure here only disables translate (passthrough), never aborts STT/sink.
    const translateModels = new Set<string>();
    // Skip on GPU-less machines: webllmTranslate.isAvailable() probes for a real
    // WebGPU adapter, so translate silently passes through instead of surfacing a
    // "no compatible GPU" error from deep inside WebLLM.
    if (webllmTranslate.isAvailable())
      for (const n of Object.values(this.graph.nodes)) {
        if (n.type === "translate" && this.isLocal(n.id) && (n.config?.provider ?? "llm") === "llm")
          translateModels.add((n.config?.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL);
      }
    if (translateModels.size) {
      this.hooks.onStatus?.("loading translate model…");
      await Promise.all(
        [...translateModels].map((m) =>
          webllmTranslate
            .warm(m, (p) => {
              if (p.progress !== undefined) this.hooks.onStatus?.(`translate model ${Math.round(p.progress * 100)}%`);
              else if (p.text) this.hooks.onStatus?.(p.text);
            })
            .catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Browser Translator API nodes: pre-download detector + likely packs now,
    // while we still have user activation from the Join click (Chrome needs it
    // to start a pack download, which would otherwise fail on first transcript).
    const browserTargets = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (
        this.isLocal(n.id) &&
        (n.type === "browser-translate-api" || (n.type === "translate" && n.config?.provider === "browser"))
      )
        browserTargets.add((n.config?.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG);
    }
    if (browserTargets.size) {
      this.hooks.onStatus?.("preparing browser translator…");
      await Promise.all(
        [...browserTargets].map((t) =>
          browserTranslate.warm(t).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // PaddleOCR (on-device ONNX) — preload det/rec models now if any OCR node is
    // local. Non-fatal: a failure only disables OCR, never aborts the rest.
    const ocrBases = new Set<string | undefined>();
    for (const n of Object.values(this.graph.nodes)) {
      // A connected Model provider overrides the default at runtime — don't
      // preload the stale fallback for those nodes.
      if (n.type === "paddle-ocr" && this.isLocal(n.id) && !this.hasIncoming(n.id, "model")) ocrBases.add(n.config?.modelsBase as string | undefined);
    }
    if (ocrBases.size) {
      this.hooks.onStatus?.("loading OCR model…");
      await Promise.all(
        [...ocrBases].map((b) =>
          warmOcr(b).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Vision models — preload weights now per node task. Non-fatal.
    const visionWarms: Array<Promise<unknown>> = [];
    const onVisionProgress = (p: { progress?: number; text?: string }) => {
      if (p.progress !== undefined) this.hooks.onStatus?.(`vision model ${Math.round(p.progress * 100)}%`);
      else if (p.text) this.hooks.onStatus?.(p.text);
    };
    for (const n of Object.values(this.graph.nodes)) {
      if (!this.isLocal(n.id)) continue;
      if (n.type === "depth-field") { visionWarms.push(warmDepth(n.config?.model as string | undefined, onVisionProgress)); continue; }
      if (n.type === "hand-space") { visionWarms.push(warmMediapipe("hand", onVisionProgress)); continue; }
      if (n.type !== "vision-model") continue;
      const task = (n.config?.task as string | undefined) ?? "detect";
      const m = n.config?.model as string | undefined;
      if (task === "depth") visionWarms.push(warmDepth(m, onVisionProgress));
      else if (task === "pose" || task === "hand" || task === "gesture" || task === "spatial-monkey") visionWarms.push(warmMediapipe(task === "spatial-monkey" ? "hand" : task, onVisionProgress));
      else visionWarms.push(warmDetect(m ?? DEFAULT_DETECT_MODEL, onVisionProgress));
    }
    if (visionWarms.length) {
      this.hooks.onStatus?.("loading vision model…");
      await Promise.all(visionWarms.map((p) => p.catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))))));
    }

    // Neural TTS (on-device ONNX) models — preload weights now. Non-fatal: a
    // failure only disables that node, never aborts the rest of the graph.
    const ttsModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "tts-model" && this.isLocal(n.id)) {
        // Auto-mode nodes resolve their model per-utterance from the transcript's
        // language, so they can't be preloaded here — they load lazily on first use.
        const m = n.config?.model as string | undefined;
        if (m && m !== AUTO_TTS_MODEL) ttsModels.add(m);
      }
    }
    if (ttsModels.size) {
      this.hooks.onStatus?.("loading TTS model…");
      await Promise.all(
        [...ttsModels].map((m) =>
          neuralTts
            .warm(m, (p) => {
              if (p.progress !== undefined) this.hooks.onStatus?.(`TTS model ${Math.round(p.progress * 100)}%`);
              else if (p.text) this.hooks.onStatus?.(p.text);
            })
            .catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Generic "Custom model" nodes — preload their transformers.js pipelines.
    const customModels: { task: ModelTask; model: string; dtype?: string }[] = [];
    const webllmAgentModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (!this.isLocal(n.id)) continue;
      const m = (n.config?.model as string | undefined)?.trim();
      if (n.type === "llm-agent") {
        // A connected provider is authoritative and may select a different
        // backend/model after startup. Do not preload the stale fallback.
        if (this.hasIncoming(n.id, "model")) continue;
        if (n.config?.backend === "webllm") {
          webllmAgentModels.add(m || DEFAULT_WEBLLM_AGENT_MODEL);
          continue;
        }
        const task = llmAgentTask(n.config?.task);
        customModels.push({ task, model: m || defaultLlmAgentModel(task), dtype: n.config?.dtype as string | undefined });
      }
      else if (n.type === "text-normalize" && n.config?.mode === "llm-filter") customModels.push({ task: "text2text", model: m || DEFAULT_LLM_AGENT_MODEL, dtype: n.config?.dtype as string | undefined });
      else if (n.type === "model" && m && !this.hasIncoming(n.id, "model")) customModels.push({ task: (n.config?.task as ModelTask | undefined) ?? "asr", model: m, dtype: n.config?.dtype as string | undefined });
    }
    if (customModels.length) {
      this.hooks.onStatus?.("loading custom model…");
      await Promise.all(
        customModels.map((c) =>
          warmPipe(c.task, c.model, c.dtype, (p) => {
            if (p.progress !== undefined) this.hooks.onStatus?.(`model ${Math.round(p.progress * 100)}%`);
            else if (p.text) this.hooks.onStatus?.(p.text);
          }).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }
    if (webllmAgentModels.size) {
      this.hooks.onStatus?.("loading Qwen WebLLM model…");
      await Promise.all([...webllmAgentModels].map((model) =>
        webllmTranslate.warm(model, (progress) => {
          if (progress.progress !== undefined) this.hooks.onStatus?.(`Qwen model ${Math.round(progress.progress * 100)}%`);
          else if (progress.text) this.hooks.onStatus?.(progress.text);
        }).catch((error) => this.hooks.onError?.(error instanceof Error ? error : new Error(String(error)))),
      ));
    }

    for (const node of this.nodes.values()) await node.start?.();

    // Now that cameras are live, precompile the MediaPipe GPU shaders at each
    // pose/hand node's *actual* camera resolution (the WebGL delegate compiles
    // per input size). Doing it here — during the loading window — hides the
    // one-off first-frame stall. Non-fatal and best-effort.
    const mpPrewarms: Array<Promise<void>> = [];
    for (const n of Object.values(this.graph.nodes)) {
      if (!this.isLocal(n.id) || (n.type !== "vision-model" && n.type !== "hand-space")) continue;
      const task = n.type === "hand-space" ? "hand" : (n.config?.task as string | undefined) ?? "detect";
      if (task !== "pose" && task !== "hand" && task !== "gesture" && task !== "spatial-monkey") continue;
      const cam = this.upstreamCamera(n.id);
      if (!cam) continue;
      mpPrewarms.push(
        this.waitForDims(cam).then((d) => (d ? prewarmMediapipe(task === "spatial-monkey" ? "hand" : task, d.width, d.height) : undefined)),
      );
    }
    if (mpPrewarms.length) {
      this.hooks.onStatus?.("preparing…");
      await Promise.all(mpPrewarms);
    }

    this.hooks.onStatus?.("running");
  }

  private instrumentNode(id: string, node: RuntimeNode): RuntimeNode {
    const timed = async (event: NodeMetricSample["event"], fn: () => Promise<void> | void) => {
      const t0 = performance.now();
      try {
        await fn();
      } finally {
        this.hooks.onNodeMetric?.(id, { event, durationMs: performance.now() - t0, ts: Date.now() });
      }
    };
    return {
      ...node,
      start: node.start ? () => timed("start", () => node.start!()) : undefined,
      stop: node.stop ? () => timed("stop", () => node.stop!()) : undefined,
      input: node.input
        ? (port, msg) => {
            const t0 = performance.now();
            try {
              node.input!(port, msg);
            } finally {
              this.hooks.onNodeMetric?.(id, { event: "input", port, durationMs: performance.now() - t0, ts: Date.now() });
            }
          }
        : undefined,
    };
  }

  /** The frame source (camera or screen share) feeding this node's `in` port. */
  private upstreamCamera(nodeId: string): RuntimeNode | null {
    for (const e of this.graph.edges) {
      if (e.target !== nodeId || e.targetHandle !== "in") continue;
      const srcType = this.graph.nodes[e.source]?.type;
      if (srcType !== "camera" && srcType !== "screen-share") continue;
      const node = this.nodes.get(e.source);
      if (node?.dims) return node;
    }
    return null;
  }

  /** Poll a camera node's dims until the stream reports a size (≤1s). */
  private async waitForDims(node: RuntimeNode): Promise<{ width: number; height: number } | null> {
    for (let i = 0; i < 20; i++) {
      const d = node.dims?.();
      if (d && d.width > 0 && d.height > 0) return d;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  private async emitVideoClip(nodeId: string, clip: VideoClip, fps = DEFAULT_CAMERA_FPS): Promise<void> {
    this.hooks.onNodeBusy?.(nodeId, true);
    this.hooks.onRecognized?.(nodeId, `playing clip ${(clip.durationMs / 1000).toFixed(1)}s`);
    const url = URL.createObjectURL(clip.blob);
    try {
      // Emit audio once as a segment. Downstream STT/audio-out can consume it
      // while image frames stream separately from the video element below.
      try {
        const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtor();
        const decoded = await audioCtx.decodeAudioData(await clip.blob.arrayBuffer());
        const mono = new Float32Array(decoded.length);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          const data = decoded.getChannelData(ch);
          for (let i = 0; i < data.length; i++) mono[i] += data[i]! / decoded.numberOfChannels;
        }
        await audioCtx.close().catch(() => {});
        if (mono.length) {
          this.emit(nodeId, "audio", {
            samples: mono,
            sampleRate: decoded.sampleRate,
            durationMs: (mono.length / decoded.sampleRate) * 1000,
            ts: Date.now(),
          } as SegmentMsg);
        }
      } catch (e) {
        this.hooks.onError?.(e instanceof Error ? e : new Error(`video clip audio decode failed: ${String(e)}`));
      }

      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("video clip failed to load"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, video.videoWidth || 1280);
      canvas.height = Math.max(2, video.videoHeight || 720);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let timer: ReturnType<typeof setInterval> | null = null;
      const emitFrame = async () => {
        if (video.readyState < 2) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        this.hooks.onImage?.(nodeId, bitmap);
        this.emit(nodeId, "video", { bitmap, width: bitmap.width, height: bitmap.height, ts: Date.now() } as ImageMsg);
      };
      const ended = new Promise<void>((resolve) => {
        video.onended = () => resolve();
      });
      await video.play().catch(() => undefined);
      await emitFrame();
      timer = setInterval(() => void emitFrame(), 1000 / clampFps(fps));
      await ended;
      if (timer) clearInterval(timer);
    } finally {
      URL.revokeObjectURL(url);
      this.hooks.onNodeBusy?.(nodeId, false);
    }
  }

  /**
   * Serialized work queue for an async node: tracks the item being processed and
   * those waiting, reporting both to the UI (onQueue) and the busy dot (onNodeBusy).
   */
  private makeQueue(id: string) {
    let chain: Promise<void> = Promise.resolve();
    const queued: string[] = [];
    let processing: string | null = null;
    const emit = () => {
      this.hooks.onQueue?.(id, processing, [...queued]);
      this.hooks.onNodeBusy?.(id, processing !== null);
    };
    return {
      run: (label: string, fn: () => Promise<void>) => {
        queued.push(label);
        emit();
        chain = chain.then(async () => {
          processing = queued.shift() ?? label;
          emit();
          const t0 = performance.now();
          try {
            await fn();
          } finally {
            this.hooks.onNodeMetric?.(id, { event: "process", label, durationMs: performance.now() - t0, ts: Date.now() });
            processing = null;
            emit();
          }
        });
        return chain;
      },
      drain: () => chain,
    };
  }

  /**
   * Latest-only worker: never queues. While a job runs, a newer submission just
   * replaces the single pending slot — intermediate frames are dropped. Used by
   * heavy real-time nodes (OCR) so they always work on the freshest input.
   */
  private makeLatest(id: string) {
    let busy = false;
    let pending: { label: string; fn: () => Promise<void> } | null = null;
    const pump = () => {
      if (busy || !pending) return;
      const job = pending;
      pending = null;
      busy = true;
      this.hooks.onNodeBusy?.(id, true);
      this.hooks.onQueue?.(id, job.label, []);
      const t0 = performance.now();
      job
        .fn()
        .catch(() => {})
        .finally(() => {
          this.hooks.onNodeMetric?.(id, { event: "process", label: job.label, durationMs: performance.now() - t0, ts: Date.now() });
          busy = false;
          this.hooks.onNodeBusy?.(id, false);
          this.hooks.onQueue?.(id, null, []);
          pump(); // run the latest frame that arrived while we were busy
        });
    };
    return {
      submit: (label: string, fn: () => Promise<void>) => {
        pending = { label, fn };
        pump();
      },
      idle: () => !busy && !pending,
    };
  }

  /** Does any edge feed a control signal into this node's `handle` input port? */
  private hasIncoming(nodeId: string, handle: string): boolean {
    return this.graph.edges.some((e) => e.target === nodeId && e.targetHandle === handle);
  }

  /** Does this node's `handle` output port have any downstream edge? */
  private hasOutgoing(nodeId: string, handle: string): boolean {
    return (this.adj.get(`${nodeId}:${handle}`)?.length ?? 0) > 0;
  }

  private build(id: string, type: NodeType): RuntimeNode {
    if (type === "environment") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      return {
        start: () => {
          const label = (cfg.label as string | undefined)?.trim() || "Browser environment";
          const runtime = (cfg.runtime as string | undefined)?.trim() || "browser";
          const scope = (cfg.scope as string | undefined)?.trim() || "device";
          const caps = [
            cfg.mic === false ? null : "mic",
            cfg.camera === false ? null : "camera",
            cfg.screen === false ? null : "screen",
            cfg.webgpu === false ? null : "webgpu",
            cfg.storage === false ? null : "storage",
            cfg.network === false ? null : "network",
          ].filter(Boolean).join(", ");
          this.hooks.onRecognized?.(id, `${label}\n${scope} · ${runtime}\n${caps || "no declared capabilities"}`);
        },
      };
    }

    if (type === "mic-vad") {
      let handle: MicVadHandle | null = null;
      const inputDeviceId = this.graph.nodes[id]?.config?.inputDeviceId as string | undefined;
      const aec = (this.graph.nodes[id]?.config?.aec as boolean | undefined) ?? true;
      return {
        start: async () => {
          const startEpoch = Date.now(); // wall clock of sample 0, for mix alignment
          handle = await startMicVad({
            deviceId: inputDeviceId,
            aec,
            onLevel: (l) => this.hooks.onLevel?.(id, l),
            onSegment: (samples, durationMs, offsetMs) => {
              this.hooks.onSegment?.(id);
              this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs, offsetMs, ts: startEpoch + (offsetMs ?? 0) } as SegmentMsg);
            },
          });
        },
        stop: async () => {
          await handle?.stop();
        },
      };
    }

    if (type === "web-speech") {
      // Browser-native streaming ASR (Web Speech API). Opens its own mic on this
      // device, emits interim results to the live preview and final ones downstream.
      const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
      const lang = (this.graph.nodes[id]?.config?.lang as string | undefined) || (typeof navigator !== "undefined" ? navigator.language : "en-US");
      let rec: any = null;
      let stopped = false;
      return {
        start: async () => {
          if (!SR) {
            this.hooks.onError?.(new Error("Web Speech API not available in this browser."));
            return;
          }
          rec = new SR();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = lang;
          rec.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i];
              const text = (r[0]?.transcript ?? "").trim();
              if (!text) continue;
              this.hooks.onRecognized?.(id, text); // live (interim + final) in preview
              if (r.isFinal)
                // Carry the recognition language so downstream auto-TTS / tts-model match it.
                this.emit(id, "out", { text, lang, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } } as TranscriptMsg);
            }
          };
          rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* already started */ } } }; // keep alive
          try { rec.start(); } catch (e) { this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))); }
        },
        stop: () => { stopped = true; try { rec?.stop(); } catch { /* ignore */ } },
      };
    }

    if (type === "stream-asr") {
      // In-browser streaming transducer (M6.1): continuous audio in, revision-
      // protocol transcripts out. Partials ride the same `out` port — the emit
      // layer only delivers them to acceptsPartial consumers (e.g. the sink's
      // live caption); finals reach everyone.
      const cfg = this.graph.nodes[id]?.config ?? {};
      let paths = ((cfg.modelsBase as string | undefined)?.trim())
        ? zipformerPathsFromBase((cfg.modelsBase as string).trim())
        : undefined;
      const revisions = new Map<number, number>();
      // Every (re)opened stream restarts its provider segIds at 0 — fold an
      // epoch into the public segmentId so a model-override restart can never
      // collide with rows an earlier stream already produced.
      let segEpoch = 0;
      const nextRevision = (segId: number): { segmentId: number; revision: number } => {
        const segmentId = segEpoch * 1_000_000 + segId;
        const revision = (revisions.get(segmentId) ?? 0) + 1;
        revisions.set(segmentId, revision);
        return { segmentId, revision };
      };
      const emptyAudio = () => ({ samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 });
      let stream: ZipformerStream | null = null;
      const openStream = () => {
        stream?.free();
        segEpoch += 1;
        stream = createZipformerStream({
          paths,
          endpointMs: typeof cfg.endpointMs === "number" ? (cfg.endpointMs as number) : undefined,
          onPartial: (text, segId) => {
            this.hooks.onRecognized?.(id, text);
            this.emit(id, "out", { text, audio: emptyAudio(), status: "partial", sourceId: id, ...nextRevision(segId) } as TranscriptMsg);
          },
          onFinal: (text, segId, audio) => {
            this.hooks.onRecognized?.(id, text);
            const rev = nextRevision(segId);
            revisions.delete(rev.segmentId);
            // With a two-pass consumer wired, the endpoint result is only
            // provisional — the utterance audio goes out for re-transcription
            // and the pass-2 final (replacesRevision) supersedes this text.
            const twoPass = this.hasOutgoing(id, "utterance");
            this.emit(id, "out", { text, audio: emptyAudio(), status: twoPass ? "provisional" : "final", sourceId: id, ...rev } as TranscriptMsg);
            if (twoPass && audio.length) {
              this.emit(id, "utterance", {
                samples: audio,
                sampleRate: MIC_VAD_SR,
                durationMs: (audio.length / MIC_VAD_SR) * 1000,
                segmentId: rev.segmentId,
                revision: rev.revision,
                sourceId: id,
              } as SegmentMsg);
            }
          },
          onError: (e) => this.hooks.onError?.(e),
          onProgress: (stage, received, total) => {
            if (total) this.hooks.onStatus?.(`streaming ASR: ${stage} ${Math.round((received / total) * 100)}%`);
          },
        });
      };
      return {
        start: async () => openStream(),
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const override = zipformerModelFromSource(src);
            if (override) {
              paths = override;
              this.hooks.onRecognized?.(id, `model override · ${src.title ?? src.model}`);
              openStream(); // restart on the new model (fresh utterance state)
            } else {
              this.hooks.onRecognized?.(id, "model provider is not a sherpa streaming-transducer export; using default");
            }
            return;
          }
          const seg = msg as SegmentMsg;
          if (seg.samples?.length) stream?.accept(seg.samples);
        },
        stop: async () => {
          await stream?.flush();
          stream?.free();
          stream = null;
        },
      };
    }

    if (type === "vosk") {
      // Streaming ASR: feed each incoming audio frame to a persistent Vosk
      // recognizer; partials → live preview, finals → downstream transcript.
      const url = (this.graph.nodes[id]?.config?.model as string | undefined) ?? DEFAULT_VOSK_MODEL;
      let stream: VoskStream | null = null;
      return {
        start: async () => {
          try {
            stream = await createVoskStream(
              url,
              (partial) => this.hooks.onRecognized?.(id, partial),
              (text) => {
                this.hooks.onRecognized?.(id, text);
                this.emit(id, "out", { text, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } } as TranscriptMsg);
              },
            );
          } catch (e) {
            // Non-fatal: a failed model load only disables this node, not the graph.
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => stream?.accept((msg as SegmentMsg).samples),
        stop: async () => { stream?.free(); stream = null; },
      };
    }

    if (type === "sherpa") {
      // Native sherpa-onnx STT bridged over a WebSocket to a local
      // `otoji server`. Same streaming shape as Vosk: feed audio frames,
      // partials → live preview, finals → downstream transcript.
      //
      // The stream is created at build time (synchronously) rather than in an
      // async start(): a file source emits its whole buffer during start(), and
      // if this node's WebSocket were still opening then, those segments would
      // be dropped. Creating it now means the provider's pre-open buffer catches
      // them; the socket connects in the background.
      const url = (this.graph.nodes[id]?.config?.serverUrl as string | undefined)?.trim() || DEFAULT_SHERPA_SERVER_URL;
      // Revision protocol: each server seg_id is one utterance; count revisions
      // locally so partial → final forms a monotonic replace-chain (M6.0). The
      // emit() layer only delivers partials to acceptsPartial ports.
      const revisions = new Map<number, number>();
      const nextRevision = (segId: number | undefined): { segmentId: number; revision: number } => {
        const segmentId = segId ?? 0;
        const revision = (revisions.get(segmentId) ?? 0) + 1;
        revisions.set(segmentId, revision);
        return { segmentId, revision };
      };
      const emptyAudio = () => ({ samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 });
      const stream: SherpaNativeStream = createSherpaNativeStream(
        url,
        (partial, segId) => {
          this.hooks.onRecognized?.(id, partial);
          this.emit(id, "out", { text: partial, audio: emptyAudio(), status: "partial", sourceId: id, ...nextRevision(segId) } as TranscriptMsg);
        },
        (text, segId) => {
          this.hooks.onRecognized?.(id, text);
          const rev = nextRevision(segId);
          revisions.delete(rev.segmentId); // utterance closed
          this.emit(id, "out", { text, audio: emptyAudio(), status: "final", sourceId: id, ...rev } as TranscriptMsg);
        },
        // Non-fatal: an unreachable server only disables this node. Point the
        // user at the one command that fixes it.
        (e) => this.hooks.onError?.(new Error(`sherpa: ${e.message}. Start it with:  otoji server`)),
      );
      return {
        input: (_port, msg) => stream.accept((msg as SegmentMsg).samples),
        stop: async () => stream.free(),
      };
    }

    if (type === "vibevoice-asr") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const baseUrl = (cfg.serverUrl as string | undefined)?.trim() || DEFAULT_VIBEVOICE_SERVER;
      const backend = ((cfg.backend as VibeVoiceBackend | undefined) ?? "mlx") as VibeVoiceBackend;
      let apiModel = (cfg.apiModel as string | undefined)?.trim()
        || (backend === "mlx" ? DEFAULT_VIBEVOICE_MLX_MODEL : DEFAULT_VIBEVOICE_VLLM_MODEL);
      const hotwords = cfg.hotwords as string | undefined;
      let sourceModel = "microsoft/VibeVoice-ASR";
      const q = this.makeQueue(id);
      let pending: SegmentMsg[] = [];
      let pendingDurationMs = 0;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
        const segments = pending;
        pending = [];
        pendingDurationMs = 0;
        if (!segments.length) return;
        const sampleRate = segments[0]?.sampleRate || MIC_VAD_SR;
        // offsets are ABSOLUTE source-timeline positions — rebase against the
        // earliest one, or an hour-old mic stream allocates an hour of leading
        // silence; and cap the real sample span, since the duration-sum cap
        // cannot see gaps between offsets
        const baseMs = Math.min(...segments.map((seg) => seg.offsetMs ?? Infinity));
        const rebase = Number.isFinite(baseMs) ? baseMs : 0;
        const maxSpan = Math.round(sampleRate * 60); // hard allocation ceiling: 60 s
        let appendAt = 0;
        const placements = segments.map((seg) => {
          let at = seg.offsetMs !== undefined ? Math.max(0, Math.round(((seg.offsetMs - rebase) / 1000) * sampleRate)) : appendAt;
          if (at > maxSpan) at = appendAt; // gap anomaly — fall back to contiguous
          appendAt = Math.min(maxSpan + seg.samples.length, Math.max(appendAt, at + seg.samples.length));
          return { at, samples: seg.samples };
        });
        const samples = new Float32Array(appendAt);
        for (const placement of placements) samples.set(placement.samples, placement.at);
        const merged: SegmentMsg = {
          samples,
          sampleRate,
          durationMs: (samples.length / sampleRate) * 1000,
          offsetMs: 0,
        };
        q.run(`VibeVoice · ${(merged.durationMs / 1000).toFixed(1)}s`, async () => {
          try {
            const text = await transcribeVibeVoice(merged.samples, merged.sampleRate, { baseUrl, model: apiModel, hotwords, backend });
            this.hooks.onRecognized?.(id, text);
            const caption = { text, audio: merged } as TranscriptMsg;
            this.emit(id, "out", caption);
            if (this.hasOutgoing(id, "caption")) this.emit(id, "caption", caption);
            if (this.hasOutgoing(id, "audio")) this.emit(id, "audio", merged);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            this.hooks.onError?.(new Error(`${error.message}. Start the VibeVoice vLLM server for ${sourceModel}`));
          }
        });
      };
      return {
        start: async () => {
          try {
            await checkVibeVoiceServer(baseUrl);
            this.hooks.onRecognized?.(id, `${backend} runner ready · ${apiModel}`);
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            const command = backend === "mlx" ? "mlx_audio.server --host 127.0.0.1 --port 8000" : "start the VibeVoice vLLM server";
            this.hooks.onError?.(new Error(`vibevoice: runner unavailable (${detail}). Run: ${command}`));
          }
        },
        input: (port, msg) => {
          if (port === "env") return;
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            sourceModel = src.model || sourceModel;
            apiModel = src.model || apiModel;
            this.hooks.onRecognized?.(id, `model override · ${apiModel}`);
            return;
          }
          if (port === "env") return;
          const seg = msg as SegmentMsg;
          if (!seg.samples?.length) return;
          pending.push(seg);
          const decision = vibeVoiceBufferDecision(pendingDurationMs, seg.durationMs, cfg.maxBufferMs);
          pendingDurationMs = decision.durationMs;
          if (flushTimer) clearTimeout(flushTimer);
          if (decision.flush) {
            flush();
            return;
          }
          flushTimer = setTimeout(flush, 400);
        },
        stop: async () => { flush(); await q.drain(); },
      };
    }

    if (type === "mic-raw") {
      let handle: MicVadHandle | null = null;
      const inputDeviceId = this.graph.nodes[id]?.config?.inputDeviceId as string | undefined;
      const aec = (this.graph.nodes[id]?.config?.aec as boolean | undefined) ?? true;
      const frameMs = this.graph.nodes[id]?.config?.frameMs as number | undefined;
      return {
        start: async () => {
          const startEpoch = Date.now(); // wall clock of sample 0, for mix alignment
          handle = await startMicRaw({
            deviceId: inputDeviceId,
            aec,
            frameMs,
            onLevel: (l) => this.hooks.onLevel?.(id, l),
            onFrame: (samples, offsetMs) => {
              this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs: (samples.length / MIC_VAD_SR) * 1000, offsetMs, ts: startEpoch + (offsetMs ?? 0) } as SegmentMsg);
            },
          });
        },
        stop: async () => { await handle?.stop(); },
      };
    }

    if (type === "audio-mix") {
      // Time-aligned additive mixer with a jitter buffer. Buffer incoming
      // segments, periodically cluster by wall-clock overlap, and flush a cluster
      // once it's settled (its end is older than `jitterMs`) so late-arriving
      // overlapping audio still lands in the same mix.
      const cfg = this.graph.nodes[id]?.config ?? {};
      const jitterMs = typeof cfg.jitterMs === "number" ? (cfg.jitterMs as number) : 300;
      const MAX_CLUSTER_MS = 20000; // force-flush a never-ending overlap
      let pending: TimedSegment[] = [];
      let timer: ReturnType<typeof setInterval> | null = null;
      const endOf = (s: TimedSegment) => s.ts + (s.samples.length / s.sampleRate) * 1000;
      const flush = (force: boolean) => {
        if (!pending.length) return;
        const now = Date.now();
        const keep: TimedSegment[] = [];
        for (const cl of clusterSegments(pending, 0)) {
          const start = Math.min(...cl.map((s) => s.ts));
          const end = Math.max(...cl.map(endOf));
          if (force || end + jitterMs < now || end - start >= MAX_CLUSTER_MS) {
            const { samples, ts } = mixCluster(cl, MIC_VAD_SR);
            this.hooks.onSegment?.(id);
            this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs: (samples.length / MIC_VAD_SR) * 1000, ts } as SegmentMsg);
          } else {
            keep.push(...cl);
          }
        }
        pending = keep;
      };
      return {
        start: () => { timer = setInterval(() => flush(false), 150); },
        input: (_port, msg) => {
          const s = msg as SegmentMsg;
          if (s.samples?.length) pending.push({ samples: s.samples, sampleRate: s.sampleRate || MIC_VAD_SR, ts: s.ts ?? Date.now() });
        },
        stop: () => { if (timer) clearInterval(timer); timer = null; flush(true); },
      };
    }

    if (type === "file-audio") {
      const url = (this.graph.nodes[id]?.config?.url as string | undefined)?.trim();
      const loop = (this.graph.nodes[id]?.config?.loop as boolean | undefined) ?? false;
      let current: SegmentMsg | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      const emitCurrent = () => {
        if (!current || stopped) return;
        this.hooks.onSegment?.(id);
        this.emit(id, "out", current);
        if (loop) timer = setTimeout(emitCurrent, Math.max(16, current.durationMs));
      };
      const replace = (audio: SegmentMsg) => {
        if (!audio.samples?.length) return;
        if (timer) clearTimeout(timer);
        current = audio;
        this.hooks.onAudio?.(id, audio);
        emitCurrent();
      };
      const replay = () => {
        if (timer) clearTimeout(timer);
        emitCurrent();
      };
      return {
        start: async () => {
          const entry = fileStore.get(id);
          if (!entry?.file && !url) return;
          try {
            // Local dropped file, or fetch a URL (synced in config — works on any device).
            const buf = entry?.file ? await entry.file.arrayBuffer() : await (await fetch(url!)).arrayBuffer();
            const OAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const decoded = await new OAC(1, 1, MIC_VAD_SR).decodeAudioData(buf); // resampled to 16k
            const len = decoded.length;
            const mono = new Float32Array(len);
            for (let c = 0; c < decoded.numberOfChannels; c++) {
              const d = decoded.getChannelData(c);
              for (let i = 0; i < len; i++) mono[i] += d[i] / decoded.numberOfChannels;
            }
            replace({ samples: mono, sampleRate: MIC_VAD_SR, durationMs: (mono.length / MIC_VAD_SR) * 1000, offsetMs: 0 });
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => replace(msg as SegmentMsg),
        replay,
        stop: () => { stopped = true; if (timer) clearTimeout(timer); },
      };
    }

    if (type === "file-image") {
      const url = (this.graph.nodes[id]?.config?.url as string | undefined)?.trim();
      const maxUpdates = Math.max(0, Number(this.graph.nodes[id]?.config?.maxUpdates ?? 0));
      let updates = 0;
      let current: ImageBitmap | null = null;
      let currentMessage: ImageMsg | null = null;
      const replace = (image: ImageMsg, count = true) => {
        if (image.bitmap === current || (count && maxUpdates > 0 && updates >= maxUpdates)) return;
        if (count) updates += 1;
        current = image.bitmap;
        currentMessage = image;
        this.hooks.onImage?.(id, image.bitmap);
        this.emit(id, "out", image);
      };
      return {
        start: async () => {
          const entry = fileStore.get(id);
          if (!entry?.file && !url) return;
          try {
            const blob = entry?.file ?? await (await fetch(url!)).blob();
            const bitmap = await createImageBitmap(blob);
            replace({ bitmap, width: bitmap.width, height: bitmap.height, ts: Date.now() } as ImageMsg, false);
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => replace(msg as ImageMsg),
        replay: () => { if (currentMessage) this.emit(id, "out", currentMessage); },
      };
    }

    if (type === "file-text") {
      const url = (this.graph.nodes[id]?.config?.url as string | undefined)?.trim();
      let current: TranscriptMsg | null = null;
      const replace = (value: TranscriptMsg) => {
        if (!value.text?.trim()) return;
        current = value;
        this.hooks.onRecognized?.(id, value.text);
        this.emit(id, "out", value);
      };
      return {
        start: async () => {
          try {
            const entry = fileStore.get(id);
            const text = entry?.text ?? (entry?.file ? await entry.file.text() : url ? await (await fetch(url)).text() : "");
            if (!text) return;
            replace({ text, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } });
          } catch (e) {
            // Non-fatal: a failed URL fetch only disables this node, not the graph.
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => replace(msg as TranscriptMsg),
        replay: () => { if (current) this.emit(id, "out", current); },
      };
    }

    if (type === "url") {
      const url = (this.graph.nodes[id]?.config?.url as string | undefined)?.trim();
      const empty = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      return {
        start: async () => {
          if (!url) return;
          let text = url;
          try {
            const res = await fetch(url);
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("text/html") || ct.startsWith("text/") || ct.includes("json")) {
              const raw = await res.text();
              text = ct.includes("text/html")
                ? raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000)
                : raw.slice(0, 12000);
            }
          } catch {
            // CORS/no-cors failures still leave the iframe preview useful.
          }
          this.hooks.onRecognized?.(id, text);
          this.emit(id, "out", { text, audio: empty } as TranscriptMsg);
        },
      };
    }

    if (type === "textarea") {
      // The Monaco editor's committed text. A commit changes config, config is
      // part of the auto-run signature, so the runtime restarts and start()
      // re-emits — the editor never has to reach into a live runtime.
      const text = ((this.graph.nodes[id]?.config?.text as string | undefined) ?? "").trim();
      const maxUpdates = Math.max(0, Number(this.graph.nodes[id]?.config?.maxUpdates ?? 0));
      let updates = 0;
      let current = "";
      let currentAudio: SegmentMsg = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      const replay = () => {
        if (!current) return;
        this.hooks.onRecognized?.(id, current);
        this.emit(id, "out", { text: current, audio: currentAudio } as TranscriptMsg);
      };
      const replace = (value: string, audio: SegmentMsg = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 }, count = true) => {
        const next = value.trim();
        if (!next || next === current || (count && maxUpdates > 0 && updates >= maxUpdates)) return;
        if (count) updates += 1;
        current = next;
        currentAudio = audio;
        replay();
      };
      return {
        start: () => {
          if (!text) return;
          replace(text, undefined, false);
        },
        input: (_port, msg) => {
          const transcript = msg as TranscriptMsg;
          replace(transcript.text, transcript.audio);
        },
        replay,
      };
    }

    if (type === "stt") {
      const q = this.makeQueue(id);
      let modelId = (this.graph.nodes[id]?.config?.model as string | undefined) ?? this.hooks.modelId;
      let previousSegment: SegmentMsg | undefined;
      let bufferingContinuousInput = false;
      let continuousNoticeShown = false;
      let pendingSegments: SegmentMsg[] = [];
      // Continuity is only provable when frame #2 arrives — hold a lone short
      // frame briefly instead of recognizing it solo, so a continuous stream's
      // first 250 ms doesn't become a spurious fragment caption.
      let heldShort: SegmentMsg | null = null;
      let heldTimer: ReturnType<typeof setTimeout> | null = null;
      const releaseHeld = () => {
        if (heldTimer) clearTimeout(heldTimer);
        heldTimer = null;
        if (heldShort) {
          const held = heldShort;
          heldShort = null;
          recognize(held);
        }
      };

      const recognize = (seg: SegmentMsg) => {
        q.run(`🔊 ${Math.round(seg.durationMs / 100) / 10}s`, async () => {
          try {
            const res = await sttRecognize(seg.samples, modelId);
            this.hooks.onRecognized?.(id, res.text);
            // Promote CTC speech extent to absolute timeline using the segment
            // offset (file/mic). Without an offset, leave times undefined so the
            // SRT builder falls back to sequential timing.
            const base = seg.offsetMs;
            const tStartMs = base !== undefined && res.startMs !== undefined ? base + res.startMs : undefined;
            const tEndMs = base !== undefined && res.endMs !== undefined ? base + res.endMs : undefined;
            const caption = {
              text: res.text,
              audio: seg,
              lang: res.lang,
              emotion: res.emotion,
              event: res.event,
              tStartMs,
              tEndMs,
              // Two-pass (M6.3): audio tagged with a provisional's identity
              // makes this result the final revision that supersedes it.
              ...(seg.segmentId !== undefined && seg.revision !== undefined
                ? { segmentId: seg.segmentId, revision: seg.revision + 1, replacesRevision: seg.revision, status: "final" as const }
                : {}),
            } as TranscriptMsg;
            this.emit(id, "out", caption);
            if (this.hasOutgoing(id, "caption")) this.emit(id, "caption", caption);
            if (this.hasOutgoing(id, "audio")) this.emit(id, "audio", seg);
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        });
      };

      const flushContinuous = (force = false) => {
        if (!pendingSegments.length) return;
        const sampleCount = pendingSegments.reduce((sum, item) => sum + item.samples.length, 0);
        const sampleRate = pendingSegments[0].sampleRate || MIC_VAD_SR;
        const bufferedMs = (sampleCount / sampleRate) * 1000;
        if (!force && bufferedMs < 1_000) return;

        const samples = new Float32Array(sampleCount);
        let writeOffset = 0;
        for (const item of pendingSegments) {
          samples.set(item.samples, writeOffset);
          writeOffset += item.samples.length;
        }

        // Wait for roughly the same 600 ms trailing silence used by mic-vad,
        // checking from 1 s onward. Continuous speech is force-cut at 20 s so
        // a stuck-open microphone cannot grow this buffer without bound.
        let tailEnergy = 0;
        const tailSamples = Math.min(samples.length, Math.round(sampleRate * 0.6));
        for (let i = samples.length - tailSamples; i < samples.length; i++) tailEnergy += samples[i] * samples[i];
        const hasTrailingSilence = Math.sqrt(tailEnergy / Math.max(1, tailSamples)) <= 0.012;
        if (!force && !hasTrailingSilence && bufferedMs < 20_000) return;

        const first = pendingSegments[0];
        segmentSamples(samples, (utteranceSamples, durationMs, offsetMs) => {
          recognize({
            samples: utteranceSamples,
            sampleRate,
            durationMs,
            offsetMs: first.offsetMs === undefined ? undefined : first.offsetMs + offsetMs,
            ts: first.ts === undefined ? undefined : first.ts + offsetMs,
          });
        });
        pendingSegments = [];
      };
      return {
        input: (port, msg) => {
          if (port === "model") {
            const source = msg as ModelSourceMsg;
            const direct = SENSEVOICE_MODELS.find((candidate) => candidate.id === source.model)?.id;
            const int8 = source.files?.some((file) => /(^|\/)model\.int8\.onnx$/i.test(file.name));
            const fp32 = source.files?.some((file) => /(^|\/)model\.onnx$/i.test(file.name));
            const compatible = direct || (int8 ? "sensevoice-small-int8" : fp32 ? "sensevoice-small-fp32" : undefined);
            if (compatible) {
              modelId = compatible;
              this.hooks.onRecognized?.(id, `model override · ${modelId}`);
            } else {
              this.hooks.onRecognized?.(id, `model provider is not browser-ASR compatible; using ${modelId}`);
            }
            return;
          }
          if (port === "env") return;
          const seg = msg as SegmentMsg;
          if (!seg.samples || seg.samples.length < MIN_STT_SAMPLES) return; // skip empty/too-short audio
          if (!bufferingContinuousInput && isContinuationSegment(previousSegment, seg)) {
            bufferingContinuousInput = true;
            if (!continuousNoticeShown) {
              continuousNoticeShown = true;
              this.hooks.onRecognized?.(id, "continuous input detected — buffering utterances (consider the Streaming ASR node)");
            }
            // the frame that proved continuity was held, not recognized — it
            // belongs at the FRONT of the utterance buffer
            if (heldTimer) clearTimeout(heldTimer);
            heldTimer = null;
            if (heldShort) {
              pendingSegments.push(heldShort);
              heldShort = null;
            }
          }
          previousSegment = seg;
          if (bufferingContinuousInput) {
            pendingSegments.push(seg);
            flushContinuous();
          } else if (seg.durationMs < 400 && seg.offsetMs !== undefined) {
            // a lone short offset-bearing frame MIGHT be the start of a
            // continuous stream — hold it briefly; a contiguous successor
            // claims it above, anything else releases it for recognition
            releaseHeld();
            heldShort = seg;
            heldTimer = setTimeout(releaseHeld, 600);
          } else {
            releaseHeld();
            recognize(seg);
          }
        },
        // Wait for in-flight recognition so a just-spoken / stop-time segment
        // isn't dropped before its result reaches the sink.
        stop: () => {
          releaseHeld();
          flushContinuous(true);
          return q.drain();
        },
      };
    }

    if (type === "translate" || type === "browser-translate-api") {
      const q = this.makeQueue(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      const modelId = (cfg.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL;
      const targetLang = (cfg.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG;
      // Config fallback for inputs with no detected language (e.g. captions):
      // the message's own lang (SenseVoice LID) still wins when present.
      const cfgSourceLang = cfg.sourceLang as string | undefined;
      const promptTemplate = cfg.promptTemplate as string | undefined;
      const provider = type === "browser-translate-api" || (cfg.provider as string | undefined) === "browser" ? browserTranslate : webllmTranslate;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          if (!tr.text.trim()) return; // nothing recognized — don't echo empties
          q.run(snippet(tr.text), async () => {
            // Pass through the original text on any failure (no WebGPU, download
            // error, inference error) so downstream sink/recordings keep working.
            let text = tr.text;
            try {
              // Feed SenseVoice's detected source language so the provider can skip
              // its own detection (browser API) / steer the prompt (LLM).
              if (provider.isAvailable()) text = await provider.translate(tr.text, targetLang, modelId, tr.lang ?? cfgSourceLang, promptTemplate);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
            this.hooks.onRecognized?.(id, text);
            // The text is now in the target language, so `lang` becomes the target
            // code — keeps the sink badge accurate AND lets a chained translate node
            // use the correct source. Carry CTC timing through for the cue's SRT.
            this.emit(id, "out", {
              text,
              audio: tr.audio,
              lang: langNameToCode(targetLang) ?? undefined,
              emotion: tr.emotion, // emotion/event describe the source audio — unchanged
              event: tr.event,
              tStartMs: tr.tStartMs,
              tEndMs: tr.tEndMs,
            } as TranscriptMsg);
          });
        },
        // Drain in-flight translations so a final utterance reaches the sink.
        stop: () => q.drain(),
      };
    }

    if (type === "audio-out") {
      // Collect audio from either input: a raw segment, or a transcript's .audio.
      return {
        input: (_port, msg) => {
          const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg>;
          const audio: SegmentMsg | null = m.audio
            ? m.audio
            : m.samples
              ? { samples: m.samples, sampleRate: m.sampleRate ?? MIC_VAD_SR, durationMs: m.durationMs ?? 0 }
              : null;
          if (audio && audio.samples.length) this.hooks.onAudio?.(id, audio);
        },
      };
    }

    if (type === "video-recorder") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const recording = (cfg.recording as boolean | undefined) ?? false;
      const fps = clampFps((cfg.fps as number | undefined) ?? DEFAULT_CAMERA_FPS);
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = typeof MediaRecorder !== "undefined"
        ? mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""
        : "";
      let canvas: HTMLCanvasElement | null = null;
      let ctx: CanvasRenderingContext2D | null = null;
      let audioCtx: AudioContext | null = null;
      let audioDest: MediaStreamAudioDestinationNode | null = null;
      let recorder: MediaRecorder | null = null;
      let chunks: Blob[] = [];
      let startedAt = 0;
      let startPromise: Promise<void> | null = null;
      let stopPromise: Promise<void> | null = null;

      const ensureCanvas = (width: number, height: number) => {
        if (!canvas) {
          canvas = document.createElement("canvas");
          ctx = canvas.getContext("2d");
        }
        const w = Math.max(2, Math.round(width || 1280));
        const h = Math.max(2, Math.round(height || 720));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx!.fillStyle = "#1c2025";
        ctx!.fillRect(0, 0, canvas.width, canvas.height);
      };

      const ensureRecorder = async (img?: ImageMsg) => {
        if (!recording || recorder || startPromise) return startPromise;
        startPromise = (async () => {
          if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder is not available in this browser.");
          ensureCanvas(img?.width ?? 1280, img?.height ?? 720);
          const stream = canvas!.captureStream(fps);
          const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
          audioCtx = new AudioCtor();
          audioDest = audioCtx.createMediaStreamDestination();
          for (const track of audioDest.stream.getAudioTracks()) stream.addTrack(track);
          chunks = [];
          startedAt = Date.now();
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
          recorder.start(1000);
          this.hooks.onNodeBusy?.(id, true);
          this.hooks.onRecognized?.(id, "recording video...");
        })().catch((e) => {
          this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
        }).finally(() => {
          startPromise = null;
        });
        return startPromise;
      };

      const stopRecorder = async () => {
        if (stopPromise) return stopPromise;
        stopPromise = (async () => {
          await startPromise?.catch(() => {});
          const rec = recorder;
          if (!rec) return;
          const done = new Promise<void>((resolve) => {
            rec.onstop = () => resolve();
          });
          if (rec.state !== "inactive") rec.stop();
          await done;
          const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "video/webm" });
          const durationMs = Date.now() - startedAt;
          if (blob.size > 0) {
            const clip: VideoClip = {
              id: `v-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
              nodeId: id,
              at: startedAt,
              durationMs,
              mimeType: blob.type || "video/webm",
              blob,
            };
            this.hooks.onVideoClip?.(id, clip);
            this.hooks.onRecognized?.(id, `saved video ${(durationMs / 1000).toFixed(1)}s`);
          }
          recorder = null;
          chunks = [];
          this.hooks.onNodeBusy?.(id, false);
        })().finally(async () => {
          stopPromise = null;
          await audioCtx?.close().catch(() => {});
          audioCtx = null;
          audioDest = null;
        });
        return stopPromise;
      };

      return {
        start: async () => {
          const clipId = cfg.playClipId as string | undefined;
          if (!clipId) return;
          const clip = await videoClipsDB.get(clipId).catch(() => undefined);
          if (clip) await this.emitVideoClip(id, clip, fps);
        },
        input: (port, msg) => {
          if (port === "video") {
            const img = msg as ImageMsg;
            ensureCanvas(img.width, img.height);
            try {
              ctx?.drawImage(img.bitmap, 0, 0, canvas!.width, canvas!.height);
            } catch {
              /* bitmap may have been closed by the sender */
            }
            this.hooks.onImage?.(id, img.bitmap);
            void ensureRecorder(img);
            return;
          }
          if (port === "audio") {
            const audio = msg as SegmentMsg;
            if (!recording || !audio.samples?.length) return;
            void ensureRecorder().then(() => {
              if (!audioCtx || !audioDest) return;
              const buf = audioCtx.createBuffer(1, audio.samples.length, audio.sampleRate || MIC_VAD_SR);
              buf.copyToChannel(audio.samples as Float32Array<ArrayBuffer>, 0);
              const src = audioCtx.createBufferSource();
              src.buffer = buf;
              src.connect(audioDest);
              src.start();
            });
          }
        },
        stop: () => stopRecorder(),
      };
    }

    if (type === "video-clip") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const clipId = cfg.clipId as string | undefined;
      const url = (cfg.url as string | undefined)?.trim();
      const fps = clampFps((cfg.fps as number | undefined) ?? DEFAULT_CAMERA_FPS);
      const loop = (cfg.loop as boolean | undefined) ?? false;
      let stopped = false;
      let currentClip: VideoClip | undefined;
      let currentImage: ImageMsg | undefined;
      let currentAudio: SegmentMsg | undefined;
      const replay = async () => {
        if (currentClip) {
          await this.emitVideoClip(id, currentClip, fps);
          return;
        }
        if (currentImage) this.emit(id, "video", currentImage);
        if (currentAudio) this.emit(id, "audio", currentAudio);
      };
      return {
        start: async () => {
          if (!clipId && !url) return;
          const clip = clipId
            ? await videoClipsDB.get(clipId).catch(() => undefined)
            : url
              ? {
                  id: `url-${url}`,
                  nodeId: id,
                  at: Date.now(),
                  durationMs: 0,
                  mimeType: "video/webm",
                  blob: await (await fetch(url)).blob(),
                } satisfies VideoClip
              : undefined;
          if (!clip) {
            this.hooks.onError?.(new Error(`video clip not found: ${clipId}`));
            return;
          }
          currentClip = clip;
          do {
            await replay();
          } while (loop && !stopped);
        },
        input: (port, msg) => {
          if (port === "video") {
            const image = msg as ImageMsg;
            currentClip = undefined;
            currentImage = image;
            this.hooks.onImage?.(id, image.bitmap);
            this.emit(id, "video", image);
            return;
          }
          if (port === "audio") {
            const audio = msg as SegmentMsg;
            if (!audio.samples?.length) return;
            currentClip = undefined;
            currentAudio = audio;
            this.hooks.onAudio?.(id, audio);
            this.emit(id, "audio", audio);
          }
        },
        replay,
        stop: () => {
          stopped = true;
        },
      };
    }

    if (type === "speaker") {
      // Play audio (from a raw segment or a transcript's .audio) out a chosen
      // hardware OUTPUT device. Lazily build one AudioContext for this node and
      // serialize playback so segments don't overlap.
      const sinkId = this.graph.nodes[id]?.config?.sinkId as string | undefined;
      let ctx: AudioContext | null = null;
      let chain: Promise<void> = Promise.resolve();
      return {
        input: (_port, msg) => {
          const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg>;
          const audio: SegmentMsg | null = m.audio
            ? m.audio
            : m.samples
              ? { samples: m.samples, sampleRate: m.sampleRate ?? MIC_VAD_SR, durationMs: m.durationMs ?? 0 }
              : null;
          if (!audio || !audio.samples.length) return;
          chain = chain.then(async () => {
            try {
              if (!ctx) {
                const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
                ctx = new AudioCtor();
                // setSinkId routes output to a non-default device (Chrome 110+);
                // not in all browsers/headless, so guard it.
                if (sinkId && typeof (ctx as any).setSinkId === "function") {
                  await (ctx as any).setSinkId(sinkId).catch(() => {});
                }
              }
              if (ctx.state === "suspended") await ctx.resume().catch(() => {}); // autoplay policy
              const buf = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
              buf.copyToChannel(audio.samples as Float32Array<ArrayBuffer>, 0);
              const source = ctx.createBufferSource();
              source.buffer = buf;
              source.connect(ctx.destination);
              // Resolve when this segment finishes so the next one waits for it.
              await new Promise<void>((resolve) => {
                source.onended = () => resolve();
                source.start();
              });
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        stop: async () => {
          await ctx?.close().catch(() => {});
        },
      };
    }

    if (type === "tts") {
      // Speak each transcript via the browser's on-device SpeechSynthesis, on the
      // device that runs this node. Serialize so utterances don't overlap.
      const cfg = this.graph.nodes[id]?.config ?? {};
      const configuredVoice = (cfg.voice as string | undefined) ?? AUTO_TTS_VOICE;
      const rate = typeof cfg.rate === "number" ? (cfg.rate as number) : 1;
      const q = this.makeQueue(id);
      let stopped = false;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const text = tr.text?.trim();
          if (!text) return;
          const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
          if (!synth) return;
          q.run(snippet(text), () =>
              new Promise<void>((resolve) => {
                if (stopped) return resolve(); // runtime stopped while queued — don't speak
                try {
                  const u = new SpeechSynthesisUtterance(text);
                  u.rate = rate;
                  // Resolve the voice: explicit pick, or — in auto mode — an OS
                  // voice whose language matches the transcript (covers zh/ja/ko,
                  // which no in-browser neural model does).
                  const all = synth.getVoices();
                  let v: SpeechSynthesisVoice | undefined;
                  if (configuredVoice !== AUTO_TTS_VOICE) {
                    v = all.find((x) => x.voiceURI === configuredVoice);
                  } else if (tr.lang) {
                    v = all.find((x) => voiceMatchesLang(x.lang, tr.lang!));
                    u.lang = tr.lang; // also hint the engine, even if no voice object matched
                  }
                  if (v) {
                    u.voice = v;
                    u.lang = v.lang;
                  }
                  u.onend = () => resolve();
                  u.onerror = () => resolve();
                  synth.speak(u);
                } catch (e) {
                  this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
                  resolve();
                }
              }),
          );
        },
        stop: () => {
          stopped = true; // queued continuations check this and skip speaking
          try {
            window.speechSynthesis?.cancel();
          } catch {
            /* ignore */
          }
          return q.drain();
        },
      };
    }

    if (type === "tts-model") {
      // Synthesize each transcript to PCM with an on-device ONNX model and emit it
      // as a segment, so it can feed a (device-targetable) speaker / audio-out.
      let configured = (this.graph.nodes[id]?.config?.model as string | undefined) ?? AUTO_TTS_MODEL;
      const q = this.makeQueue(id);
      return {
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const incompatibility = incompatibleModelRuntime(src, "browser");
            if (incompatibility) { this.hooks.onError?.(incompatibility); return; }
            configured = src.model || src.url || configured;
            this.hooks.onRecognized?.(id, `model=${configured}`);
            return;
          }
          const tr = msg as TranscriptMsg;
          const text = tr.text?.trim();
          if (!text) return;
          // Resolve the voice: an explicit pick, or — in auto mode — the MMS model
          // matching the transcript's (detected/translated) language.
          let modelId: string;
          if (configured !== AUTO_TTS_MODEL) {
            modelId = configured;
          } else if (tr.lang) {
            const m = langToTtsModel(tr.lang);
            if (!m) {
              this.hooks.onError?.(new Error(`no on-device TTS voice for "${tr.lang}"`));
              return;
            }
            modelId = m;
          } else {
            modelId = DEFAULT_NEURAL_TTS_MODEL;
          }
          q.run(snippet(text), async () => {
            try {
              const { samples, sampleRate } = await neuralTts.synthesize(text, modelId);
              if (samples.length) {
                const durationMs = (samples.length / sampleRate) * 1000;
                this.emit(id, "out", { samples, sampleRate, durationMs } as SegmentMsg);
              }
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        // Drain in-flight synthesis so a final utterance still reaches the speaker.
        stop: () => q.drain(),
      };
    }

    if (type === "text-aggregate") {
      const latest: Partial<Record<"ocr" | "voice", string>> = {};
      const empty = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      return {
        input: (port, msg) => {
          const text = (msg as TranscriptMsg).text?.trim();
          if (!text || (port !== "ocr" && port !== "voice")) return;
          latest[port] = text;
          const parts = [
            latest.ocr ? `Screen OCR:\n${latest.ocr}` : "",
            latest.voice ? `Voice transcript:\n${latest.voice}` : "",
          ].filter(Boolean);
          const out = parts.join("\n\n");
          if (!out) return;
          this.hooks.onRecognized?.(id, out);
          this.emit(id, "out", { text: out, audio: empty } as TranscriptMsg);
        },
      };
    }

    if (type === "model-source") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const empty = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      return {
        start: async () => {
          if (!(cfg.ref as string | undefined)?.trim()) return;
          try {
            const model = await resolveModelSource(cfg);
            const text = modelSourceToText(model);
            this.hooks.onRecognized?.(id, text);
            this.emit(id, "model", model);
            if (this.hasOutgoing(id, "info")) this.emit(id, "info", { text, audio: empty } as TranscriptMsg);
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
      };
    }

    if (type === "text-normalize") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const rawMode = (cfg.mode as string | undefined) ?? "ocr-stable";
      const mode = (rawMode === "light" || rawMode === "llm-filter" ? rawMode : "ocr-stable") as TextNormalizeMode;
      const model = ((cfg.model as string | undefined)?.trim() || DEFAULT_LLM_AGENT_MODEL);
      const dtype = cfg.dtype as string | undefined;
      const instruction = ((cfg.instruction as string | undefined)?.trim() ||
        "Clean noisy OCR into human-readable text in stable top-to-bottom reading order. Keep meaningful visible content and important numbers/names. Remove duplicated lines, OCR gibberish, browser/navigation clutter, and random fragments. Do not summarize or add commentary. Output plain text only.");
      const q = this.makeQueue(id);
      let prevKeys: Set<string> | undefined;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const normalized = normalizeTranscriptText(tr.text ?? "", mode, prevKeys);
          prevKeys = normalized.keys;
          const text = normalized.text;
          if (!text) return;
          if (mode !== "llm-filter") {
            this.hooks.onRecognized?.(id, text);
            this.emit(id, "out", { ...tr, text } as TranscriptMsg);
            return;
          }
          q.run(snippet(text), async () => {
            try {
              const out = (await runText("text2text", model, `${instruction}\n\nOCR:\n${text}\n\nClean text:`, dtype)).trim();
              const finalText = out || text;
              this.hooks.onRecognized?.(id, finalText);
              this.emit(id, "out", { ...tr, text: finalText } as TranscriptMsg);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
              this.hooks.onRecognized?.(id, text);
              this.emit(id, "out", { ...tr, text } as TranscriptMsg);
            }
          });
        },
        stop: () => q.drain(),
      };
    }

    if (type === "text-filter") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const text = filterTranscriptText(tr.text ?? "", cfg);
          if (!text) return;
          this.hooks.onRecognized?.(id, text);
          this.emit(id, "out", { ...tr, text } as TranscriptMsg);
        },
      };
    }

    if (type === "llm-agent") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      let backend = cfg.backend === "webllm" ? "webllm" : "transformers";
      const task = llmAgentTask(cfg.task);
      let model = ((cfg.model as string | undefined)?.trim() || (backend === "webllm" ? DEFAULT_WEBLLM_AGENT_MODEL : defaultLlmAgentModel(task)));
      const dtype = cfg.dtype as string | undefined;
      const instruction = ((cfg.instruction as string | undefined)?.trim() || DEFAULT_LLM_AGENT_INSTRUCTION);
      const q = this.makeQueue(id);
      const empty = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      const providerConnected = this.hasIncoming(id, "model");
      let providerReady = !providerConnected;
      let pendingTranscript: TranscriptMsg | null = null;
      const processTranscript = (tr: TranscriptMsg) => {
        const text = tr.text?.trim();
        if (!text) return;
        const prompt = `${instruction}\n\nInput:\n${text}\n\nOutput:`;
        q.run(snippet(text), async () => {
          try {
            const out = backend === "webllm"
              ? await webllmTranslate.chat(text, instruction, model)
              : await runText(task, model, prompt, dtype);
            this.hooks.onRecognized?.(id, out);
            this.emit(id, "out", { text: out, audio: empty } as TranscriptMsg);
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        });
      };
      return {
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const incompatibility = incompatibleModelRuntime(src, "browser");
            if (incompatibility) { this.hooks.onError?.(incompatibility); return; }
            const formats = src.compatibility?.formats ?? [];
            if (src.provider === "webllm" || formats.includes("mlc")) backend = "webllm";
            else if (formats.includes("onnx") || src.provider === "huggingface") backend = "transformers";
            else {
              this.hooks.onError?.(new Error(`${src.title || src.id} cannot run in LLM Agent. Connect an MLC/WebLLM or ONNX/Transformers.js text model.`));
              return;
            }
            model = src.model || src.url || model;
            providerReady = true;
            this.hooks.onRecognized?.(id, `model=${model} (${backend})`);
            if (pendingTranscript) {
              const pending = pendingTranscript;
              pendingTranscript = null;
              processTranscript(pending);
            }
            return;
          }
          const transcript = msg as TranscriptMsg;
          if (!transcript.text?.trim()) return;
          if (!providerReady) {
            pendingTranscript = transcript;
            return;
          }
          processTranscript(transcript);
        },
        stop: () => q.drain(),
      };
    }

    if (type === "graph-edit") {
      const empty = { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 };
      return {
        input: (_port, msg) => {
          const parsed = parseGraphCommands((msg as TranscriptMsg).text ?? "");
          const results = "error" in parsed ? [`error: ${parsed.error}`] : this.hooks.onGraphCommands?.(id, parsed) ?? ["error: graph editing is unavailable"];
          const text = results.length ? results.join(" · ") : "no graph commands";
          this.hooks.onRecognized?.(id, text);
          this.emit(id, "out", { text, audio: empty } as TranscriptMsg);
        },
      };
    }

    if (type === "model") {
      // Generic transformers.js node — the configured task decides the I/O shape.
      const cfg = this.graph.nodes[id]?.config ?? {};
      const task = ((cfg.task as ModelTask | undefined) ?? "asr") as ModelTask;
      let model = (cfg.model as string | undefined)?.trim();
      const dtype = cfg.dtype as string | undefined;
      const q = this.makeQueue(id);
      const providerConnected = this.hasIncoming(id, "model");
      let providerReady = !providerConnected;
      let pendingInput: { port: string; msg: unknown } | null = null;
      const processInput = (port: string, msg: unknown) => {
        if (port === "env") return;
        const activeModel = model;
        if (!activeModel) return;
        // Skip empty inputs (empty audio / blank text) — avoids ORT shape errors.
        if (task === "asr") {
          if (!(msg as SegmentMsg).samples || (msg as SegmentMsg).samples.length < MIN_STT_SAMPLES) return;
        } else if (task === "image-to-text") {
          if (port !== "in_img" || !(msg as ImageMsg).bitmap) return;
        } else if (!(msg as TranscriptMsg).text?.trim()) return;
        const label = task === "asr" ? "🔊 audio" : task === "image-to-text" ? "image" : snippet((msg as TranscriptMsg).text ?? "");
        q.run(label, async () => {
          try {
            if (task === "asr") {
              const seg = msg as SegmentMsg;
              const text = await runAsr(activeModel, seg.samples, dtype);
              this.hooks.onRecognized?.(id, text);
              this.emit(id, "out_txt", { text, audio: seg } as TranscriptMsg);
            } else if (task === "image-to-text") {
              const image = msg as ImageMsg;
              const text = await runImageToText(activeModel, image.bitmap, dtype);
              if (!text) return;
              this.hooks.onRecognized?.(id, text);
              this.emit(id, "out_txt", { text, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } } as TranscriptMsg);
            } else if (task === "tts") {
              const tr = msg as TranscriptMsg;
              if (!tr.text?.trim()) return;
              const { samples, sampleRate } = await runTts(activeModel, tr.text, dtype);
              if (samples.length)
                this.emit(id, "out_seg", { samples, sampleRate, durationMs: (samples.length / sampleRate) * 1000 } as SegmentMsg);
            } else {
              const tr = msg as TranscriptMsg;
              if (!tr.text?.trim()) return;
              const text = await runText(task, activeModel, tr.text, dtype);
              this.hooks.onRecognized?.(id, text);
              // Carry audio/timing through so a downstream sink/SRT still works.
              this.emit(id, "out_txt", { text, audio: tr.audio, lang: tr.lang, tStartMs: tr.tStartMs, tEndMs: tr.tEndMs } as TranscriptMsg);
            }
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        });
      };
      return {
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const incompatibility = incompatibleModelRuntime(src, "browser");
            if (incompatibility) { this.hooks.onError?.(incompatibility); return; }
            model = src.model || src.url || model;
            providerReady = true;
            this.hooks.onRecognized?.(id, `model=${model}`);
            if (pendingInput) {
              const pending = pendingInput;
              pendingInput = null;
              processInput(pending.port, pending.msg);
            }
            return;
          }
          if (port === "env") return;
          if (!providerReady) {
            pendingInput = { port, msg };
            return;
          }
          processInput(port, msg);
        },
        stop: () => q.drain(),
      };
    }

    if (type === "pipe") {
      // Bridge to an external `otoji node` CLI over the signaling relay: input text
      // is sent out to the CLI's stdout; CLI stdin is injected via pipeIn() below.
      return {
        input: (_port, msg) => {
          const t = (msg as TranscriptMsg).text?.trim();
          if (t) this.hooks.onPipeOut?.(id, t);
        },
      };
    }

    if (type === "camera") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const deviceId = cfg.cameraId as string | undefined;
      const fps = clampFps((cfg.fps as number) ?? DEFAULT_CAMERA_FPS);
      const demand = this.hasIncoming(id, "rate"); // backpressure when a rate edge feeds us
      let handle: CameraHandle | null = null;
      return {
        start: async () => {
          try {
            handle = await startCamera({
              deviceId,
              fps,
              demand,
              onFrame: (bitmap, width, height, capture) => {
                this.hooks.onImage?.(id, bitmap);
                this.emit(id, "out", { bitmap, width, height, ts: Date.now(), capture } as ImageMsg);
              },
              onError: (e) => this.hooks.onError?.(e),
            });
            this.hooks.onMedia?.(id, handle.stream());
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => {
          if ((msg as ControlMsg).pulse) handle?.grabNow(); // credit: one frame per "next"
        },
        stop: () => {
          this.hooks.onMedia?.(id, null);
          handle?.stop();
        },
        dims: () => handle?.dims() ?? null,
      };
    }

    if (type === "screen-share") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const fps = clampFps((cfg.fps as number) ?? DEFAULT_CAMERA_FPS);
      const demand = this.hasIncoming(id, "rate"); // backpressure when a rate edge feeds us
      let handle: ScreenHandle | null = null;
      return {
        start: async () => {
          // Emit system audio only when the `audio` port is wired (lazy).
          const wantAudio = this.hasOutgoing(id, "audio");
          const startEpoch = Date.now(); // wall clock of audio sample 0, for mix alignment
          try {
            handle = await startScreenShare({
              fps,
              demand,
              // Reuse the live display stream across auto-run restarts — every
              // getDisplayMedia call re-prompts the browser picker, and the
              // editor restarts the runtime on any structural graph edit.
              cacheKey: id,
              onFrame: (bitmap, width, height) => {
                this.hooks.onImage?.(id, bitmap);
                this.emit(id, "out", { bitmap, width, height, ts: Date.now() } as ImageMsg);
              },
              onSegment: wantAudio
                ? (samples, durationMs, offsetMs) => {
                    this.hooks.onSegment?.(id);
                    this.emit(id, "audio", { samples, sampleRate: MIC_VAD_SR, durationMs, offsetMs, ts: startEpoch + (offsetMs ?? 0) } as SegmentMsg);
                  }
                : undefined,
              onEnded: () => this.hooks.onStatus?.("screen share ended"),
              onError: (e) => this.hooks.onError?.(e),
            });
            this.hooks.onMedia?.(id, handle.stream());
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => {
          if ((msg as ControlMsg).pulse) handle?.grabNow();
        },
        stop: () => {
          this.hooks.onMedia?.(id, null);
          handle?.stop();
        },
        dims: () => handle?.dims() ?? null,
      };
    }

    if (type === "paddle-ocr") {
      const w = this.makeLatest(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      // PaddleOCR default (optionally from a mirror via `modelsBase`); a
      // connected Model provider with Paddle-format det/rec/dict assets wins.
      let model: OcrModelRef | undefined = (cfg.modelsBase as string | undefined) ?? undefined;
      return {
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const override = ocrModelFromSource(src);
            if (override) {
              model = override;
              this.hooks.onRecognized?.(id, `model override · ${src.title ?? src.model}`);
              warmOcr(model).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))));
            } else {
              this.hooks.onRecognized?.(id, `model provider is not Paddle-OCR compatible; using default`);
            }
            return;
          }
          const img = msg as ImageMsg;
          w.submit("🖼️ OCR", async () => {
            let text = "";
            try {
              text = await ocrRecognize(img.bitmap, model);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
            this.hooks.onRecognized?.(id, text);
            this.emit(id, "out", {
              text,
              audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 },
            } as TranscriptMsg);
            // Feedback: a "next" credit pulse so a connected Camera paces
            // itself to exactly our OCR rate.
            this.emit(id, "rate", { pulse: true, ts: Date.now() } as ControlMsg);
          });
        },
      };
    }

    if (type === "depth-field") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      const latest = this.makeLatest(id);
      return {
        input: (_port, msg) => {
          const img = msg as ImageMsg;
          latest.submit("depth field", async () => {
            const result = await estimateDepthField(img.bitmap, cfg.model as string | undefined);
            this.hooks.onImage?.(id, result.preview);
            this.emit(id, "depth", { data: { kind: "depth-field", width: result.width, height: result.height, values: result.values }, ts: img.ts } as SpatialMsg);
            if (this.hasOutgoing(id, "preview")) this.emit(id, "preview", { bitmap: result.preview, width: result.preview.width, height: result.preview.height, ts: img.ts } as ImageMsg);
          });
        },
      };
    }

    if (type === "hand-space") {
      const latest = this.makeLatest(id);
      return {
        input: (_port, msg) => {
          const img = msg as ImageMsg;
          latest.submit("hand space", async () => {
            const result = await landmarks(img.bitmap, "hand");
            const preview = await drawLandmarks(img.bitmap, result);
            this.hooks.onImage?.(id, preview);
            this.emit(id, "hand", { data: {
              kind: "hand-landmarks",
              landmarks: result.sets[0] ?? [],
              width: img.width,
              height: img.height,
              capture: img.capture ?? { facingMode: "unknown", mirroredPreview: false, inferenceMirrored: false },
            }, ts: img.ts } as SpatialMsg);
            if (this.hasOutgoing(id, "preview")) this.emit(id, "preview", { bitmap: preview, width: preview.width, height: preview.height, ts: img.ts } as ImageMsg);
          });
        },
      };
    }

    if (type === "spatial-calibration") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      let depth: DepthFieldData | null = null;
      let hand: HandSpaceData | null = null;
      let depthTs = 0;
      let handTs = 0;
      const options: SpatialCalibrationOptions = {
        nearMeters: (cfg.nearMeters as number | undefined) ?? .2,
        farMeters: (cfg.farMeters as number | undefined) ?? 2.5,
        fovDegrees: (cfg.fovDegrees as number | undefined) ?? 60,
        maxSkewMs: (cfg.maxSkewMs as number | undefined) ?? 200,
        cameraToWorld: cfg.cameraToWorld as number[] | undefined,
      };
      const publisher = new SpatialCursorPublisher(id, options.cameraToWorld);
      let pendingFailure: ReturnType<typeof calibrateSpatialCursor> | null = null;
      let failureTimer: ReturnType<typeof setTimeout> | null = null;
      const cancelPendingFailure = () => {
        if (failureTimer) clearTimeout(failureTimer);
        failureTimer = null;
        pendingFailure = null;
      };
      const emitSpace = () => {
        const result = calibrateSpatialCursor(depth, depthTs, hand, handTs, options);
        if (result.ok) {
          cancelPendingFailure();
          publisher.publish(result);
          this.emit(id, "space", { data: result.space, ts: result.ts } as SpatialMsg);
          return;
        }
        // Async depth/hand branches for the same camera frame commonly arrive
        // a few milliseconds apart. Give their matching timestamp one skew
        // window to arrive before announcing loss; structural failures are real
        // immediately and bypass this pairing grace.
        if (result.reason === "temporal-skew" || result.reason === "waiting-for-depth") {
          pendingFailure = result;
          if (!failureTimer) failureTimer = setTimeout(() => {
            failureTimer = null;
            if (pendingFailure) publisher.publish(pendingFailure);
            pendingFailure = null;
          }, options.maxSkewMs ?? 200);
        } else {
          cancelPendingFailure();
          publisher.publish(result);
        }
      };
      return { stop: () => { cancelPendingFailure(); publisher.close(); }, input: (port, msg) => {
        const spatial = msg as SpatialMsg<any>;
        if (port === "depth") { depth = spatial.data; depthTs = spatial.ts; }
        if (port === "hand") { hand = spatial.data; handTs = spatial.ts; }
        emitSpace();
      } };
    }

    if (type === "rgbd-point-cloud") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      let frame: ImageMsg | null = null;
      let depth: any = null;
      let depthTs = 0;
      const latest = this.makeLatest(id);
      const generate = () => {
        if (!frame || !depth?.values?.length) return;
        const img = frame;
        latest.submit("RGB-D cloud", async () => {
          const canvas = document.createElement("canvas");
          canvas.width = depth.width; canvas.height = depth.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img.bitmap, 0, 0, depth.width, depth.height);
          const rgba = ctx.getImageData(0, 0, depth.width, depth.height).data;
          const stride = Math.max(2, Math.round((cfg.stride as number | undefined) ?? 8));
          const near = (cfg.nearMeters as number | undefined) ?? .2;
          const far = (cfg.farMeters as number | undefined) ?? 2.5;
          const fov = ((cfg.fovDegrees as number | undefined) ?? 60) * Math.PI / 180;
          const focal = .5 * depth.width / Math.tan(fov / 2);
          const points: number[] = [];
          const colors: number[] = [];
          for (let y = 0; y < depth.height; y += stride) for (let x = 0; x < depth.width; x += stride) {
            const i = y * depth.width + x;
            const z = near + (1 - depth.values[i] / 255) * (far - near);
            points.push(((x - depth.width / 2) * z) / focal, -((y - depth.height / 2) * z) / focal, -z);
            colors.push(rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255);
          }
          this.emit(id, "scene", { data: { kind: "rgbd-point-cloud", points, colors, count: points.length / 3 }, ts: Math.max(img.ts, depthTs) } as SpatialMsg);
          this.hooks.onRecognized?.(id, `${points.length / 3} RGB-D points`);
        });
      };
      return { input: (port, msg) => {
        if (port === "frame") frame = msg as ImageMsg;
        if (port === "depth") { const s = msg as SpatialMsg<any>; depth = s.data; depthTs = s.ts; }
        generate();
      } };
    }

    if (type === "model-3d") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      return {
        start: () => {
          const descriptor = {
            kind: "model-3d",
            primitive: (cfg.primitive as string | undefined) ?? "suzanne",
            url: (cfg.url as string | undefined) ?? null,
            scale: (cfg.scale as number | undefined) ?? 1,
          };
          this.hooks.onRecognized?.(id, JSON.stringify(descriptor));
          this.emit(id, "object", { data: descriptor, ts: Date.now() } as SpatialMsg);
        },
      };
    }

    if (type === "spatial-renderer") {
      let space: CalibratedSpace | null = null;
      let depth: DepthField | null = null;
      let object: SpatialObjectDescriptor = { kind: "model-3d", primitive: "suzanne", scale: 1 };
      const scene = new SpatialSceneRenderer();
      const latest = this.makeLatest(id);
      return {
        stop: () => scene.dispose(),
        input: (port, msg) => {
          if (port === "space") {
            space = (msg as SpatialMsg<CalibratedSpace>).data;
            return;
          }
          if (port === "depth") {
            depth = (msg as SpatialMsg<DepthField>).data;
            return;
          }
          if (port === "scene") {
            scene.setPointCloud((msg as SpatialMsg<RgbdPointCloud>).data);
            return;
          }
          if (port === "object") {
            object = { ...object, ...(msg as SpatialMsg<SpatialObjectDescriptor>).data };
            return;
          }
          if (port !== "frame") return;
          const img = msg as ImageMsg;
          if (!space?.landmarks?.length) {
            this.hooks.onImage?.(id, img.bitmap);
            return;
          }
          latest.submit("3D render", async () => {
            const overlay = await scene.render(img.bitmap, space!, object, depth);
            this.hooks.onImage?.(id, overlay);
            if (this.hasOutgoing(id, "out")) this.emit(id, "out", { bitmap: overlay, width: overlay.width, height: overlay.height, ts: Date.now() } as ImageMsg);
          });
        },
      };
    }

    if (type === "ar-notes") {
      const cfg = this.graph.nodes[id]?.config ?? {};
      // Notes live in config so they persist + sync to the room, but the
      // editor excludes `notes` from the runtime signature — placing one must
      // not restart the whole pipeline.
      let notes: ArNote[] = Array.isArray(cfg.notes) ? [...(cfg.notes as ArNote[])] : [];
      let space: CalibratedSpace | null = null;
      let pinching = false;
      const pinch = new PinchTracker();
      const scene = new ArNotesRenderer();
      const latest = this.makeLatest(id);
      return {
        stop: () => scene.dispose(),
        input: (port, msg) => {
          if (port === "space") {
            space = (msg as SpatialMsg<CalibratedSpace>).data;
            const event = pinch.update(space?.landmarks);
            pinching = event === "start" || event === "hold";
            if (event === "start" && space?.finger) {
              notes = placeNote(notes, ((cfg.text as string | undefined) || "📌 note").trim(), space.finger, Date.now());
              this.hooks.onConfigPatch?.(id, { notes });
              this.hooks.onRecognized?.(id, `${notes.length} note${notes.length === 1 ? "" : "s"}`);
            }
            return;
          }
          if (port !== "frame") return;
          const img = msg as ImageMsg;
          latest.submit("AR notes", async () => {
            const overlay = await scene.render(img.bitmap, notes, space, pinching);
            this.hooks.onImage?.(id, overlay);
            if (this.hasOutgoing(id, "out")) this.emit(id, "out", { bitmap: overlay, width: overlay.width, height: overlay.height, ts: img.ts } as ImageMsg);
          });
        },
      };
    }

    if (type === "vision-model") {
      const w = this.makeLatest(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      const task = (cfg.task as string | undefined) ?? "detect";
      let model = cfg.model as string | undefined;
      const threshold = typeof cfg.threshold === "number" ? (cfg.threshold as number) : 0.5;
      const emptyAudio = () => ({ samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 });
      return {
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const incompatibility = incompatibleModelRuntime(src, "browser");
            if (incompatibility) { this.hooks.onError?.(incompatibility); return; }
            model = src.model || src.url || model;
            this.hooks.onRecognized?.(id, `model=${model}`);
            return;
          }
          const img = msg as ImageMsg;
          const wantImg = this.hasOutgoing(id, "out");
          const wantLabels = this.hasOutgoing(id, "labels");
          const wantJson = this.hasOutgoing(id, "json");
          // LAZY: skip the expensive inference when nothing needs a result — no
          // downstream edge AND nobody is viewing the preview (here or on another
          // device). For depth/pose/hand the overlay IS the demo, so a visible
          // preview is reason enough to run even with no output wired.
          const wantPreview = this.hooks.hasPreviewConsumer ? this.hooks.hasPreviewConsumer(id) : isPreviewShown(id);
          if (!wantImg && !wantLabels && !wantJson && !wantPreview) {
            this.hooks.onImage?.(id, img.bitmap);
            return;
          }
          w.submit(`🔍 ${task}`, async () => {
            let overlay: ImageBitmap | null = null;
            let labels = "";
            let json = "";
            try {
              if (task === "depth") {
                overlay = await estimateDepth(img.bitmap, model || undefined);
              } else if (task === "pose" || task === "hand" || task === "gesture" || task === "spatial-monkey") {
                const mpTask = task === "spatial-monkey" ? "hand" : task as MpTask;
                const res = await landmarks(img.bitmap, mpTask);
                overlay = task === "spatial-monkey" ? await drawSpatialMonkey(img.bitmap, res) : await drawLandmarks(img.bitmap, res);
                labels = formatLandmarksLabels(res);
                json = formatLandmarksJson(res);
              } else {
                const dets: Detection[] = await detect(img.bitmap, model || DEFAULT_DETECT_MODEL, threshold);
                overlay = await drawDetections(img.bitmap, dets);
                labels = formatLabels(dets);
                json = formatJsonl(dets);
              }
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
            this.hooks.onImage?.(id, overlay ?? img.bitmap);
            if (wantImg && overlay)
              this.emit(id, "out", { bitmap: overlay, width: overlay.width, height: overlay.height, ts: Date.now() } as ImageMsg);
            if (wantLabels && labels) {
              this.hooks.onRecognized?.(id, labels);
              this.emit(id, "labels", { text: labels, audio: emptyAudio() } as TranscriptMsg);
            }
            if (wantJson && json) this.emit(id, "json", { text: json, audio: emptyAudio() } as TranscriptMsg);
            // Credit pulse so a connected Camera can self-pace.
            this.emit(id, "rate", { pulse: true, ts: Date.now() } as ControlMsg);
          });
        },
      };
    }

    if (type === "qwen-image") {
      const q = this.makeQueue(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      let latestImage: ImageBitmap | undefined;
      let sourceModel = cfg.model as string | undefined;
      const backend = ((cfg.backend as string | undefined) ?? "diffusers") as "diffusers" | "diffsynth" | "mlx" | "gguf" | "remote";
      const requiredRuntime: ModelRuntime = backend === "mlx" ? "mlx" : backend === "gguf" ? "llama.cpp" : backend === "remote" ? "remote" : "diffusers";
      const providerConnected = this.hasIncoming(id, "model");
      const imageConnected = this.hasIncoming(id, "image");
      const imageRequired = cfg.mode === "edit" || imageConnected;
      let providerReady = !providerConnected;
      let imageReady = !imageRequired;
      let pendingPrompt = "";
      const emptyAudio = () => ({ samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 });
      const runReady = (prompt: string) => {
        const clean = prompt.trim();
        if (!clean) return;
        q.run(`🎨 ${snippet(clean)}`, async () => {
          try {
            const result = await generateQwenImage({
              serverUrl: cfg.serverUrl as string | undefined,
              prompt: clean,
              image: latestImage,
              mode: (cfg.mode as "generate" | "edit" | undefined) ?? (latestImage ? "edit" : "generate"),
              backend,
              model: sourceModel,
              width: typeof cfg.width === "number" ? cfg.width : undefined,
              height: typeof cfg.height === "number" ? cfg.height : undefined,
              steps: typeof cfg.steps === "number" ? cfg.steps : undefined,
              seed: typeof cfg.seed === "number" ? cfg.seed : undefined,
              strength: typeof cfg.strength === "number" ? cfg.strength : undefined,
            });
            this.hooks.onImage?.(id, result.bitmap);
            this.emit(id, "out", { bitmap: result.bitmap, width: result.width, height: result.height, ts: Date.now() } as ImageMsg);
            this.hooks.onRecognized?.(id, result.info);
            if (this.hasOutgoing(id, "info")) this.emit(id, "info", { text: result.info, audio: emptyAudio() } as TranscriptMsg);
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        });
      };
      const run = (prompt: string) => {
        const clean = prompt.trim();
        if (!clean) return;
        if (!providerReady || !imageReady) {
          pendingPrompt = clean;
          return;
        }
        pendingPrompt = "";
        runReady(clean);
      };
      const releasePending = () => {
        if (providerReady && imageReady && pendingPrompt) run(pendingPrompt);
      };
      return {
        start: () => {
          if ((cfg.autoRun as boolean | undefined) === false) return;
          if (cfg.mode === "edit" && !imageConnected) {
            this.hooks.onError?.(new Error("image generation: edit mode requires an image input"));
            return;
          }
          run((cfg.prompt as string | undefined) ?? "");
        },
        input: (port, msg) => {
          if (port === "model") {
            const src = msg as ModelSourceMsg;
            const incompatibility = incompatibleModelRuntime(src, requiredRuntime);
            if (incompatibility) { this.hooks.onError?.(incompatibility); return; }
            const tasks = src.compatibility?.tasks ?? [];
            if (tasks.length && !tasks.some((task) => task === "image" || task === "text-to-image" || task === "image-to-image")) {
              this.hooks.onError?.(new Error(`${src.title || src.id} is not an image generation model.`));
              return;
            }
            sourceModel = src.model || src.url || sourceModel;
            providerReady = true;
            this.hooks.onRecognized?.(id, `model=${sourceModel}`);
            releasePending();
            return;
          }
          if (port === "image") {
            latestImage = (msg as ImageMsg).bitmap;
            imageReady = true;
            this.hooks.onImage?.(id, latestImage);
            releasePending();
            return;
          }
          run((msg as TranscriptMsg).text);
        },
        stop: () => q.drain(),
      };
    }

    if (type === "image-match") {
      const w = this.makeLatest(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      const threshold = typeof cfg.threshold === "number" ? (cfg.threshold as number) : 0.8;
      const maxMatches = typeof cfg.maxMatches === "number" ? (cfg.maxMatches as number) : 16;
      const emptyAudio = () => ({ samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 });
      let pattern: ImageBitmap | null = null; // latest image seen on `pattern`
      return {
        input: (port, msg) => {
          const img = msg as ImageMsg;
          if (port === "pattern") {
            pattern = img.bitmap;
            this.hooks.onRecognized?.(id, `pattern ${img.width}×${img.height}`);
            return;
          }
          if (!pattern) {
            // No pattern yet — pass the frame through the preview untouched so
            // the user sees the node is alive but unarmed.
            this.hooks.onImage?.(id, img.bitmap);
            return;
          }
          const pat = pattern;
          const wantImg = this.hasOutgoing(id, "out");
          const wantCount = this.hasOutgoing(id, "count");
          const wantJson = this.hasOutgoing(id, "json");
          const wantPreview = this.hooks.hasPreviewConsumer ? this.hooks.hasPreviewConsumer(id) : isPreviewShown(id);
          if (!wantImg && !wantCount && !wantJson && !wantPreview) {
            this.hooks.onImage?.(id, img.bitmap);
            return;
          }
          w.submit("🔎 match", async () => {
            let matches: Match[] = [];
            let overlay: ImageBitmap | null = null;
            try {
              matches = matchTemplate(img.bitmap, pat, { threshold, maxMatches });
              if (wantImg || wantPreview) overlay = await drawMatches(img.bitmap, matches);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
            this.hooks.onImage?.(id, overlay ?? img.bitmap);
            if (wantImg && overlay)
              this.emit(id, "out", { bitmap: overlay, width: overlay.width, height: overlay.height, ts: Date.now() } as ImageMsg);
            const labels = formatMatchLabels(matches);
            this.hooks.onRecognized?.(id, labels);
            if (wantCount) this.emit(id, "count", { text: labels, audio: emptyAudio() } as TranscriptMsg);
            if (wantJson) this.emit(id, "json", { text: formatMatchJson(matches), audio: emptyAudio() } as TranscriptMsg);
            // Credit pulse so a connected Camera can self-pace.
            this.emit(id, "rate", { pulse: true, ts: Date.now() } as ControlMsg);
          });
        },
      };
    }

    if (type === "text-diff") {
      const style = ((this.graph.nodes[id]?.config?.style as string) ?? DEFAULT_DIFF_STYLE) as DiffStyle;
      let prev: string | null = null; // null until the first input (→ all additions)
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const out = diffText(prev, tr.text, style);
          prev = tr.text;
          if (!out) return; // no change → emit nothing
          this.hooks.onRecognized?.(id, out);
          this.emit(id, "out", { text: out, audio: tr.audio } as TranscriptMsg);
        },
      };
    }

    // sink / srt-out
    return {
      input: (_port, msg) => {
        const tr = msg as TranscriptMsg;
        // Partial revisions drive the live preview only; recordings append on
        // provisional/final so the sink list isn't flooded with replace-events.
        if (tr.status === "partial") {
          this.hooks.onRecognized?.(id, tr.text);
          return;
        }
        this.hooks.onSink?.(id, tr);
      },
    };
  }

  /** Inject text from an external CLI into a local pipe node's output. */
  pipeIn(nodeId: string, text: string): void {
    if (this.graph.nodes[nodeId]?.type !== "pipe" || !this.isLocal(nodeId)) return;
    this.emit(nodeId, "out", {
      text,
      audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 },
    } as TranscriptMsg);
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop continuous sources first so their final emissions flush into the
    // pipeline, then drain processing nodes (STT/translate/tts chains) before clearing.
    const SOURCES = new Set<NodeType>(["mic-vad", "mic-raw", "web-speech", "camera", "screen-share"]);
    for (const [id, node] of this.nodes) if (SOURCES.has(this.graph.nodes[id]?.type)) await node.stop?.();
    for (const [id, node] of this.nodes) if (!SOURCES.has(this.graph.nodes[id]?.type)) await node.stop?.();
    this.nodes.clear();
    this.adj.clear();
  }
}

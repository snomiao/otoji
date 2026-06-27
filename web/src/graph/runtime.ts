// Single-device graph runtime (M3): instantiate node runners for a VoiceGraph
// and wire them per edges. Messages flow in-process; cross-device edges (M4)
// will later be realized over data channels.

import type { VoiceGraph, NodeType } from "./model";
import { startMicVad, MIC_VAD_SR, type MicVadHandle } from "../lib/mic-vad";
import { sttRecognize, warmSenseVoice } from "../providers/stt/sensevoice";
import type { SttLevel } from "../providers/types";

export interface SegmentMsg {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}
export interface TranscriptMsg {
  text: string;
  audio: SegmentMsg;
}

export interface RuntimeHooks {
  modelId?: string;
  onLevel?: (nodeId: string, level: SttLevel) => void;
  onSink?: (nodeId: string, tr: TranscriptMsg) => void;
  onStatus?: (s: string) => void;
  onError?: (e: Error) => void;
}

interface RuntimeNode {
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  input?(port: string, msg: unknown): void;
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

  private emit(nodeId: string, port: string, msg: unknown): void {
    for (const t of this.adj.get(`${nodeId}:${port}`) ?? []) {
      this.nodes.get(t.node)?.input?.(t.port, msg);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.adj = buildAdjacency(this.graph);

    for (const n of Object.values(this.graph.nodes)) {
      this.nodes.set(n.id, this.build(n.id, n.type));
    }

    if (Object.values(this.graph.nodes).some((n) => n.type === "stt")) {
      this.hooks.onStatus?.("loading model…");
      try {
        await warmSenseVoice(this.hooks.modelId);
      } catch (e) {
        // Required model failed to load — abort instead of capturing audio that
        // every STT segment would then fail on.
        this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
        this.hooks.onStatus?.("model load failed");
        this.running = false;
        this.nodes.clear();
        this.adj.clear();
        return;
      }
    }

    for (const node of this.nodes.values()) await node.start?.();
    this.hooks.onStatus?.("running");
  }

  private build(id: string, type: NodeType): RuntimeNode {
    if (type === "mic-vad") {
      let handle: MicVadHandle | null = null;
      return {
        start: async () => {
          handle = await startMicVad({
            onLevel: (l) => this.hooks.onLevel?.(id, l),
            onSegment: (samples, durationMs) =>
              this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs } as SegmentMsg),
          });
        },
        stop: async () => {
          await handle?.stop();
        },
      };
    }

    if (type === "stt") {
      let chain: Promise<void> = Promise.resolve();
      return {
        input: (_port, msg) => {
          const seg = msg as SegmentMsg;
          chain = chain.then(async () => {
            try {
              const text = await sttRecognize(seg.samples, this.hooks.modelId);
              this.emit(id, "out", { text, audio: seg } as TranscriptMsg);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        // Wait for in-flight recognition so a just-spoken / stop-time segment
        // isn't dropped before its result reaches the sink.
        stop: () => chain,
      };
    }

    // sink
    return {
      input: (_port, msg) => this.hooks.onSink?.(id, msg as TranscriptMsg),
    };
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop sources first so their final segments flush into the pipeline,
    // then drain processing nodes (STT chains emit to sinks) before clearing.
    for (const [id, node] of this.nodes) if (this.graph.nodes[id]?.type === "mic-vad") await node.stop?.();
    for (const [id, node] of this.nodes) if (this.graph.nodes[id]?.type !== "mic-vad") await node.stop?.();
    this.nodes.clear();
    this.adj.clear();
  }
}

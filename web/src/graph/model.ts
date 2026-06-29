// Voice-graph data model. Nodes carry typed ports; an edge is valid only when
// the source output type matches the target input type. The whole graph is the
// authoritative state synced via the Durable Object (see signaling graph-patch).

export type PortType = "segment" | "transcript";
export type NodeType =
  | "mic-vad"
  | "file-audio"
  | "file-text"
  | "stt"
  | "translate"
  | "sink"
  | "audio-out"
  | "srt-out";

export interface NodeSpec {
  type: NodeType;
  label: string;
  inputs: { id: string; type: PortType }[];
  outputs: { id: string; type: PortType }[];
}

export const NODE_SPECS: Record<NodeType, NodeSpec> = {
  "mic-vad": {
    type: "mic-vad",
    label: "Mic + VAD",
    inputs: [],
    outputs: [{ id: "out", type: "segment" }],
  },
  "file-audio": {
    type: "file-audio",
    label: "Audio file (in)",
    inputs: [],
    outputs: [{ id: "out", type: "segment" }],
  },
  "file-text": {
    type: "file-text",
    label: "Text file (in)",
    inputs: [],
    outputs: [{ id: "out", type: "transcript" }],
  },
  stt: {
    type: "stt",
    label: "SenseVoice STT",
    inputs: [{ id: "in", type: "segment" }],
    outputs: [{ id: "out", type: "transcript" }],
  },
  translate: {
    type: "translate",
    label: "Translate (in-browser LLM)",
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
  "srt-out": {
    type: "srt-out",
    label: "SRT subtitles (out)",
    inputs: [{ id: "in", type: "transcript" }],
    outputs: [],
  },
};

export interface VoiceNode {
  id: string;
  type: NodeType;
  device: string | null; // peerId the node runs on (null = unassigned)
  pos: { x: number; y: number };
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

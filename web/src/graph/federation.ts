import {
  FEDERATED_GRAPH_SCHEMA,
  FEDERATED_DEMO_CHAIN_IDS,
  clampFederatedGraph,
  federatedDemoChain,
  federatedEmbedUrl,
  federatedGraphToRgui,
  federatedNodeId,
  isFederatedGraphEnvelope,
  type FederatedEdge,
  type FederatedGraphEnvelope,
  type FederatedNode,
  type FederatedPort,
  type Graph,
  type SignalKind,
} from "@snomiao/rgui";
import { NODE_SPECS, type NodeType, type PortType, type VoiceGraph } from "./model";
import type { RgGraph } from "./rgui-adapter";
import { SIGNAL } from "./signal";

export type { FederatedEdge, FederatedGraphEnvelope, FederatedNode, FederatedPort };
export { FEDERATED_GRAPH_SCHEMA, FEDERATED_DEMO_CHAIN_IDS, federatedDemoChain, federatedGraphToRgui, federatedNodeId };

const KIND: Record<PortType, SignalKind> = {
  segment: "audio",
  transcript: "text",
  image: "image",
  control: "ctl",
  environment: "ctl",
};

const PUBLIC_CONFIG: Partial<Record<NodeType, string[]>> = {
  textarea: ["text"],
  "text-diff": ["style"],
  "text-filter": ["mode", "stripPrefix", "pattern", "flags", "replace"],
  "browser-translate-api": ["sourceLang", "lang", "provider"],
  translate: ["sourceLang", "lang", "provider"],
  tts: ["voice", "rate"],
};

export const FEDERATION_DEMO_IDS = {
  plain: FEDERATED_DEMO_CHAIN_IDS.plain,
  agent: FEDERATED_DEMO_CHAIN_IDS.codex,
  diff: FEDERATED_DEMO_CHAIN_IDS.diff,
  filter: FEDERATED_DEMO_CHAIN_IDS.filter,
  translate: FEDERATED_DEMO_CHAIN_IDS.translate,
  tts: FEDERATED_DEMO_CHAIN_IDS.tts,
} as const;

function publicConfig(type: NodeType, cfg: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const keys = PUBLIC_CONFIG[type];
  if (!keys?.length || !cfg) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in cfg) out[k] = cfg[k];
  return Object.keys(out).length ? out : undefined;
}

function nodeCategory(type: NodeType): FederatedNode["category"] {
  const spec = NODE_SPECS[type];
  if (spec.inputs.filter((p) => p.id !== "env").length === 0) return "source";
  if (spec.outputs.length === 0) return "sink";
  return "model";
}

function toFederatedPort(p: { id: string; type: PortType }, dir: "in" | "out"): FederatedPort {
  return {
    id: p.id,
    label: p.id,
    kind: KIND[p.type],
    signal: SIGNAL[p.type] as FederatedPort["signal"],
  };
}

function portKind(nodeType: NodeType, handleId: string, dir: "in" | "out"): SignalKind | undefined {
  const spec = NODE_SPECS[nodeType];
  const list = dir === "in" ? spec.inputs : spec.outputs;
  const type = list.find((p) => p.id === handleId)?.type;
  return type ? KIND[type] : undefined;
}

export function voiceGraphToFederatedGraph(
  graph: VoiceGraph,
  producer: FederatedGraphEnvelope["producer"],
  opts: { namespace?: string } = {},
): FederatedGraphEnvelope {
  // Cross-app envelopes need globally namespaced ids (e.g.
  // "otoji://room/<room>/<nodeId>") so consumers can tell whose node is whose.
  const nsId = (id: string) => (opts.namespace ? federatedNodeId(opts.namespace, id) : id);
  const nodes = Object.values(graph.nodes).map((n): FederatedNode => {
    const spec = NODE_SPECS[n.type];
    return {
      id: nsId(n.id),
      app: "otoji",
      type: `otoji:${n.type}`,
      title: spec.label,
      category: nodeCategory(n.type),
      inputs: spec.inputs.map((p) => toFederatedPort(p, "in")),
      outputs: spec.outputs.map((p) => toFederatedPort(p, "out")),
      pos: n.pos,
      size: n.size ? { w: n.size.w, h: n.size.h, scale: n.scale } : n.scale ? { w: 256, scale: n.scale } : undefined,
      owner: n.device ?? undefined,
      configPublic: publicConfig(n.type, n.config),
      private: n.config?.localOnly === true || n.config?.private === true,
    };
  });
  const edges = graph.edges.flatMap((e): FederatedEdge[] => {
    const s = graph.nodes[e.source];
    const t = graph.nodes[e.target];
    if (!s || !t) return [];
    const out = portKind(s.type, e.sourceHandle, "out");
    const inp = portKind(t.type, e.targetHandle, "in");
    if (!out || !inp) return [];
    return [{
      id: e.id,
      source: { node: nsId(e.source), port: e.sourceHandle, type: out },
      target: { node: nsId(e.target), port: e.targetHandle, type: inp },
      status: "active",
      signal: SIGNAL.transcript as FederatedEdge["signal"],
    }];
  });
  return {
    kind: "rgui-federated-graph",
    schema: FEDERATED_GRAPH_SCHEMA,
    producer,
    revision: String(graph.version),
    ts: Date.now(),
    graph: { nodes, edges },
    capabilities: {
      nodeTypes: [...new Set(nodes.map((n) => n.type))],
      portTypes: ["audio", "text", "image", "ctl"],
      previewKinds: ["lvl", "txt", "busy", "queue", "img"],
    },
  };
}

function textPort(id: string, label = "text"): FederatedPort {
  return {
    id,
    label,
    kind: "text",
    signal: { measure: "extensive", ownership: "copy", fanout: "broadcast", merge: "concat" },
  };
}

function demoLocalNode(id: string, type: NodeType, title: string, x: number): FederatedNode {
  const spec = NODE_SPECS[type];
  return {
    id,
    app: "otoji",
    type: `otoji:${type}`,
    title,
    category: nodeCategory(type),
    owner: "otoji:browser",
    status: "local",
    pos: { x, y: 130 },
    size: { w: type === "textarea" ? 260 : 240, h: type === "textarea" ? 180 : 150 },
    inputs: spec.inputs.map((p) => toFederatedPort(p, "in")),
    outputs: spec.outputs.map((p) => toFederatedPort(p, "out")),
    configPublic: type === "text-filter" ? { mode: "diff-added", stripPrefix: true } : undefined,
  };
}

function demoAgentNode(): FederatedNode {
  return {
    id: FEDERATION_DEMO_IDS.agent,
    app: "agent-yes",
    type: "agent-yes:codex-agent",
    title: "Codex Agent",
    category: "model",
    owner: "agent-yes:codex",
    status: "readonly",
    pos: { x: 300, y: 130 },
    size: { w: 260, h: 150 },
    inputs: [textPort("in", "prompt")],
    outputs: [textPort("out", "reply")],
    configPublic: { demo: true },
  };
}

function demoEdge(source: string, sourcePort: string, target: string, targetPort: string, label: string): FederatedEdge {
  return {
    id: `${source}:${sourcePort}->${target}:${targetPort}`,
    source: { node: source, port: sourcePort, type: "text" },
    target: { node: target, port: targetPort, type: "text" },
    status: "readonly",
    label,
    signal: { measure: "extensive", ownership: "copy", fanout: "broadcast", merge: "concat" },
  };
}

/**
 * Fetch one federated graph envelope from a remote publisher (e.g. agent-yes
 * `GET /api/graph?token=…`). Returns null on HTTP errors or shape mismatch —
 * remote feeds are untrusted, so anything that isn't a valid v1 envelope is
 * dropped here and the caller keeps its last good copy.
 */
export async function fetchFederatedGraph(url: string): Promise<FederatedGraphEnvelope | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isFederatedGraphEnvelope(json) ? json : null;
  } catch {
    return null;
  }
}

/**
 * Hydrate the demo chain's codex stub from a live agent-yes feed: the node id
 * (`ay://agent-yes/codex-agent`) is the authority key, and the live feed owns
 * everything about the node except its slot in the chain layout (pos/size) and
 * the port ids the chain edges are wired to. With agent-yes publishing
 * `renderHints.preview` this makes the node render as the agent's real TUI.
 */
export function hydrateAgentFromFeeds(
  env: FederatedGraphEnvelope,
  feeds: FederatedGraphEnvelope[],
): FederatedGraphEnvelope {
  const live = feeds
    .flatMap((f) => f.graph.nodes)
    .find((n) => n.id === FEDERATION_DEMO_IDS.agent);
  if (!live) return env;
  return {
    ...env,
    graph: {
      ...env.graph,
      nodes: env.graph.nodes.map((n) => {
        if (n.id !== FEDERATION_DEMO_IDS.agent) return n;
        // keep the chain slot's width but adopt the live node's aspect ratio
        // (agent-yes publishes its real PTY cols/rows aspect) so the live
        // terminal embed fills the node instead of letterboxing.
        const w = n.size?.w ?? 260;
        const size =
          live.size?.w && live.size.h
            ? { ...n.size, w, h: Math.round((w * live.size.h) / live.size.w) }
            : n.size;
        return { ...live, pos: n.pos, size, inputs: n.inputs, outputs: n.outputs };
      }),
    },
  };
}

/**
 * Demo envelope aligned to org.rgui.graph.v1. It includes local Otoji nodes so
 * cross-app edges survive rgui clamping; the renderer skips those duplicate
 * local nodes and keeps the edges connected to the authoritative VoiceGraph.
 */
export function agentYesMirrorForOtojiDemo(now = Date.now()): FederatedGraphEnvelope {
  const ids = FEDERATION_DEMO_IDS;
  return {
    kind: "rgui-federated-graph",
    schema: FEDERATED_GRAPH_SCHEMA,
    producer: { app: "agent-yes", origin: "agent-yes.com/demo", workspace: "snomiao/agent-yes", label: "agent-yes" },
    revision: "demo-chain-v1",
    ts: now,
    capabilities: {
      nodeTypes: ["agent-yes:codex-agent", "otoji:textarea", "otoji:text-diff", "otoji:text-filter", "otoji:browser-translate-api", "otoji:tts"],
      portTypes: ["text"],
      previewKinds: ["txt", "busy"],
    },
    graph: {
      nodes: [
        demoLocalNode(ids.plain, "textarea", "Plaintext", 40),
        demoAgentNode(),
        demoLocalNode(ids.diff, "text-diff", "Text Diff", 600),
        demoLocalNode(ids.filter, "text-filter", "Filter: added text", 860),
        demoLocalNode(ids.translate, "browser-translate-api", "Browser Translator en to ja", 1120),
        demoLocalNode(ids.tts, "tts", "In-browser TTS", 1380),
      ],
      edges: [
        demoEdge(ids.plain, "out", ids.agent, "in", "plaintext"),
        demoEdge(ids.agent, "out", ids.diff, "in", "agent output"),
        demoEdge(ids.diff, "out", ids.filter, "in", "diff"),
        demoEdge(ids.filter, "out", ids.translate, "in", "added only"),
        demoEdge(ids.translate, "out", ids.tts, "in", "ja text"),
      ],
    },
  };
}

// Live-embed iframes are cached per node id so the 5s feed poll re-binds the
// SAME element instead of reloading the publisher's page every revision.
const embedFrames = new Map<string, { url: string; el: HTMLIFrameElement }>();
function embedFrameFor(id: string, url: string, aspect?: { w: number; h: number }): HTMLIFrameElement {
  let f = embedFrames.get(id);
  if (!f || f.url !== url) {
    const el = document.createElement("iframe");
    el.src = url;
    // cross-origin live view: scripts + form/fetch writes to the publisher's
    // own API (the spec'd mutation path); still no top-navigation / popups
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    el.style.border = "0";
    el.style.display = "block";
    el.style.background = "#0d1117";
    el.dataset.rguiInteractive = "1"; // scroll/select inside the live terminal
    f = { url, el };
    embedFrames.set(id, f);
  }
  // natural size tracks the node's aspect (publisher's real PTY ratio) so the
  // overlay's fit-scale fills the node without letterboxing on either side
  const w = 520;
  const h = aspect?.w && aspect.h ? Math.round((w * aspect.h) / aspect.w) : 400;
  f.el.style.width = `${w}px`;
  f.el.style.height = `${h}px`;
  return f.el;
}

export function federatedGraphToRguiMirror(
  fg: FederatedGraphEnvelope,
  opts: { skipNodeIds?: Set<string> } = {},
): RgGraph {
  const safe = clampFederatedGraph(fg);
  const graph = federatedGraphToRgui(safe, { container: false }) as Graph;
  const skip = opts.skipNodeIds ?? new Set<string>();
  const nodes = graph.nodes.filter((n) => !skip.has(n.id)) as RgGraph["nodes"];
  // real live UI: glue the publisher's own single-node view over the node rect;
  // the canvas terminal-preview card stays underneath as the LOD fallback.
  if (typeof document !== "undefined") {
    for (const fn of safe.graph.nodes) {
      const url = federatedEmbedUrl(fn);
      if (!url) continue;
      const node = nodes.find((n) => n.id === fn.id);
      if (!node) continue;
      node.overlay = {
        el: embedFrameFor(fn.id, url, fn.size?.w && fn.size.h ? { w: fn.size.w, h: fn.size.h } : undefined),
        anchor: "over",
        offset: { x: 0, y: 0 },
        scale: "fit",
        minScale: 0.5,
        // allow CSS upscaling past the iframe's natural size — a slightly soft
        // terminal beats the overlay pinning at 520px inside a bigger node
        maxScale: 4,
        clip: "node",
        overflow: "hidden",
      };
    }
  }
  return {
    nodes,
    edges: graph.edges.filter((e) => !(skip.has(e.from.node) && skip.has(e.to.node))) as RgGraph["edges"],
    fanout: graph.fanout,
  };
}

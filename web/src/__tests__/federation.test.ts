import { describe, expect, test } from "vitest";
import {
  FEDERATION_DEMO_IDS,
  agentYesMirrorForOtojiDemo,
  federatedGraphToRguiMirror,
  voiceGraphToFederatedGraph,
} from "../graph/federation";
import { emptyGraph, edgeId, type VoiceGraph } from "../graph/model";

function graph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes.a = {
    id: "a",
    type: "textarea",
    device: "browser-a",
    pos: { x: 1, y: 2 },
    config: { text: "hello", privateToken: "secret" },
  };
  g.nodes.b = {
    id: "b",
    type: "text-filter",
    device: "browser-a",
    pos: { x: 260, y: 2 },
    config: { mode: "diff-added", stripPrefix: true },
  };
  g.edges.push({ id: edgeId({ source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }), source: "a", sourceHandle: "out", target: "b", targetHandle: "in" });
  return g;
}

describe("federation", () => {
  test("exports a public semantic graph without private config keys", () => {
    const fg = voiceGraphToFederatedGraph(graph(), { app: "otoji", origin: "http://localhost", deviceId: "browser-a" });
    expect(fg.kind).toBe("rgui-federated-graph");
    expect(fg.graph.nodes.map((n) => n.type)).toEqual(["otoji:textarea", "otoji:text-filter"]);
    expect(fg.graph.nodes[0].configPublic).toEqual({ text: "hello" });
    expect(JSON.stringify(fg)).not.toContain("secret");
    expect(fg.graph.edges[0].source.type).toBe("text");
    expect(fg.graph.edges[0].target.type).toBe("text");
  });

  test("builds the requested agent-yes read-only chain bridge", () => {
    const fg = agentYesMirrorForOtojiDemo();
    expect(fg.graph.nodes.some((n) => n.id === FEDERATION_DEMO_IDS.agent && n.app === "agent-yes")).toBe(true);
    expect(fg.graph.edges.map((e) => [e.source.node, e.target.node])).toEqual([
      [FEDERATION_DEMO_IDS.plain, FEDERATION_DEMO_IDS.agent],
      [FEDERATION_DEMO_IDS.agent, FEDERATION_DEMO_IDS.diff],
      [FEDERATION_DEMO_IDS.diff, FEDERATION_DEMO_IDS.filter],
      [FEDERATION_DEMO_IDS.filter, FEDERATION_DEMO_IDS.translate],
      [FEDERATION_DEMO_IDS.translate, FEDERATION_DEMO_IDS.tts],
    ]);
    expect(fg.graph.edges.every((e) => e.status === "readonly")).toBe(true);
  });

  test("converts remote mirrors to rgui nodes and clamps hostile geometry", () => {
    const fg = agentYesMirrorForOtojiDemo();
    fg.graph.nodes[0].pos = { x: 9999999, y: -9999999 };
    fg.graph.nodes[0].size = { w: 9999999, h: -1 };
    const rg = federatedGraphToRguiMirror(fg);
    expect(rg.nodes[0].remote).toBe(true);
    expect(rg.nodes[0].x).toBe(1000000);
    expect(rg.nodes[0].y).toBe(-1000000);
    expect(rg.nodes[0].w).toBe(8192);
    expect(rg.nodes[0].h).toBe(64);
    expect(rg.edges).toHaveLength(5);
    expect(rg.edges.every((e) => e.label)).toBe(true);
  });

  test("can skip local VoiceGraph nodes while preserving cross-system edges", () => {
    const fg = agentYesMirrorForOtojiDemo();
    const local = new Set([FEDERATION_DEMO_IDS.plain, FEDERATION_DEMO_IDS.diff, FEDERATION_DEMO_IDS.filter, FEDERATION_DEMO_IDS.translate, FEDERATION_DEMO_IDS.tts]);
    const rg = federatedGraphToRguiMirror(fg, { skipNodeIds: local });
    expect(rg.nodes.map((n) => n.id)).toEqual([FEDERATION_DEMO_IDS.agent]);
    expect(rg.edges.map((e) => [e.from.node, e.to.node])).toEqual([
      [FEDERATION_DEMO_IDS.plain, FEDERATION_DEMO_IDS.agent],
      [FEDERATION_DEMO_IDS.agent, FEDERATION_DEMO_IDS.diff],
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { buildAdjacency } from "../graph/runtime";
import { emptyGraph, type VoiceGraph } from "../graph/model";

function chain(): VoiceGraph {
  const g = emptyGraph();
  g.nodes = {
    mic: { id: "mic", type: "mic-vad", device: null, pos: { x: 0, y: 0 } },
    stt: { id: "stt", type: "stt", device: null, pos: { x: 0, y: 0 } },
    sink: { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } },
  };
  g.edges = [
    { id: "e1", source: "mic", sourceHandle: "out", target: "stt", targetHandle: "in" },
    { id: "e2", source: "stt", sourceHandle: "out", target: "sink", targetHandle: "in" },
  ];
  return g;
}

describe("buildAdjacency", () => {
  it("maps source ports to their targets", () => {
    const adj = buildAdjacency(chain());
    expect(adj.get("mic:out")).toEqual([{ node: "stt", port: "in" }]);
    expect(adj.get("stt:out")).toEqual([{ node: "sink", port: "in" }]);
    expect(adj.get("sink:out")).toBeUndefined();
  });

  it("supports fan-out from one output", () => {
    const g = chain();
    g.nodes.sink2 = { id: "sink2", type: "sink", device: null, pos: { x: 0, y: 0 } };
    g.edges.push({ id: "e3", source: "stt", sourceHandle: "out", target: "sink2", targetHandle: "in" });
    const adj = buildAdjacency(g);
    expect(adj.get("stt:out")).toHaveLength(2);
  });
});

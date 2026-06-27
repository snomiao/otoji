import { describe, it, expect } from "vitest";
import { canConnect, edgeId, emptyGraph, type VoiceGraph } from "../graph/model";

function graph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes = {
    mic: { id: "mic", type: "mic-vad", device: null, pos: { x: 0, y: 0 } },
    stt: { id: "stt", type: "stt", device: null, pos: { x: 0, y: 0 } },
    sink: { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } },
  };
  return g;
}

describe("canConnect", () => {
  it("allows matching port types (segment->segment, transcript->transcript)", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "stt", "in")).toBe(true); // segment->segment
    expect(canConnect(g, "stt", "out", "sink", "in")).toBe(true); // transcript->transcript
  });

  it("rejects mismatched port types", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "sink", "in")).toBe(false); // segment->transcript
  });

  it("rejects self-connection and unknown nodes", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "mic", "in")).toBe(false);
    expect(canConnect(g, "ghost", "out", "stt", "in")).toBe(false);
  });

  it("rejects a second edge into an occupied input", () => {
    const g = graph();
    g.edges.push({ id: "e1", source: "mic", sourceHandle: "out", target: "stt", targetHandle: "in" });
    expect(canConnect(g, "mic", "out", "stt", "in")).toBe(false);
  });
});

describe("edgeId", () => {
  it("is stable for the same endpoints", () => {
    const e = { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" };
    expect(edgeId(e)).toBe("a:out->b:in");
  });
});

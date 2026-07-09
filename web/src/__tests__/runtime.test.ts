import { describe, it, expect } from "vitest";
import { buildAdjacency, GraphRuntime } from "../graph/runtime";
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

describe("textarea node", () => {
  function textGraph(text?: string): VoiceGraph {
    const g = emptyGraph();
    g.nodes = {
      t: { id: "t", type: "textarea", device: null, pos: { x: 0, y: 0 }, config: text === undefined ? {} : { text } },
      sink: { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } },
    };
    g.edges = [{ id: "e", source: "t", sourceHandle: "out", target: "sink", targetHandle: "in" }];
    return g;
  }

  it("emits committed text paragraph-by-paragraph on start", async () => {
    const got: string[] = [];
    const rt = new GraphRuntime(textGraph("hello world\n\nsecond paragraph\n"), {
      onSink: (_id, tr) => got.push(tr.text),
    });
    await rt.start();
    expect(got).toEqual(["hello world", "second paragraph"]);
    await rt.stop();
  });

  it("emits nothing when the text is empty", async () => {
    const got: string[] = [];
    const rt = new GraphRuntime(textGraph(), { onSink: (_id, tr) => got.push(tr.text) });
    await rt.start();
    expect(got).toEqual([]);
    await rt.stop();
  });
});

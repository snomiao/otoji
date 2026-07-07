import { describe, it, expect } from "vitest";
import { voiceGraphToRgui } from "../graph/rgui-adapter";
import { emptyGraph, type VoiceGraph } from "../graph/model";

function graph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes["m"] = { id: "m", type: "mic-vad", device: "dev1", pos: { x: 0, y: 0 } };
  g.nodes["s"] = { id: "s", type: "stt", device: null, pos: { x: 200, y: 10 } };
  g.nodes["k"] = { id: "k", type: "sink", device: "dev1", pos: { x: 400, y: 20 } };
  g.edges = [
    { id: "e1", source: "m", sourceHandle: "out", target: "s", targetHandle: "in" },
    { id: "e2", source: "s", sourceHandle: "out", target: "k", targetHandle: "in" },
  ];
  return g;
}

describe("voiceGraphToRgui", () => {
  it("maps nodes with titles, positions, and category by port topology", () => {
    const rg = voiceGraphToRgui(graph());
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    expect(byId["m"].category).toBe("source"); // no inputs
    expect(byId["s"].category).toBe("model"); // has both
    expect(byId["k"].category).toBe("sink"); // no outputs
    expect(byId["m"].title).toBe("Mic + VAD");
    expect(byId["s"].x).toBe(200);
    expect(byId["s"].y).toBe(10);
  });

  it("maps port signal types to rgui kinds", () => {
    const rg = voiceGraphToRgui(graph());
    const stt = rg.nodes.find((n) => n.id === "s")!;
    expect(stt.inputs[0].kind).toBe("audio"); // segment -> audio
    expect(stt.outputs[0].kind).toBe("text"); // transcript -> text
  });

  it("renders the device field via the mapper", () => {
    const rg = voiceGraphToRgui(graph(), { deviceName: (d) => (d === "dev1" ? "Laptop" : "elsewhere") });
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    expect(byId["m"].fields).toContainEqual(["device", "Laptop"]);
    expect(byId["s"].fields).toContainEqual(["device", "elsewhere"]);
  });

  it("labels unassigned nodes when no mapper is given", () => {
    const rg = voiceGraphToRgui(graph());
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    expect(byId["s"].fields).toContainEqual(["device", "unassigned"]);
    expect(byId["m"].fields).toContainEqual(["device", "dev1"]);
  });

  it("maps edges to rgui from/to endpoints and drops dangling ones", () => {
    const g = graph();
    g.edges.push({ id: "e3", source: "s", sourceHandle: "out", target: "ghost", targetHandle: "in" });
    const rg = voiceGraphToRgui(g);
    expect(rg.edges).toHaveLength(2);
    expect(rg.edges[0]).toEqual({ from: { node: "m", port: "out" }, to: { node: "s", port: "in" } });
  });

  it("is deterministic", () => {
    expect(voiceGraphToRgui(graph())).toEqual(voiceGraphToRgui(graph()));
  });
});

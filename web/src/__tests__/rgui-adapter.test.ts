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

  it("passes a persisted size/scale through and defaults the rest", () => {
    const g = graph();
    g.nodes["m"].size = { w: 320, h: 180 };
    g.nodes["m"].scale = 2;
    const rg = voiceGraphToRgui(g);
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    expect(byId["m"].w).toBe(320);
    expect(byId["m"].h).toBe(180);
    expect(byId["m"].scale).toBe(2);
    // untouched text-preview nodes get the readable preview default box
    expect(byId["s"].w).toBe(260);
    expect(byId["s"].h).toBe(150);
    expect("scale" in byId["s"]).toBe(false);
  });

  it("normalizes out-of-range synced geometry (rgui setGraph does not validate)", () => {
    const g = graph();
    g.nodes["m"].size = { w: 10, h: 100 }; // below rgui's min width
    g.nodes["m"].scale = 99; // above rgui's MAX_SCALE
    g.nodes["s"].scale = 0.01; // below rgui's MIN_SCALE
    const rg = voiceGraphToRgui(g);
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    expect(byId["m"].scale).toBe(8); // clamped to MAX_SCALE
    expect(byId["m"].w).toBe(96 * 8); // floored to NODE_MIN_W * scale
    expect(byId["s"].scale).toBe(0.25); // clamped to MIN_SCALE
  });

  it("gives textarea nodes an editor-sized default box, explicit size wins", () => {
    const g = emptyGraph();
    g.nodes["t"] = { id: "t", type: "textarea", device: null, pos: { x: 0, y: 0 } };
    const rg = voiceGraphToRgui(g);
    expect(rg.nodes[0].w).toBe(320);
    expect(rg.nodes[0].h).toBe(232);
    g.nodes["t"].size = { w: 400, h: 300 };
    const rg2 = voiceGraphToRgui(g);
    expect(rg2.nodes[0].w).toBe(400);
    expect(rg2.nodes[0].h).toBe(300);
  });

  it("presents model-source providers as distinct source nodes", () => {
    const g = emptyGraph();
    g.nodes["hf"] = { id: "hf", type: "model-source", device: null, pos: { x: 0, y: 0 }, config: { provider: "huggingface" } };
    g.nodes["cv"] = { id: "cv", type: "model-source", device: null, pos: { x: 300, y: 0 }, config: { provider: "civitai" } };
    g.nodes["wl"] = { id: "wl", type: "model-source", device: null, pos: { x: 600, y: 0 }, config: { provider: "webllm" } };
    const byId = Object.fromEntries(voiceGraphToRgui(g).nodes.map((node) => [node.id, node]));
    expect(byId["hf"].title).toBe("Hugging Face Models");
    expect(byId["cv"].title).toBe("Civitai Models");
    expect(byId["wl"].title).toBe("WebLLM Models");
  });

  it("uses editable media titles and exposes state input/output ports", () => {
    const g = emptyGraph();
    g.nodes.audio = { id: "audio", type: "file-audio", device: null, pos: { x: 0, y: 0 }, config: { title: "Interview.wav" } };
    g.nodes.video = { id: "video", type: "video-clip", device: null, pos: { x: 300, y: 0 }, config: { file: "demo.webm" } };
    const byId = Object.fromEntries(voiceGraphToRgui(g).nodes.map((node) => [node.id, node]));
    expect(byId.audio.title).toBe("Interview.wav");
    expect(byId.audio.inputs.map((port) => port.id)).toEqual(["in", "env"]);
    expect(byId.audio.outputs.map((port) => port.id)).toEqual(["out"]);
    expect(byId.video.title).toBe("demo.webm");
    expect(byId.video.inputs.map((port) => port.id)).toEqual(["video", "audio", "env"]);
    expect(byId.video.outputs.map((port) => port.id)).toEqual(["video", "audio"]);
  });

  it("is deterministic", () => {
    expect(voiceGraphToRgui(graph())).toEqual(voiceGraphToRgui(graph()));
  });
});

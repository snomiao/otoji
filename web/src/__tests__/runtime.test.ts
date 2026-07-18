import { describe, it, expect, vi } from "vitest";
import { buildAdjacency, GraphRuntime, incompatibleModelRuntime, type ImageMsg, type SegmentMsg, type TranscriptMsg } from "../graph/runtime";
import { emptyGraph, type VoiceGraph } from "../graph/model";
import { webllmTranslate } from "../providers/translate/webllm";

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

  it("emits committed text as one state value and can replay it", async () => {
    const got: string[] = [];
    const rt = new GraphRuntime(textGraph("hello world\n\nsecond paragraph\n"), {
      onSink: (_id, tr) => got.push(tr.text),
    });
    await rt.start();
    expect(got).toEqual(["hello world\n\nsecond paragraph"]);
    await rt.replay("t");
    expect(got).toEqual(["hello world\n\nsecond paragraph", "hello world\n\nsecond paragraph"]);
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

describe("media state nodes", () => {
  function runtimeInput(rt: GraphRuntime, nodeId: string, port: string, message: unknown): void {
    const internal = rt as unknown as { nodes: Map<string, { input?: (port: string, message: unknown) => void }> };
    internal.nodes.get(nodeId)?.input?.(port, message);
  }

  it("replaces and replays a whole text-file value", async () => {
    const graph = emptyGraph();
    graph.nodes.state = { id: "state", type: "file-text", device: null, pos: { x: 0, y: 0 } };
    graph.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } };
    graph.edges = [{ id: "e", source: "state", sourceHandle: "out", target: "sink", targetHandle: "in" }];
    const output: string[] = [];
    const rt = new GraphRuntime(graph, { onSink: (_id, value) => output.push(value.text) });
    await rt.start();
    const value: TranscriptMsg = { text: "first\n\nsecond", audio: { samples: new Float32Array(0), sampleRate: 16_000, durationMs: 0 } };
    runtimeInput(rt, "state", "in", value);
    await rt.replay("state");
    expect(output).toEqual([value.text, value.text]);
    await rt.stop();
  });

  it("replaces whole audio and replays without duplicating preview records", async () => {
    const graph = emptyGraph();
    graph.nodes.state = { id: "state", type: "file-audio", device: null, pos: { x: 0, y: 0 } };
    const previews: SegmentMsg[] = [];
    const emits: string[] = [];
    const rt = new GraphRuntime(graph, {
      onAudio: (_id, value) => previews.push(value),
      onNodeMetric: (id, metric) => { if (id === "state" && metric.event === "emit") emits.push(metric.port ?? ""); },
    });
    await rt.start();
    const value: SegmentMsg = { samples: new Float32Array([0.1, -0.2, 0.3]), sampleRate: 16_000, durationMs: 0.1875 };
    runtimeInput(rt, "state", "in", value);
    await rt.replay("state");
    expect(previews).toEqual([value]);
    expect(emits).toEqual(["out", "out"]);
    await rt.stop();
  });

  it("replaces image and video stream state and replays current outputs", async () => {
    const graph = emptyGraph();
    graph.nodes.image = { id: "image", type: "file-image", device: null, pos: { x: 0, y: 0 } };
    graph.nodes.video = { id: "video", type: "video-clip", device: null, pos: { x: 0, y: 0 } };
    const emits: string[] = [];
    const rt = new GraphRuntime(graph, {
      onNodeMetric: (id, metric) => { if (metric.event === "emit") emits.push(`${id}:${metric.port}`); },
    });
    await rt.start();
    const image: ImageMsg = { bitmap: {} as ImageBitmap, width: 2, height: 2, ts: 1 };
    const audio: SegmentMsg = { samples: new Float32Array([0.1]), sampleRate: 16_000, durationMs: 1 };
    runtimeInput(rt, "image", "in", image);
    runtimeInput(rt, "video", "video", image);
    runtimeInput(rt, "video", "audio", audio);
    await rt.replay("image");
    await rt.replay("video");
    expect(emits).toEqual(["image:out", "video:video", "video:audio", "image:out", "video:video", "video:audio"]);
    await rt.stop();
  });
});

describe("model source node", () => {
  it("stays idle without a selected model reference", async () => {
    const g = emptyGraph();
    g.nodes.source = { id: "source", type: "model-source", device: null, pos: { x: 0, y: 0 }, config: { provider: "civitai" } };
    const errors: Error[] = [];
    const rt = new GraphRuntime(g, { onError: (error) => errors.push(error) });
    await rt.start();
    expect(errors).toEqual([]);
    await rt.stop();
  });

  it("rejects a non-ONNX checkpoint before a browser runner downloads it", () => {
    const error = incompatibleModelRuntime({
      provider: "huggingface",
      id: "google/gemma-4-E4B-it",
      model: "google/gemma-4-E4B-it",
      compatibility: { formats: ["safetensors"], runtimes: ["remote"], tasks: ["text"], basis: "inferred" },
    }, "browser");
    expect(error?.message).toContain("not browser-runnable");
    expect(error?.message).toContain("Choose the Browser runtime filter");
  });

  it("waits for a connected provider and runs the latest prompt with its WebLLM model", async () => {
    const g = emptyGraph();
    g.nodes.agent = { id: "agent", type: "llm-agent", device: null, pos: { x: 200, y: 0 }, config: { backend: "transformers" } };
    g.nodes.source = { id: "source", type: "model-source", device: null, pos: { x: 0, y: 100 }, config: { provider: "webllm" } };
    g.nodes.sink = { id: "sink", type: "sink", device: null, pos: { x: 400, y: 0 } };
    g.edges = [
      { id: "model", source: "source", sourceHandle: "model", target: "agent", targetHandle: "model" },
      { id: "out", source: "agent", sourceHandle: "out", target: "sink", targetHandle: "in" },
    ];
    const chat = vi.spyOn(webllmTranslate, "chat").mockResolvedValue("provider response");
    const output: string[] = [];
    const rt = new GraphRuntime(g, { onSink: (_id, value) => output.push(value.text) });
    await rt.start();
    const agent = (rt as unknown as { nodes: Map<string, { input?: (port: string, message: unknown) => void }> }).nodes.get("agent")!;
    const prompt: TranscriptMsg = { text: "first prompt", audio: { samples: new Float32Array(0), sampleRate: 16_000, durationMs: 0 } };
    agent.input?.("in", prompt);
    expect(chat).not.toHaveBeenCalled();
    agent.input?.("in", { ...prompt, text: "latest prompt" });
    agent.input?.("model", {
      provider: "webllm",
      id: "Qwen-test-MLC",
      model: "Qwen-test-MLC",
      compatibility: { formats: ["mlc"], runtimes: ["browser"], tasks: ["text"], basis: "inferred" },
    });
    await rt.stop();
    expect(chat).toHaveBeenCalledOnce();
    expect(chat).toHaveBeenCalledWith("latest prompt", expect.any(String), "Qwen-test-MLC");
    expect(output).toEqual(["provider response"]);
    chat.mockRestore();
  });
});

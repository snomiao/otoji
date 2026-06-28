import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the mic-vad callbacks so the test can fire a "spoken" segment, and
// stub the heavy/native bits (mic, SenseVoice, WebLLM) so we test ONLY the
// cross-device routing: a transcript hops A→B into a translate node and the
// translated result hops B→A into a sink.
const h = vi.hoisted(() => ({
  mic: null as null | { onSegment: (s: Float32Array, ms: number) => void },
}));

vi.mock("../lib/mic-vad", () => ({
  MIC_VAD_SR: 16000,
  startMicVad: async (opts: { onSegment: (s: Float32Array, ms: number) => void }) => {
    h.mic = { onSegment: opts.onSegment };
    return { stop: async () => {} };
  },
}));

vi.mock("../providers/stt/sensevoice", () => ({
  warmSenseVoice: async () => {},
  sttRecognize: async () => "hello world",
}));

vi.mock("../providers/translate/webllm", () => ({
  webllmTranslate: {
    isAvailable: () => true,
    warm: async () => {},
    // Echo the target language so the assertion proves the right node ran.
    translate: async (text: string, lang: string) => `[${lang}] ${text}`,
  },
}));

import { GraphRuntime, type Transport } from "../graph/runtime";
import type { EdgeFrame } from "../graph/frames";
import { emptyGraph, type VoiceGraph } from "../graph/model";

/** Two-device in-memory mesh: each side's send() delivers to the other's receiver. */
function meshPair() {
  const recv: Record<string, ((f: EdgeFrame) => void) | null> = { A: null, B: null };
  const make = (other: "A" | "B"): Transport => ({
    send: (_to, frame) => recv[other]?.(frame),
    setReceiver: (cb) => {
      recv[other === "A" ? "B" : "A"] = cb;
    },
  });
  return { transportA: make("B"), transportB: make("A") };
}

function flush(ticks = 12): Promise<void> {
  return new Promise((res) => {
    let n = 0;
    const step = () => (++n >= ticks ? res() : setTimeout(step, 0));
    setTimeout(step, 0);
  });
}

function distGraph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes = {
    mic: { id: "mic", type: "mic-vad", device: "A", pos: { x: 0, y: 0 } },
    stt: { id: "stt", type: "stt", device: "A", pos: { x: 0, y: 0 } },
    tr: { id: "tr", type: "translate", device: "B", pos: { x: 0, y: 0 }, config: { lang: "Japanese" } },
    sink: { id: "sink", type: "sink", device: "A", pos: { x: 0, y: 0 } },
  };
  g.edges = [
    { id: "e1", source: "mic", sourceHandle: "out", target: "stt", targetHandle: "in" },
    { id: "e2", source: "stt", sourceHandle: "out", target: "tr", targetHandle: "in" },
    { id: "e3", source: "tr", sourceHandle: "out", target: "sink", targetHandle: "in" },
  ];
  return g;
}

describe("cross-device translate routing", () => {
  beforeEach(() => {
    h.mic = null;
  });

  it("routes stt@A → translate@B → sink@A across the mesh", async () => {
    const graph = distGraph();
    const { transportA, transportB } = meshPair();
    const deviceIds = ["A", "B"];
    const sunk: string[] = [];

    const rtA = new GraphRuntime(graph, {
      self: { myId: "A", deviceIds, transport: transportA },
      onSink: (_id, tr) => sunk.push(tr.text),
    });
    const rtB = new GraphRuntime(graph, {
      self: { myId: "B", deviceIds, transport: transportB },
    });

    await rtA.start();
    await rtB.start();

    // "speak" on device A: fires mic → stt(@A) → transcript hops to translate(@B)
    // → translated text hops back to sink(@A).
    expect(h.mic).not.toBeNull();
    h.mic!.onSegment(new Float32Array([0.1, -0.1, 0.2]), 200);
    await flush();

    expect(sunk).toEqual(["[Japanese] hello world"]);

    await rtA.stop();
    await rtB.stop();
  });

  it("runs the translate model only on its owning device", async () => {
    const graph = distGraph();
    const { transportA, transportB } = meshPair();
    const { webllmTranslate } = await import("../providers/translate/webllm");
    const warmA = vi.spyOn(webllmTranslate, "warm");

    // Device A owns no translate node, so it must not warm a translate model.
    const rtA = new GraphRuntime(graph, { self: { myId: "A", deviceIds: ["A", "B"], transport: transportA } });
    await rtA.start();
    expect(warmA).not.toHaveBeenCalled();

    // Device B owns the translate node → it warms exactly that model.
    const rtB = new GraphRuntime(graph, { self: { myId: "B", deviceIds: ["A", "B"], transport: transportB } });
    await rtB.start();
    expect(warmA).toHaveBeenCalledTimes(1);

    await rtA.stop();
    await rtB.stop();
  });
});

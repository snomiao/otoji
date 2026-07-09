import { describe, it, expect } from "vitest";
import { nodeOwner } from "../graph/runtime";
import { buildSegmentFrame, buildTranscriptFrame, frameToMessage } from "../graph/frames";
import { edgeId, type VoiceGraph, type VoiceNode } from "../graph/model";
import { illegalCrossDeviceEdges } from "../graph/signal";

const node = (device: string | null): VoiceNode => ({ id: "n", type: "stt", device, pos: { x: 0, y: 0 } });

describe("nodeOwner", () => {
  it("uses explicit device assignment", () => {
    expect(nodeOwner(node("dev-b"), ["dev-a", "dev-b"])).toBe("dev-b");
  });
  it("assigns unassigned nodes to the smallest device id (single owner)", () => {
    expect(nodeOwner(node(null), ["dev-c", "dev-a", "dev-b"])).toBe("dev-a");
  });
  it("honors an explicit assignment even if that device is offline (stable id)", () => {
    // device ids are persisted, so an offline owner keeps its node (reclaimed on rejoin)
    expect(nodeOwner(node("offline-dev"), ["dev-a", "dev-b"])).toBe("offline-dev");
  });
  it("returns null with no devices", () => {
    expect(nodeOwner(node(null), [])).toBeNull();
  });
});

describe("edge frames", () => {
  it("round-trips a segment (samples preserved)", () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1, -1]);
    const f = buildSegmentFrame("stt", "in", { samples, sampleRate: 16000, durationMs: 120 });
    expect(f.mtype).toBe("segment");
    const msg = frameToMessage(f) as { samples: Float32Array; sampleRate: number; durationMs: number };
    expect(Array.from(msg.samples)).toEqual(Array.from(samples));
    expect(msg.sampleRate).toBe(16000);
    expect(msg.durationMs).toBe(120);
  });

  it("round-trips a transcript (text + audio)", () => {
    const samples = new Float32Array([0.1, -0.2]);
    const f = buildTranscriptFrame("sink", "in", { text: "你好", audio: { samples, sampleRate: 16000, durationMs: 80 } });
    expect(f.mtype).toBe("transcript");
    const msg = frameToMessage(f) as { text: string; audio: { samples: Float32Array } };
    expect(msg.text).toBe("你好");
    expect(Array.from(msg.audio.samples)).toEqual(Array.from(samples));
  });
});

describe("cross-device graph signals", () => {
  it("allows image and control edges to cross devices", () => {
    const graph: VoiceGraph = {
      version: 1,
      nodes: {
        screen: { id: "screen", type: "screen-share", device: "dev-a", pos: { x: 0, y: 0 } },
        ocr: { id: "ocr", type: "paddle-ocr", device: "dev-b", pos: { x: 1, y: 0 } },
      },
      edges: [
        { id: edgeId({ source: "screen", sourceHandle: "out", target: "ocr", targetHandle: "in" }), source: "screen", sourceHandle: "out", target: "ocr", targetHandle: "in" },
        { id: edgeId({ source: "ocr", sourceHandle: "rate", target: "screen", targetHandle: "rate" }), source: "ocr", sourceHandle: "rate", target: "screen", targetHandle: "rate" },
      ],
    };
    const illegal = illegalCrossDeviceEdges(graph, (n) => n.device);
    expect(illegal.size).toBe(0);
  });
});

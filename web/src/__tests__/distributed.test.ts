import { describe, it, expect } from "vitest";
import { nodeOwner } from "../graph/runtime";
import { buildSegmentFrame, buildTranscriptFrame, decodePcm16, encodePcm16, frameToMessage, type EdgeFrame } from "../graph/frames";
import { bytesToBase64 } from "../lib/base64";
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
  it("round-trips a segment as PCM16", () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1, -1]);
    const f = buildSegmentFrame("stt", "in", { samples, sampleRate: 16000, durationMs: 120 });
    expect(f.mtype).toBe("segment");
    expect(f.samplesPcm16B64).toBeTypeOf("string");
    expect(f.samplesB64).toBeUndefined();
    const msg = frameToMessage(f) as { samples: Float32Array; sampleRate: number; durationMs: number };
    expect(Math.max(...msg.samples.map((sample, i) => Math.abs(sample - samples[i])))).toBeLessThanOrEqual(1 / 32767);
    expect(msg.sampleRate).toBe(16000);
    expect(msg.durationMs).toBe(120);
  });

  it("round-trips a transcript (text + audio)", () => {
    const samples = new Float32Array([0.1, -0.2]);
    const f = buildTranscriptFrame("sink", "in", { text: "你好", audio: { samples, sampleRate: 16000, durationMs: 80 } });
    expect(f.mtype).toBe("transcript");
    const msg = frameToMessage(f) as { text: string; audio: { samples: Float32Array } };
    expect(msg.text).toBe("你好");
    expect(Math.max(...msg.audio.samples.map((sample, i) => Math.abs(sample - samples[i])))).toBeLessThanOrEqual(1 / 32767);
  });

  it("clamps PCM16 samples and decodes an empty segment", () => {
    expect(Array.from(decodePcm16(encodePcm16(new Float32Array([-2, 2]))))).toEqual([-1, 1]);
    const msg = frameToMessage(buildSegmentFrame("stt", "in", { samples: new Float32Array(), sampleRate: 16000, durationMs: 0 }));
    expect(msg.samples).toHaveLength(0);
  });

  it("decodes legacy Float32 segment frames", () => {
    const samples = new Float32Array([0.125, -0.75]);
    const samplesB64 = bytesToBase64(new Uint8Array(samples.buffer));
    const frame: EdgeFrame = { kind: "edge", target: "stt", port: "in", mtype: "segment", sampleRate: 16000, durationMs: 0.125, samplesB64 };
    expect(Array.from((frameToMessage(frame) as { samples: Float32Array }).samples)).toEqual(Array.from(samples));
  });
});

describe("cross-device graph signals", () => {
  it("allows image edges to cross devices", () => {
    const graph: VoiceGraph = {
      version: 1,
      nodes: {
        screen: { id: "screen", type: "screen-share", device: "dev-a", pos: { x: 0, y: 0 } },
        ocr: { id: "ocr", type: "paddle-ocr", device: "dev-b", pos: { x: 1, y: 0 } },
      },
      edges: [
        { id: edgeId({ source: "screen", sourceHandle: "out", target: "ocr", targetHandle: "in" }), source: "screen", sourceHandle: "out", target: "ocr", targetHandle: "in" },
      ],
    };
    const illegal = illegalCrossDeviceEdges(graph, (n) => n.device);
    expect(illegal.size).toBe(0);
  });
});

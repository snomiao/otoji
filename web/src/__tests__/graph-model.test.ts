import { describe, it, expect } from "vitest";
import { canConnect, edgeId, emptyGraph, type VoiceGraph } from "../graph/model";

function graph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes = {
    mic: { id: "mic", type: "mic-vad", device: null, pos: { x: 0, y: 0 } },
    stt: { id: "stt", type: "stt", device: null, pos: { x: 0, y: 0 } },
    translate: { id: "translate", type: "translate", device: null, pos: { x: 0, y: 0 } },
    sink: { id: "sink", type: "sink", device: null, pos: { x: 0, y: 0 } },
    aud: { id: "aud", type: "audio-out", device: null, pos: { x: 0, y: 0 } },
    spk: { id: "spk", type: "speaker", device: null, pos: { x: 0, y: 0 } },
    tts: { id: "tts", type: "tts", device: null, pos: { x: 0, y: 0 } },
    ttsm: { id: "ttsm", type: "tts-model", device: null, pos: { x: 0, y: 0 } },
    mdl: { id: "mdl", type: "model", device: null, pos: { x: 0, y: 0 } },
    pipe: { id: "pipe", type: "pipe", device: null, pos: { x: 0, y: 0 } },
  };
  return g;
}

describe("canConnect", () => {
  it("allows matching port types (segment->segment, transcript->transcript)", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "stt", "in")).toBe(true); // segment->segment
    expect(canConnect(g, "stt", "out", "sink", "in")).toBe(true); // transcript->transcript
    // translate sits inline on the transcript stream: stt -> translate -> sink
    expect(canConnect(g, "stt", "out", "translate", "in")).toBe(true);
    expect(canConnect(g, "translate", "out", "sink", "in")).toBe(true);
  });

  it("rejects audio feeding straight into translate", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "translate", "in")).toBe(false); // segment->transcript
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

  it("audio-out accepts both a raw segment (seg) and a transcript (in)", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "aud", "seg")).toBe(true); // segment->seg
    expect(canConnect(g, "stt", "out", "aud", "in")).toBe(true); // transcript->in
    // wrong port type into the wrong handle is rejected
    expect(canConnect(g, "mic", "out", "aud", "in")).toBe(false); // segment->transcript handle
    expect(canConnect(g, "stt", "out", "aud", "seg")).toBe(false); // transcript->segment handle
  });

  it("speaker accepts both a raw segment (seg) and a transcript (in)", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "spk", "seg")).toBe(true); // segment->seg
    expect(canConnect(g, "stt", "out", "spk", "in")).toBe(true); // transcript->in
    // wrong port type into the wrong handle is rejected
    expect(canConnect(g, "mic", "out", "spk", "in")).toBe(false); // segment->transcript handle
    expect(canConnect(g, "stt", "out", "spk", "seg")).toBe(false); // transcript->segment handle
  });

  it("tts accepts a transcript, not raw audio", () => {
    const g = graph();
    expect(canConnect(g, "stt", "out", "tts", "in")).toBe(true); // transcript->transcript
    expect(canConnect(g, "translate", "out", "tts", "in")).toBe(true);
    expect(canConnect(g, "mic", "out", "tts", "in")).toBe(false); // segment->transcript
  });

  it("neural tts-model takes a transcript and outputs a segment into a speaker", () => {
    const g = graph();
    expect(canConnect(g, "translate", "out", "ttsm", "in")).toBe(true); // transcript->in
    expect(canConnect(g, "mic", "out", "ttsm", "in")).toBe(false); // segment->transcript
    expect(canConnect(g, "ttsm", "out", "spk", "seg")).toBe(true); // segment out -> speaker
    expect(canConnect(g, "ttsm", "out", "sink", "in")).toBe(false); // segment->transcript
  });

  it("custom model node exposes both port types (task-agnostic wiring)", () => {
    const g = graph();
    expect(canConnect(g, "mic", "out", "mdl", "in_seg")).toBe(true); // ASR input
    expect(canConnect(g, "stt", "out", "mdl", "in_txt")).toBe(true); // text input
    expect(canConnect(g, "mdl", "out_txt", "sink", "in")).toBe(true); // text output
    expect(canConnect(g, "mdl", "out_seg", "spk", "seg")).toBe(true); // audio output
    expect(canConnect(g, "mic", "out", "mdl", "in_txt")).toBe(false); // segment->transcript
  });

  it("cli pipe node passes transcripts through (text in/out)", () => {
    const g = graph();
    expect(canConnect(g, "stt", "out", "pipe", "in")).toBe(true); // transcript -> in
    expect(canConnect(g, "pipe", "out", "sink", "in")).toBe(true); // transcript out -> sink
    expect(canConnect(g, "mic", "out", "pipe", "in")).toBe(false); // segment -> transcript
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

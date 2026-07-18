import { describe, it, expect } from "vitest";
import { SIGNAL, isDuplicable, isAliasable, edgeSignalType, illegalCrossDeviceEdges } from "../graph/signal";
import { voiceGraphToRgui } from "../graph/rgui-adapter";
import { emptyGraph, type VoiceGraph } from "../graph/model";

// Owner resolution stand-in matching runtime.nodeOwner: explicit assignment,
// else the smallest online device id.
const ownerWith = (online: string[]) => (n: { device: string | null }) =>
  n.device ?? ([...online].sort()[0] ?? null);

/** camera → OCR (image edge) + OCR → sink (text). */
function visionGraph(): VoiceGraph {
  const g = emptyGraph();
  g.nodes["cam"] = { id: "cam", type: "camera", device: "a", pos: { x: 0, y: 0 } };
  g.nodes["ocr"] = { id: "ocr", type: "paddle-ocr", device: "a", pos: { x: 200, y: 0 } };
  g.nodes["k"] = { id: "k", type: "sink", device: "b", pos: { x: 400, y: 0 } };
  g.edges = [
    { id: "img", source: "cam", sourceHandle: "out", target: "ocr", targetHandle: "in" },
    { id: "txt", source: "ocr", sourceHandle: "out", target: "k", targetHandle: "in" },
  ];
  return g;
}

describe("signal declarations", () => {
  it("declares the agreed ownership per port type", () => {
    expect(SIGNAL.transcript.ownership).toBe("copy");
    expect(SIGNAL.segment.ownership).toBe("clone");
    expect(SIGNAL.image.ownership).toBe("clone");
    expect(SIGNAL.control.ownership).toBe("copy");
    expect(SIGNAL.environment.ownership).toBe("copy");
    expect(SIGNAL.spatial.ownership).toBe("clone");
    expect(SIGNAL.model.ownership).toBe("copy");
  });

  it("keeps model weights local while allowing common media across devices", () => {
    expect(SIGNAL.model.transport).toBe("reference");
    expect(SIGNAL.environment.transport).toBe("reference");
    expect(SIGNAL.transcript.transport).toBe("json");
    expect(SIGNAL.segment.transport).toBe("pcm");
    expect(SIGNAL.image.transport).toBe("latest-image");
  });

  it("copy/clone are duplicable, share is aliasable-only, move is neither", () => {
    expect(isDuplicable("copy")).toBe(true);
    expect(isDuplicable("clone")).toBe(true);
    expect(isDuplicable("share")).toBe(false);
    expect(isDuplicable("move")).toBe(false);
    expect(isAliasable("share")).toBe(true);
    expect(isAliasable("move")).toBe(false);
  });

  it("resolves an edge's signal from its source output port", () => {
    const g = visionGraph();
    expect(edgeSignalType(g, g.edges[0])).toBe("image");
    expect(edgeSignalType(g, g.edges[1])).toBe("transcript");
    expect(edgeSignalType(g, { source: "ghost", sourceHandle: "out" })).toBe(null);
  });
});

describe("illegalCrossDeviceEdges", () => {
  it("is empty while every share-signal edge stays on one device", () => {
    // image stays a↔a; the text edge crosses but is copy.
    expect(illegalCrossDeviceEdges(visionGraph(), ownerWith(["a", "b"]))).toEqual(new Set());
  });

  it("allows image edges that resolve to different devices", () => {
    const g = visionGraph();
    g.nodes["ocr"].device = "b"; // now cam(a)→ocr(b) image crosses
    expect(illegalCrossDeviceEdges(g, ownerWith(["a", "b"]))).toEqual(new Set());
  });

  it("never flags duplicable (audio/text) edges", () => {
    const g = emptyGraph();
    g.nodes["m"] = { id: "m", type: "mic-vad", device: "a", pos: { x: 0, y: 0 } };
    g.nodes["s"] = { id: "s", type: "stt", device: "b", pos: { x: 200, y: 0 } };
    g.edges = [{ id: "e", source: "m", sourceHandle: "out", target: "s", targetHandle: "in" }];
    expect(illegalCrossDeviceEdges(g, ownerWith(["a", "b"]))).toEqual(new Set());
  });

  it("treats unassigned endpoints as the deterministic default owner", () => {
    const g = visionGraph();
    g.nodes["cam"].device = null; // resolves to "a" (smallest online) = ocr's device
    expect(illegalCrossDeviceEdges(g, ownerWith(["a", "b"]))).toEqual(new Set());
    g.nodes["ocr"].device = "b"; // cam→"a" vs ocr→"b": still has a wire format
    expect(illegalCrossDeviceEdges(g, ownerWith(["a", "b"]))).toEqual(new Set());
  });

  it("stays quiet when an owner is unknown (no online devices)", () => {
    const g = visionGraph();
    g.nodes["cam"].device = null;
    g.nodes["ocr"].device = null;
    expect(illegalCrossDeviceEdges(g, ownerWith([]))).toEqual(new Set());
  });
});

describe("adapter signal passthrough", () => {
  it("rides measure/ownership on every rgui port", () => {
    const rg = voiceGraphToRgui(visionGraph());
    const byId = Object.fromEntries(rg.nodes.map((n) => [n.id, n]));
    const camOut = byId["cam"].outputs.find((p) => p.id === "out")!;
    expect(camOut.ownership).toBe("clone");
    expect(camOut.measure).toBe("intensive");
    const ocrOut = byId["ocr"].outputs.find((p) => p.id === "out")!;
    expect(ocrOut.ownership).toBe("copy");
    expect(ocrOut.measure).toBe("extensive");
    const ocrIn = byId["ocr"].inputs.find((p) => p.id === "in")!;
    expect(ocrIn.ownership).toBe("clone");
  });
});

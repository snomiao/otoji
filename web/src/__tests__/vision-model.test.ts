import { describe, it, expect } from "vitest";
import { formatLabels, formatJsonl, type Detection } from "../lib/detect-format";
import { templateFromSelection, BUILTIN_TEMPLATES } from "../lib/templates";
import { NODE_SPECS } from "../graph/model";

const dets: Detection[] = [
  { label: "person", score: 0.981, box: { xmin: 10.4, ymin: 20.6, xmax: 100, ymax: 200 } },
  { label: "person", score: 0.7, box: { xmin: 5, ymin: 5, xmax: 50, ymax: 50 } },
  { label: "cup", score: 0.642, box: { xmin: 0, ymin: 0, xmax: 30, ymax: 30 } },
];

describe("detect-format", () => {
  it("formatLabels de-dupes labels in first-seen order", () => {
    expect(formatLabels(dets)).toBe("person, cup");
    expect(formatLabels([])).toBe("");
  });

  it("formatJsonl emits rounded structured lines", () => {
    expect(formatJsonl([dets[0]])).toBe('{"label":"person","score":0.981,"box":[10,21,100,200]}');
  });
});

describe("templateFromSelection", () => {
  it("normalizes positions to the origin and remaps ids to keys", () => {
    const sel = [
      { id: "a1", type: "camera" as const, x: 300, y: 200 },
      { id: "b2", type: "vision-model" as const, x: 540, y: 200, config: { model: "x" } },
    ];
    const edges = [
      { source: "a1", sourceHandle: "out", target: "b2", targetHandle: "in" },
      { source: "b2", sourceHandle: "rate", target: "zz", targetHandle: "rate" }, // outside selection → dropped
    ];
    const t = templateFromSelection("my", sel, edges, "abc");
    expect(t.id).toBe("user-abc");
    expect(t.nodes.map((n) => [n.type, n.dx, n.dy])).toEqual([
      ["camera", 0, 0],
      ["vision-model", 240, 0],
    ]);
    // only the edge fully inside the selection survives, remapped to keys
    expect(t.edges).toHaveLength(1);
    expect(t.edges[0]).toMatchObject({ fromHandle: "out", toHandle: "in" });
    expect(t.nodes.find((n) => n.type === "vision-model")?.config).toEqual({ model: "x" });
  });
});

describe("builtin templates", () => {
  it("every edge references node keys that exist in the template", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const keys = new Set(t.nodes.map((n) => n.key));
      for (const e of t.edges) {
        expect(keys.has(e.from)).toBe(true);
        expect(keys.has(e.to)).toBe(true);
      }
    }
  });

  it("every edge connects matching port types", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const nodes = new Map(t.nodes.map((n) => [n.key, n.type]));
      for (const e of t.edges) {
        const fromType = nodes.get(e.from)!;
        const toType = nodes.get(e.to)!;
        const out = NODE_SPECS[fromType].outputs.find((p) => p.id === e.fromHandle)?.type;
        const input = NODE_SPECS[toType].inputs.find((p) => p.id === e.toHandle)?.type;
        expect(out, `${t.id}: ${e.from}.${e.fromHandle}`).toBeTruthy();
        expect(input, `${t.id}: ${e.to}.${e.toHandle}`).toBeTruthy();
        expect(out, `${t.id}: ${e.from}.${e.fromHandle} -> ${e.to}.${e.toHandle}`).toBe(input);
      }
    }
  });

  it("includes a screen OCR diff TTS workflow", () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === "screen-ocr-diff-tts");
    expect(t?.nodes.map((n) => n.type)).toEqual(["screen-share", "paddle-ocr", "stt", "text-normalize", "text-diff", "text-filter", "text-aggregate", "llm-agent", "tts"]);
    expect(t?.edges).toEqual([
      { from: "screen", fromHandle: "out", to: "ocr", toHandle: "in" },
      { from: "ocr", fromHandle: "rate", to: "screen", toHandle: "rate" },
      { from: "screen", fromHandle: "audio", to: "stt", toHandle: "in" },
      { from: "ocr", fromHandle: "out", to: "norm", toHandle: "in" },
      { from: "norm", fromHandle: "out", to: "diff", toHandle: "in" },
      { from: "diff", fromHandle: "out", to: "filter", toHandle: "in" },
      { from: "filter", fromHandle: "out", to: "agg", toHandle: "ocr" },
      { from: "stt", fromHandle: "out", to: "agg", toHandle: "voice" },
      { from: "agg", fromHandle: "out", to: "agent", toHandle: "in" },
      { from: "agent", fromHandle: "out", to: "tts", toHandle: "in" },
    ]);
  });
});

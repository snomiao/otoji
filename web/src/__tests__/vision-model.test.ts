import { describe, it, expect } from "vitest";
import { formatLabels, formatJsonl, type Detection } from "../lib/detect-format";
import { templateFromSelection, BUILTIN_TEMPLATES } from "../lib/templates";

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
});

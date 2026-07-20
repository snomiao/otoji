import { describe, it, expect } from "vitest";
import { formatLabels, formatJsonl, type Detection } from "../lib/detect-format";
import { templateFromSelection, BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from "../lib/templates";
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

  it("every builtin template belongs to a known category", () => {
    const known = new Set(TEMPLATE_CATEGORIES.map((c) => c.id));
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.category, `template ${t.id} needs a category`).toBeDefined();
      expect(known.has(t.category!), `template ${t.id} has unknown category ${t.category}`).toBe(true);
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

  it("includes a browser-only Qwen agent demo with editable text state", () => {
    const template = BUILTIN_TEMPLATES.find((item) => item.id === "qwen-agent-browser")!;
    expect(template.nodes.map((node) => node.type)).toEqual(["textarea", "model-source", "llm-agent", "textarea"]);
    expect(template.nodes.find((node) => node.key === "provider")?.config).toMatchObject({
      provider: "webllm",
      ref: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      runtimeFilter: "browser",
    });
    expect(template.nodes.find((node) => node.key === "agent")?.config).toMatchObject({
      backend: "webllm",
      task: "text-generation",
      model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    });
    expect(template.edges).toContainEqual({ from: "provider", fromHandle: "model", to: "agent", toHandle: "model" });
    expect(template.edges).toContainEqual({ from: "agent", fromHandle: "out", to: "response", toHandle: "in" });
  });

  it("separates browser captioning, text-to-image, and image-to-image workflows", () => {
    const caption = BUILTIN_TEMPLATES.find((item) => item.id === "image-caption-browser")!;
    const textToImage = BUILTIN_TEMPLATES.find((item) => item.id === "text-to-image-native")!;
    const imageToImage = BUILTIN_TEMPLATES.find((item) => item.id === "image-to-image-native")!;
    expect(caption.area).toBeUndefined();
    expect(caption.nodes.find((node) => node.key === "captioner")?.config).toMatchObject({ task: "image-to-text" });
    expect(caption.edges).toContainEqual({ from: "image", fromHandle: "out", to: "captioner", toHandle: "in_img" });
    expect(textToImage.area).toBe("advanced");
    expect(textToImage.nodes.find((node) => node.key === "source")?.config).toMatchObject({ taskFilter: "text-to-image" });
    expect(textToImage.nodes.find((node) => node.key === "generator")?.config).toMatchObject({ mode: "generate", backend: "diffusers" });
    expect(imageToImage.area).toBe("advanced");
    expect(imageToImage.nodes.find((node) => node.key === "source")?.config).toMatchObject({ taskFilter: "image-to-image" });
    expect(imageToImage.nodes.find((node) => node.key === "editor")?.config).toMatchObject({ mode: "edit", strength: 0.75 });
    expect(imageToImage.edges).toContainEqual({ from: "seed", fromHandle: "out", to: "editor", toHandle: "image" });
  });

  it("keeps depth, hand, calibration, model, and rendering as separate spatial nodes", () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === "spatial-monkey")!;
    expect(t.nodes.map((n) => n.type)).toEqual([
      "camera", "depth-field", "hand-space", "spatial-calibration", "rgbd-point-cloud", "model-3d", "spatial-renderer",
    ]);
    const typed = t.edges.map((e) => {
      const from = t.nodes.find((n) => n.key === e.from)!;
      return NODE_SPECS[from.type].outputs.find((p) => p.id === e.fromHandle)?.type;
    });
    expect(typed.filter((x) => x === "spatial")).toHaveLength(7);
  });
});

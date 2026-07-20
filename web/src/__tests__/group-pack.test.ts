import { describe, expect, it } from "vitest";
import { packSelectionFlush } from "../lib/group-pack";

describe("packSelectionFlush", () => {
  it("stacks scattered selected nodes flush in stable y/x order", () => {
    const nodes = [
      { id: "third", x: 80, y: 180, width: 260, height: 70 },
      { id: "untouched", x: 999, y: 5, width: 200, height: 60 },
      { id: "second", x: 60, y: 100, width: 320, height: 55 },
      { id: "first", x: 40, y: 100, width: 200, height: 45 },
    ];

    const packed = packSelectionFlush(nodes, ["third", "second", "first"], 20);

    expect(packed).toEqual({
      first: { x: 40, y: 100 },
      second: { x: 40, y: 145 },
      third: { x: 40, y: 200 },
    });
    expect(packed.second!.y).toBe(packed.first!.y + nodes[3]!.height);
    expect(packed.third!.y).toBe(packed.second!.y + nodes[2]!.height);
    expect(packed).not.toHaveProperty("untouched");
    expect(nodes[0]!.width).toBe(260);
  });
});

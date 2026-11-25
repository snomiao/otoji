import { describe, expect, it } from "vitest";
import { canHostNode } from "../lib/device-role";

describe("canHostNode", () => {
  it.each(["mic-vad", "mic-raw", "web-speech"])("rejects %s on a device without a microphone", (type) => {
    expect(canHostNode(type, { hasMic: false })).toBe(false);
  });

  it("allows sink nodes on any device", () => {
    expect(canHostNode("sink", { hasMic: false })).toBe(true);
  });

  it("allows microphone nodes when capabilities are unknown", () => {
    expect(canHostNode("mic-vad", undefined)).toBe(true);
    expect(canHostNode("mic-vad", {})).toBe(true);
  });
});

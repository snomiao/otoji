import { describe, expect, it } from "vitest";
import { graphShareUrl, readSharedGraph, SHARE_HASH_PREFIX } from "../lib/share-url";
import type { GraphTemplate } from "../lib/templates";

const tpl: GraphTemplate = {
  id: "user-share",
  name: "shared graph",
  nodes: [
    { key: "n0", type: "camera", dx: 0, dy: 0 },
    { key: "n1", type: "depth-field", dx: 240, dy: 0, config: { fps: 5 } },
  ],
  edges: [{ from: "n0", fromHandle: "out", to: "n1", toHandle: "in" }],
};

describe("graph share URL", () => {
  it("roundtrips a template through the #g= hash", () => {
    const url = graphShareUrl(tpl, "https://otoji.org");
    expect(url.startsWith(`https://otoji.org/?local${SHARE_HASH_PREFIX}`)).toBe(true);
    const hash = url.slice(url.indexOf("#"));
    const back = readSharedGraph(hash);
    expect(back).not.toBeNull();
    expect(back!.nodes).toEqual(tpl.nodes);
    expect(back!.edges).toEqual(tpl.edges);
  });

  it("rejects absent, malformed, and empty payloads", () => {
    expect(readSharedGraph("")).toBeNull();
    expect(readSharedGraph("#g=not-a-payload")).toBeNull();
    expect(readSharedGraph("#other=x")).toBeNull();
    const empty = graphShareUrl({ ...tpl, nodes: [] }, "https://otoji.org");
    expect(readSharedGraph(empty.slice(empty.indexOf("#")))).toBeNull();
  });
});

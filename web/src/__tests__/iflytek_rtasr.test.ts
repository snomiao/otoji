import { describe, it, expect } from "vitest";
import { parseRtasrFrame, signRtasrUrl } from "../providers/stt/iflytek_rtasr";

describe("iflytek rtasr", () => {
  it("signs url deterministically from fixed timestamp", async () => {
    const r = await signRtasrUrl({ appId: "app1", apiKey: "secret" }, 1700000000);
    expect(r.ts).toBe("1700000000");
    expect(r.url).toContain("appid=app1");
    expect(r.url).toContain("ts=1700000000");
    expect(r.url).toMatch(/signa=/);
  });

  it("parseRtasrFrame extracts final segment text", () => {
    const inner = {
      cn: { st: { type: "0", rt: [{ ws: [{ cw: [{ w: "hello" }] }, { cw: [{ w: " world" }] }] }] } },
    };
    const frame = JSON.stringify({ action: "result", data: JSON.stringify(inner) });
    expect(parseRtasrFrame(frame)).toEqual({ text: "hello world", final: true });
  });

  it("parseRtasrFrame returns partial when type != 0", () => {
    const inner = { cn: { st: { type: "1", rt: [{ ws: [{ cw: [{ w: "hi" }] }] }] } } };
    const frame = JSON.stringify({ action: "result", data: JSON.stringify(inner) });
    expect(parseRtasrFrame(frame)).toEqual({ text: "hi", final: false });
  });

  it("parseRtasrFrame ignores non-result frames", () => {
    expect(parseRtasrFrame(JSON.stringify({ action: "started" }))).toBeNull();
    expect(parseRtasrFrame("not-json")).toBeNull();
  });
});

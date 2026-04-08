import { describe, it, expect } from "vitest";
import { buildTtsFirstFrame, parseIflytekTtsFrame, signIflytekTtsUrl } from "../providers/tts/iflytek_tts";

describe("iflytek tts", () => {
  it("signs with fixed date", async () => {
    const r = await signIflytekTtsUrl(
      { appId: "a", apiKey: "k", apiSecret: "s" },
      "Fri, 01 Jan 2021 00:00:00 GMT",
    );
    expect(r.date).toBe("Fri, 01 Jan 2021 00:00:00 GMT");
    expect(r.url).toMatch(/^wss:\/\/tts-api\.xfyun\.cn\/v2\/tts\?/);
    expect(r.url).toContain("authorization=");
  });

  it("first frame encodes text in base64 data.text", () => {
    const raw = buildTtsFirstFrame({ appId: "app", apiKey: "k", apiSecret: "s" }, "hi");
    const j = JSON.parse(raw);
    expect(j.common.app_id).toBe("app");
    expect(j.business.vcn).toBe("xiaoyan");
    expect(j.data.status).toBe(2);
    expect(Buffer.from(j.data.text, "base64").toString("utf8")).toBe("hi");
  });

  it("parses audio frame", () => {
    const frame = JSON.stringify({ code: 0, data: { audio: Buffer.from([1, 2, 3]).toString("base64"), status: 1 } });
    const p = parseIflytekTtsFrame(frame)!;
    expect(Array.from(p.audio)).toEqual([1, 2, 3]);
    expect(p.done).toBe(false);
  });

  it("parses final frame", () => {
    const frame = JSON.stringify({ code: 0, data: { audio: "", status: 2 } });
    expect(parseIflytekTtsFrame(frame)!.done).toBe(true);
  });

  it("reports errors from non-zero code", () => {
    const frame = JSON.stringify({ code: 10001, message: "bad" });
    expect(parseIflytekTtsFrame(frame)!.error).toBe("bad");
  });
});

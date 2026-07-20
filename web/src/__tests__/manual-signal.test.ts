import { describe, expect, it } from "vitest";
import { decodeDirectBlob, directOfferUrl, encodeDirectBlob } from "../net/manual-signal";

describe("serverless pairing blobs", () => {
  it("round-trips an offer blob", () => {
    const blob = encodeDirectBlob({ v: 1, type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" });
    const back = decodeDirectBlob(blob);
    expect(back?.type).toBe("offer");
    expect(back?.sdp).toContain("v=0");
  });

  it("rejects garbage, wrong versions, and wrong types", () => {
    expect(decodeDirectBlob("not-a-blob")).toBeNull();
    expect(decodeDirectBlob(encodeDirectBlob({ v: 2 as never, type: "offer", sdp: "x" }))).toBeNull();
    expect(decodeDirectBlob(encodeDirectBlob({ v: 1, type: "nope" as never, sdp: "x" }))).toBeNull();
  });

  it("builds a guest URL that carries the offer in the hash", () => {
    const blob = encodeDirectBlob({ v: 1, type: "offer", sdp: "v=0" });
    const url = directOfferUrl(blob, "https://otoji.org");
    expect(url).toBe(`https://otoji.org/?direct#o=${blob}`);
  });
});

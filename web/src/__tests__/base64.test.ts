import { describe, it, expect } from "vitest";
import { base64ToBytes, bytesToBase64, stringToBase64, utf8ToBase64 } from "../lib/base64";

describe("base64", () => {
  it("round-trips bytes", () => {
    const b = new Uint8Array([0, 1, 2, 254, 255]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
  it("encodes utf8 strings", () => {
    expect(utf8ToBase64("hello")).toBe("aGVsbG8=");
    expect(stringToBase64("你好")).toBe("5L2g5aW9");
  });
});

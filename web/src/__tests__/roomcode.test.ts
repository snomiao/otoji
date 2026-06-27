import { describe, it, expect } from "vitest";
import { generateRoomCode, isRoomCode, joinUrl, ROOM_CODE_RE } from "../lib/roomcode";

describe("room codes (Google-Meet style)", () => {
  it("generates xxx-xxxx-xxx lowercase codes", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(ROOM_CODE_RE);
      expect(isRoomCode(c)).toBe(true);
    }
  });
  it("rejects non-conforming strings", () => {
    expect(isRoomCode("123456")).toBe(false);
    expect(isRoomCode("ab-cdef-ghi")).toBe(false); // first group too short
    expect(isRoomCode("ABC-defg-hij")).toBe(false); // uppercase
    expect(isRoomCode("kru-dfmq-atg")).toBe(true);
  });
  it("builds a path-style join URL", () => {
    expect(joinUrl("kru-dfmq-atg", "https://otoji.org")).toBe("https://otoji.org/kru-dfmq-atg");
  });
});

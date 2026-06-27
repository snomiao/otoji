import { describe, it, expect } from "vitest";
import { isReadableTranscript } from "../lib/text";

describe("isReadableTranscript", () => {
  it("keeps text with letters or numbers (any script)", () => {
    expect(isReadableTranscript("hello")).toBe(true);
    expect(isReadableTranscript("あね。")).toBe(true);
    expect(isReadableTranscript("电你")).toBe(true);
    expect(isReadableTranscript("The.")).toBe(true);
    expect(isReadableTranscript("123")).toBe(true);
  });
  it("drops punctuation / whitespace / empty", () => {
    expect(isReadableTranscript("。")).toBe(false);
    expect(isReadableTranscript(".")).toBe(false);
    expect(isReadableTranscript("  …, ")).toBe(false);
    expect(isReadableTranscript("")).toBe(false);
    expect(isReadableTranscript(undefined)).toBe(false);
  });
});

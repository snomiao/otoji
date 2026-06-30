import { describe, it, expect } from "vitest";
import { diffText, lineDiff } from "../lib/textdiff";

describe("textdiff", () => {
  it("first input (prev=null) renders as all additions", () => {
    expect(diffText(null, "hello\nworld")).toBe("+hello\n+world");
  });

  it("emits nothing when text is unchanged", () => {
    expect(diffText("hello\nworld", "hello\nworld")).toBe("");
  });

  it("gitdiff shows only changed lines, +/- prefixed", () => {
    expect(diffText("hello\nworld", "hello\nearth")).toBe("-world\n+earth");
  });

  it("handles pure additions and deletions", () => {
    expect(diffText("a", "a\nb")).toBe("+b");
    expect(diffText("a\nb", "a")).toBe("-b");
  });

  it("empty prev string behaves like a fresh stream", () => {
    expect(diffText("", "x")).toBe("+x");
  });

  it("jsonl style emits one JSON object per changed line", () => {
    expect(diffText("hello\nworld", "hello\nearth", "jsonl")).toBe(
      '{"op":"-","line":"world"}\n{"op":"+","line":"earth"}',
    );
  });

  it("lineDiff keeps unchanged lines as 'same'", () => {
    const ops = lineDiff("a\nb\nc", "a\nx\nc");
    expect(ops.map((o) => o.type)).toEqual(["same", "del", "add", "same"]);
  });
});

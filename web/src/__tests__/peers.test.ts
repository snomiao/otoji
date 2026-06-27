import { describe, it, expect } from "vitest";
import { shouldInitiate } from "../net/peers";

describe("shouldInitiate (perfect-negotiation tie-break)", () => {
  it("exactly one side of a pair initiates", () => {
    const a = "aaaa";
    const b = "bbbb";
    expect(shouldInitiate(a, b)).toBe(false);
    expect(shouldInitiate(b, a)).toBe(true);
    // symmetric: never both, never neither
    expect(shouldInitiate(a, b) !== shouldInitiate(b, a)).toBe(true);
  });

  it("never initiates to self", () => {
    expect(shouldInitiate("x", "x")).toBe(false);
  });
});

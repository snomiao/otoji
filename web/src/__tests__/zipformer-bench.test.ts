import { describe, expect, it } from "vitest";
import { pairCacheNames } from "../bench/zipformer-bench";

describe("pairCacheNames", () => {
  it("pairs ordered encoder cache inputs and outputs", () => {
    expect(pairCacheNames(["x", "cached_len", "cached_key"], ["encoder_out", "new_len", "new_key"])).toEqual([
      { input: "cached_len", output: "new_len" },
      { input: "cached_key", output: "new_key" },
    ]);
  });

  it("rejects models whose state counts do not match", () => {
    expect(() => pairCacheNames(["x", "cache"], ["encoder_out"])).toThrow("cache count mismatch");
  });
});

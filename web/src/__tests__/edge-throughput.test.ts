import { describe, expect, it } from "vitest";
import { computeRates, formatRate } from "../graph/edge-throughput";

describe("formatRate", () => {
  it("formats byte, kibibyte, and mebibyte rates compactly", () => {
    expect(formatRate(512)).toBe("512 B/s");
    expect(formatRate(12.4 * 1024)).toBe("12.4 kB/s");
    expect(formatRate(1.25 * 1024 * 1024)).toBe("1.3 MB/s");
  });
});

describe("computeRates", () => {
  it("computes rates from cumulative totals and elapsed time", () => {
    const previous = new Map([["a", 100], ["idle", 50]]);
    const current = new Map([["a", 1_100], ["idle", 50], ["new", 500]]);
    expect(computeRates(previous, current, 2_000)).toEqual({ a: 500, new: 250 });
  });

  it("omits idle or reset counters and rejects a non-positive interval", () => {
    expect(computeRates(new Map([["a", 100]]), new Map([["a", 20]]), 1_000)).toEqual({});
    expect(computeRates(new Map(), new Map([["a", 20]]), 0)).toEqual({});
  });
});

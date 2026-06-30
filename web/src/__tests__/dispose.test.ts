import { describe, it, expect } from "vitest";
import { disposeMemo } from "../providers/dispose-util";

describe("disposeMemo (model offload)", () => {
  it("clears the map and calls the first matching cleanup method", async () => {
    let unloaded = false;
    const map = new Map<string, Promise<any>>();
    map.set("a", Promise.resolve({ unload: async () => { unloaded = true; }, dispose: () => { throw new Error("should not be called"); } }));
    await disposeMemo(map, ["unload", "dispose"]);
    expect(map.size).toBe(0);
    expect(unloaded).toBe(true);
  });

  it("is a no-op on an empty map", async () => {
    const map = new Map<string, Promise<any>>();
    await disposeMemo(map, ["dispose"]);
    expect(map.size).toBe(0);
  });

  it("swallows cleanup errors and still clears", async () => {
    const map = new Map<string, Promise<any>>();
    map.set("a", Promise.resolve({ dispose: async () => { throw new Error("boom"); } }));
    await disposeMemo(map, ["dispose"]);
    expect(map.size).toBe(0);
  });

  it("drops instances that have no matching cleanup method", async () => {
    const map = new Map<string, Promise<any>>();
    map.set("a", Promise.resolve({ somethingElse: 1 }));
    await disposeMemo(map, ["dispose", "unload"]);
    expect(map.size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { ProviderRouter } from "../providers/router";

type P = { id: string; isAvailable(): boolean };
const mk = (id: string, ok: boolean): P => ({ id, isAvailable: () => ok });

describe("ProviderRouter", () => {
  it("prefers the named provider when available", () => {
    const r = new ProviderRouter<P>([mk("a", true), mk("b", true)], "b");
    expect(r.pick()?.id).toBe("b");
  });

  it("falls back to first available when preferred unavailable", () => {
    const r = new ProviderRouter<P>([mk("a", false), mk("b", true)], "a");
    expect(r.pick()?.id).toBe("b");
  });

  it("returns undefined when nothing available", () => {
    const r = new ProviderRouter<P>([mk("a", false)]);
    expect(r.pick()).toBeUndefined();
  });

  it("chain() lists preferred first then rest, skipping unavailable", () => {
    const r = new ProviderRouter<P>([mk("a", true), mk("b", false), mk("c", true)], "c");
    expect(r.chain().map((x) => x.id)).toEqual(["c", "a"]);
  });

  it("setPreferred updates selection", () => {
    const r = new ProviderRouter<P>([mk("a", true), mk("b", true)]);
    r.setPreferred("b");
    expect(r.pick()?.id).toBe("b");
  });
});

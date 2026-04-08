import { describe, it, expect } from "vitest";
import { KeyStore, MemoryStorage } from "../lib/keystore";

describe("KeyStore", () => {
  it("round-trips values with namespaced prefix", () => {
    const mem = new MemoryStorage();
    const ks = new KeyStore(mem);
    ks.set("OPENAI_API_KEY", "sk-test");
    expect(ks.get("OPENAI_API_KEY")).toBe("sk-test");
    expect(mem.getItem("otoji.keys.OPENAI_API_KEY")).toBe("sk-test");
  });

  it("getAll only returns set values", () => {
    const ks = new KeyStore(new MemoryStorage());
    ks.set("IFLYTEK_APP_ID", "app");
    ks.set("ANTHROPIC_MODEL", "claude-haiku-4-5");
    const all = ks.getAll();
    expect(all).toEqual({ IFLYTEK_APP_ID: "app", ANTHROPIC_MODEL: "claude-haiku-4-5" });
  });

  it("setAll skips empty strings and undefined", () => {
    const ks = new KeyStore(new MemoryStorage());
    ks.setAll({ OPENAI_API_KEY: "sk", ANTHROPIC_API_KEY: "", IFLYTEK_APP_ID: undefined });
    expect(ks.getAll()).toEqual({ OPENAI_API_KEY: "sk" });
  });

  it("remove clears a value", () => {
    const ks = new KeyStore(new MemoryStorage());
    ks.set("OPENAI_API_KEY", "sk");
    ks.remove("OPENAI_API_KEY");
    expect(ks.get("OPENAI_API_KEY")).toBeUndefined();
  });
});

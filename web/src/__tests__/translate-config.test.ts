import { describe, expect, it } from "vitest";
import { langNameToCode } from "../providers/translate/translate-config";

describe("langNameToCode", () => {
  it("maps language names to codes", () => {
    expect(langNameToCode("Japanese")).toBe("ja");
    expect(langNameToCode("Chinese")).toBe("zh");
  });

  it("passes BCP-47 codes through (graph configs store either form)", () => {
    expect(langNameToCode("ja")).toBe("ja");
    expect(langNameToCode("zh-TW")).toBe("zh-TW");
    expect(langNameToCode("yue")).toBe("yue");
  });

  it("rejects junk", () => {
    expect(langNameToCode("Klingon-ish long value")).toBeNull();
    expect(langNameToCode("J")).toBeNull();
    expect(langNameToCode("")).toBeNull();
  });
});

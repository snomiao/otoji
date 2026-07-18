import { describe, expect, it } from "vitest";
import { exactEnumOption } from "../ui/EnumOmnibox";

const options = [
  { value: "browser", label: "Browser" },
  { value: "llama.cpp", label: "llama.cpp" },
];

describe("exactEnumOption", () => {
  it("accepts a case-insensitive enum value or label", () => {
    expect(exactEnumOption(options, " BROWSER ")?.value).toBe("browser");
    expect(exactEnumOption(options, "llama.cpp")?.value).toBe("llama.cpp");
  });

  it("rejects malformed free-form values", () => {
    expect(exactEnumOption(options, "banana-runtime")).toBeUndefined();
    expect(exactEnumOption(options, "")).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { langToTtsModel } from "../providers/tts/tts-config";

describe("langToTtsModel", () => {
  it("maps language codes (incl. region suffix) to MMS model ids", () => {
    expect(langToTtsModel("en")).toBe("Xenova/mms-tts-eng");
    expect(langToTtsModel("es")).toBe("Xenova/mms-tts-spa");
    expect(langToTtsModel("FR")).toBe("Xenova/mms-tts-fra"); // case-insensitive
    expect(langToTtsModel("pt-BR")).toBe("Xenova/mms-tts-por"); // region stripped
  });
  it("returns undefined for languages with no on-device voice", () => {
    expect(langToTtsModel("ja")).toBeUndefined();
    expect(langToTtsModel("zz")).toBeUndefined();
  });
});

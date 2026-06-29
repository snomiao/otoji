import { describe, it, expect } from "vitest";
import { langToTtsModel, voiceMatchesLang } from "../providers/tts/tts-config";

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

describe("voiceMatchesLang (browser SpeechSynthesis auto voice)", () => {
  it("matches on the primary subtag, case/underscore-insensitive", () => {
    expect(voiceMatchesLang("ja-JP", "ja")).toBe(true);
    expect(voiceMatchesLang("zh-CN", "zh")).toBe(true);
    expect(voiceMatchesLang("ko_KR", "ko")).toBe(true);
    expect(voiceMatchesLang("en-US", "en")).toBe(true);
    expect(voiceMatchesLang("en-GB", "fr")).toBe(false);
  });
  it("maps SenseVoice 'yue' (Cantonese) to a zh voice", () => {
    expect(voiceMatchesLang("zh-HK", "yue")).toBe(true);
    expect(voiceMatchesLang("zh-CN", "yue")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { extractWakeCommand, parseWakeWords } from "../graph/runtime";

const WAKE = parseWakeWords("hey otoji, ok otoji, otoji");

describe("wake-word gate", () => {
  it("returns the command after the wake phrase, casing preserved", () => {
    expect(extractWakeCommand("Hey otoji, what's the weather in Tokyo?", WAKE)).toBe("what's the weather in Tokyo?");
    expect(extractWakeCommand("ok otoji turn on the lights", WAKE)).toBe("turn on the lights");
    expect(extractWakeCommand("Otoji play some music", WAKE)).toBe("play some music");
  });

  it("drops utterances without a wake word", () => {
    expect(extractWakeCommand("what's the weather", WAKE)).toBe("");
    expect(extractWakeCommand("I was talking to a friend", WAKE)).toBe("");
  });

  it("a bare wake word yields no command", () => {
    expect(extractWakeCommand("hey otoji", WAKE)).toBe("");
    expect(extractWakeCommand("otoji.", WAKE)).toBe("");
  });

  it("ignores a wake word buried deep in a sentence", () => {
    expect(extractWakeCommand("so anyway I told him about otoji yesterday", WAKE)).toBe("");
  });

  it("parseWakeWords normalizes and defaults", () => {
    expect(parseWakeWords("Hey Otoji,  OK Otoji ")).toEqual(["hey otoji", "ok otoji"]);
    expect(parseWakeWords(undefined)).toContain("otoji");
  });
});

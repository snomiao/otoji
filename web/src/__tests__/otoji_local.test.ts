import { describe, it, expect } from "vitest";
import { parseAsrEvent, OtojiLocalSttProvider, DEFAULT_OTOJI_LOCAL_URL } from "../providers/stt/otoji_local";

describe("otoji local sensevoice", () => {
  it("maps partial events to non-final segments", () => {
    expect(parseAsrEvent(JSON.stringify({ type: "partial", seg_id: 1, text: "hel" })))
      .toEqual({ text: "hel", final: false });
    expect(parseAsrEvent(JSON.stringify({ type: "ptt_partial", text: "wor" })))
      .toEqual({ text: "wor", final: false });
  });

  it("maps final/ptt_final/upgrade/translated events to final segments", () => {
    expect(parseAsrEvent(JSON.stringify({ type: "final", seg_id: 1, text: "hello", words: [] })))
      .toEqual({ text: "hello", final: true });
    expect(parseAsrEvent(JSON.stringify({ type: "ptt_final", text: "hello world" })))
      .toEqual({ text: "hello world", final: true });
    expect(parseAsrEvent(JSON.stringify({ type: "ptt_upgrade", text: "Hello, world." })))
      .toEqual({ text: "Hello, world.", final: true });
    expect(parseAsrEvent(JSON.stringify({ type: "ptt_translated", text: "こんにちは", lang: "ja" })))
      .toEqual({ text: "こんにちは", final: true });
  });

  it("returns null for non-transcript events", () => {
    expect(parseAsrEvent(JSON.stringify({ type: "open" }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ type: "closed" }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ type: "status", message: "loading" }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ type: "error", message: "boom" }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ type: "language_detected", lang: "ja" }))).toBeNull();
  });

  it("ignores malformed frames", () => {
    expect(parseAsrEvent("not-json")).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ noType: true }))).toBeNull();
    expect(parseAsrEvent(JSON.stringify({ type: "final" }))).toBeNull(); // missing text
  });

  it("is always available (no API keys) and defaults to local loopback", () => {
    const p = new OtojiLocalSttProvider();
    expect(p.isAvailable()).toBe(true);
    expect(p.id).toBe("otoji_local");
    expect(DEFAULT_OTOJI_LOCAL_URL).toBe("ws://127.0.0.1:8080/");
  });
});

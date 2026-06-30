import { describe, it, expect } from "vitest";
import {
  normalizeTracker,
  dedupeTrackers,
  urlTrackers,
  extraTrackers,
  appendTrackers,
} from "../lib/trackers";
import { DEFAULT_SIGNAL_BASE } from "../net/signaling";

describe("trackers", () => {
  it("normalizes trailing slashes and whitespace", () => {
    expect(normalizeTracker("  wss://x.org/signal/  ")).toBe("wss://x.org/signal");
    expect(normalizeTracker("ws://localhost:8787/signal")).toBe("ws://localhost:8787/signal");
  });

  it("de-dupes while preserving order and dropping blanks", () => {
    expect(dedupeTrackers(["a", "", "b", "a/", " a ", "c"])).toEqual(["a", "b", "c"]);
  });

  it("parses magnet-style ?tr= params (repeatable)", () => {
    expect(urlTrackers("?tr=ws://a/signal&tr=ws://b/signal")).toEqual(["ws://a/signal", "ws://b/signal"]);
    expect(urlTrackers("?room=x")).toEqual([]);
  });

  it("extraTrackers excludes the recipient's env defaults", () => {
    // The build-time default is implied for every recipient, so it never needs
    // to ride along in a share link; a custom tracker does.
    expect(extraTrackers([DEFAULT_SIGNAL_BASE])).toEqual([]);
    expect(extraTrackers([DEFAULT_SIGNAL_BASE, "ws://friend/signal"])).toEqual(["ws://friend/signal"]);
  });

  it("appendTrackers adds tr= only for non-default trackers", () => {
    expect(appendTrackers("https://otoji.org/room-x", [DEFAULT_SIGNAL_BASE])).toBe("https://otoji.org/room-x");
    expect(appendTrackers("https://otoji.org/room-x", [DEFAULT_SIGNAL_BASE, "ws://friend/signal"])).toBe(
      "https://otoji.org/room-x?tr=ws%3A%2F%2Ffriend%2Fsignal",
    );
  });
});

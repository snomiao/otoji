import { describe, it, expect } from "vitest";
import {
  parseTracker,
  normalizeTracker,
  toSocketUrl,
  isPrivateHost,
  dedupeTrackers,
  capTrackers,
  urlTrackers,
  extraTrackers,
  appendTrackers,
  envTrackers,
  MAX_TRACKERS,
} from "../lib/trackers";

describe("trackers", () => {
  it("canonicalizes ws/wss/http/https to http(s), stripping slash/query/hash", () => {
    expect(parseTracker("  wss://x.org/signal/  ").url).toBe("https://x.org/signal");
    expect(parseTracker("ws://localhost:8787/signal").url).toBe("http://localhost:8787/signal");
    expect(parseTracker("https://x.org/signal").url).toBe("https://x.org/signal");
    expect(parseTracker("https://x.org/signal/?a=1#z").url).toBe("https://x.org/signal");
  });

  it("errors on non-signaling schemes and junk", () => {
    expect(parseTracker("javascript:alert(1)").error).toMatch(/unsupported scheme/);
    expect(parseTracker("ftp://x.org").error).toMatch(/unsupported scheme/);
    expect(parseTracker("not a url").error).toBe("not a valid URL");
    expect(parseTracker("").error).toBe("empty");
    expect(normalizeTracker("javascript:alert(1)")).toBe("");
  });

  it("converts canonical http(s) back to ws(s) for the socket", () => {
    expect(toSocketUrl("https://x.org/signal")).toBe("wss://x.org/signal");
    expect(toSocketUrl("http://localhost:8787/signal")).toBe("ws://localhost:8787/signal");
  });

  it("flags loopback/private/LAN hosts", () => {
    expect(isPrivateHost("http://localhost:8787/signal")).toBe(true);
    expect(isPrivateHost("https://127.0.0.1/signal")).toBe(true);
    expect(isPrivateHost("https://192.168.1.5/signal")).toBe(true);
    expect(isPrivateHost("https://10.0.0.1/signal")).toBe(true);
    expect(isPrivateHost("https://172.16.0.1/signal")).toBe(true);
    expect(isPrivateHost("https://otoji.org/signal")).toBe(false);
  });

  it("de-dupes by canonical form and caps the count", () => {
    expect(dedupeTrackers(["wss://a/x", "https://a/x/", "ws://b/x", ""])).toEqual([
      "https://a/x",
      "http://b/x",
    ]);
    const many = Array.from({ length: 20 }, (_, i) => `https://h${i}/signal`);
    expect(capTrackers(many)).toHaveLength(MAX_TRACKERS);
  });

  it("parses magnet-style ?tr= params (canonicalized)", () => {
    expect(urlTrackers("?tr=wss://a/signal&tr=ws://b/signal")).toEqual([
      "https://a/signal",
      "http://b/signal",
    ]);
    expect(urlTrackers("?room=x")).toEqual([]);
  });

  it("appendTrackers carries only non-default (extra) trackers, canonicalized", () => {
    // Env defaults are implied for the recipient, so a link never needs to carry
    // them; a custom tracker rides along as ?tr=. Use envTrackers() as the
    // baseline so the test is independent of the ambient build env.
    const base = envTrackers();
    const friend = "wss://friend.example/signal";
    const friendCanon = "https://friend.example/signal";
    expect(extraTrackers([...base, friend])).toEqual([friendCanon]);
    expect(appendTrackers("https://otoji.org/room-x", base)).toBe("https://otoji.org/room-x");
    expect(appendTrackers("https://otoji.org/room-x", [...base, friend])).toBe(
      "https://otoji.org/room-x?tr=" + encodeURIComponent(friendCanon),
    );
  });
});

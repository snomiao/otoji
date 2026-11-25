import { expect, test } from "bun:test";
import {
  AUDIO_LIMITS,
  collectNativeMember,
  nativeWordIndex,
  parseNativeManifest,
  validateArchiveMembers,
} from "../src/index";

const fixture = () => ({
  version: 1,
  scope: "account-private",
  chapters: [
    {
      id: "chapter-1",
      inboxItemId: "a".repeat(20),
      memberPath: "audio/chapter.mp3",
      sha256: "b".repeat(64),
      archiveSha256: "c".repeat(64),
      bytes: 4,
      durationMs: 10000,
    },
  ],
  entries: [
    {
      listId: "list-1",
      key: "stable-1",
      term: "work out",
      chapterId: "chapter-1",
      startMs: 1000,
      endMs: 2000,
      confidence: 0.9,
      reason: "headword-estimate",
      estimated: true,
      verified: false,
    },
  ],
  unavailable: [{ listId: "list-1", key: "stable-2", reason: "ambiguous" }],
});

test("machine-aligned private manifest preserves exact card identity and strips audit fields", () => {
  const raw = { ...fixture(), secretAudit: "not-for-runtime" };
  const parsed = parseNativeManifest(JSON.stringify(raw));
  expect(parsed.entries[0].verified).toBe(false);
  expect(parsed).not.toHaveProperty("secretAudit");
  const find = nativeWordIndex(parsed);
  expect(find("list-1", "work out", "stable-1")?.chapter.id).toBe("chapter-1");
  expect(find("other-list", "work out")).toBeUndefined();
  expect(find("list-1", "Work out")).toBeUndefined();
  expect(find("list-1", "work out", "renamed-key")).toBeUndefined();
});
test("invalid intervals, spoofed verification and ambiguous bindings are refused", () => {
  for (const patch of [
    { startMs: -1 },
    { endMs: 10001 },
    { endMs: 1000 },
    { confidence: 2 },
    { chapterId: "missing" },
    { verified: true },
    { estimated: false },
    { term: "" },
  ]) {
    const value = fixture();
    Object.assign(value.entries[0], patch);
    expect(() => parseNativeManifest(JSON.stringify(value))).toThrow();
  }
  const duplicate = fixture();
  duplicate.entries.push({ ...duplicate.entries[0], key: "other" });
  expect(() => parseNativeManifest(JSON.stringify(duplicate))).toThrow();
});
test("locations, malformed hashes, archive entry counts and resource bombs are refused", () => {
  for (const path of [
    "../audio/a.mp3",
    "/audio/a.mp3",
    "audio/../a.mp3",
    "audio/%2e%2e/a.mp3",
    "https://host/a.mp3",
    "audio\\a.mp3",
  ]) {
    const value = fixture();
    value.chapters[0].memberPath = path;
    expect(() => parseNativeManifest(JSON.stringify(value))).toThrow();
  }
  const bad = fixture();
  bad.chapters[0].bytes = AUDIO_LIMITS.memberBytes + 1;
  expect(() => parseNativeManifest(JSON.stringify(bad))).toThrow();
  bad.chapters[0].bytes = 4;
  bad.chapters[0].sha256 = "invalid";
  expect(() => parseNativeManifest(JSON.stringify(bad))).toThrow();
  expect(() =>
    validateArchiveMembers(["audio/", "audio/chapter.mp3"], "audio/chapter.mp3"),
  ).not.toThrow();
  expect(() =>
    validateArchiveMembers(["../escape", "audio/chapter.mp3"], "audio/chapter.mp3"),
  ).toThrow();
  expect(() =>
    validateArchiveMembers(Array(5001).fill("audio/chapter.mp3"), "audio/chapter.mp3"),
  ).toThrow();
  expect(() => validateArchiveMembers([], "audio/chapter.mp3")).toThrow();
});
test("streamed member collection counts actual output and cancels an overflowing producer", async () => {
  let ended = false;
  async function* chunks() {
    try {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3, 4, 5]);
    } finally {
      ended = true;
    }
  }
  await expect(collectNativeMember(chunks(), 4, 10)).rejects.toThrow("native-audio-size");
  expect(ended).toBe(true);
  async function* good() {
    yield new Uint8Array([1, 2]);
    yield new Uint8Array([3, 4]);
  }
  expect([...(await collectNativeMember(good(), 4, 10))]).toEqual([1, 2, 3, 4]);
  await expect(collectNativeMember(good(), 5, 10)).rejects.toThrow();
  const abort = new AbortController();
  abort.abort();
  await expect(collectNativeMember(good(), 4, 10, abort.signal)).rejects.toThrow();
});

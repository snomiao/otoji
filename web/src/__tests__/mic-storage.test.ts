import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMicConfig, normalizeMicConfig } from "../../mic/config";
import { createMicOwnership, MIC_OWNERSHIP_KEY, type MicOwnership } from "../../mic/ownership";
import {
  createGmStorage,
  createMicConfigStore,
  MIC_CONFIG_KEY,
  type MicStorage,
  type StorageChangeListener,
} from "../../mic/storage";

function sharedStorage() {
  const values = new Map<string, unknown>();
  const callbacks = new Map<string, Set<{ tab: string; callback: StorageChangeListener }>>();
  const tab = (id: string): MicStorage => ({
    async get(key) {
      return structuredClone(values.get(key));
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
      for (const entry of callbacks.get(key) ?? [])
        entry.callback(structuredClone(value), entry.tab !== id);
    },
    async listen(key, callback) {
      const entries = callbacks.get(key) ?? new Set();
      const entry = { tab: id, callback };
      entries.add(entry);
      callbacks.set(key, entries);
      return () => {
        entries.delete(entry);
      };
    },
  });
  return { tab, values };
}

const owners: MicOwnership[] = [];
function owner(storage: MicStorage, tabId: string): MicOwnership {
  const result = createMicOwnership(storage, {
    tabId,
    leaseMs: 1000,
    heartbeatMs: 200,
    settleMs: 50,
  });
  owners.push(result);
  return result;
}

afterEach(() => {
  for (const item of owners.splice(0)) item.dispose();
  vi.useRealTimers();
});

describe("private microphone configuration", () => {
  it("defaults to device recognition without remote audio or context consent", () => {
    const config = defaultMicConfig();
    expect(config.recognition.mode).toBe("device");
    expect(config.recognition.remoteAudioConsent).toBe(false);
    expect(config.polish.enabled).toBe(false);
    expect(config.polish.useSiteContext).toBe(false);
    expect(config.voiceprint.enabled).toBe(false);
    expect(config.sites).toEqual({});
  });

  it("validates malformed storage and strips unknown fields and unsafe URLs", () => {
    const config = normalizeMicConfig({
      recognition: {
        mode: "cloud",
        serverUrl: "https://user:secret@example.com",
        signalingUrl: "javascript:alert(1)",
        remoteAudioConsent: "yes",
      },
      voiceprint: {
        threshold: Infinity,
        profiles: [{ id: "profile", embedding: [1, 2], sampleCount: -1 }, null],
      },
      polish: { enabled: "yes", provider: "unknown", apiKey: "private", pageAccess: true },
      widget: { x: NaN, y: -2, mode: "command" },
      sites: {
        "https://example.com": { contextEnabled: true },
        "https://example.com/path": { contextEnabled: true },
      },
      secret: "remove",
    });
    expect(config.recognition).toMatchObject({
      mode: "device",
      serverUrl: "",
      signalingUrl: "",
      remoteAudioConsent: false,
    });
    expect(config.voiceprint.profiles).toEqual([
      { id: "profile", label: "", createdAt: 0, sampleCount: 0 },
    ]);
    expect(config.widget).toEqual({ x: 24, y: 24, mode: "dictation", enabled: false });
    expect(config.sites).toEqual({ "https://example.com": { contextEnabled: true } });
    expect(config.polish).toMatchObject({
      enabled: false,
      accountToken: "",
    });
    expect(config).not.toHaveProperty("secret");
    expect(normalizeMicConfig(null)).toEqual(defaultMicConfig());
    expect(normalizeMicConfig({ version: 999, polish: { enabled: true } })).toEqual(
      defaultMicConfig(),
    );
  });

  it("drops old provider keys and requires renewed consent for account billing", () => {
    const migrated = normalizeMicConfig({
      polish: { enabled: true, provider: "gemini", apiKey: "legacy-secret", model: "old-model" },
    });
    expect(migrated.polish).toEqual({ enabled: false, accountToken: "", useSiteContext: false });
    expect(JSON.stringify(migrated)).not.toContain("legacy-secret");
  });

  it("accepts secure remote endpoints and local development endpoints", () => {
    expect(
      normalizeMicConfig({
        recognition: {
          serverUrl: "http://127.0.0.1:9000",
          signalingUrl: "wss://example.com/signal",
        },
      }).recognition,
    ).toMatchObject({
      serverUrl: "http://127.0.0.1:9000/",
      signalingUrl: "wss://example.com/signal",
    });
    expect(
      normalizeMicConfig({ recognition: { serverUrl: "http://example.com" } }).recognition
        .serverUrl,
    ).toBe("");
    expect(
      normalizeMicConfig({ recognition: { serverUrl: "wss://example.com/stt" } }).recognition
        .serverUrl,
    ).toBe("wss://example.com/stt");
    expect(
      normalizeMicConfig({ recognition: { serverUrl: "ws://localhost:9000/stt" } }).recognition
        .serverUrl,
    ).toBe("ws://localhost:9000/stt");
    expect(
      normalizeMicConfig({ recognition: { serverUrl: "ws://example.com/stt" } }).recognition
        .serverUrl,
    ).toBe("");
  });

  it("persists private fields and synchronizes settings changes across tabs", async () => {
    const shared = sharedStorage();
    const first = createMicConfigStore(shared.tab("first"));
    const second = createMicConfigStore(shared.tab("second"));
    const changed = vi.fn();
    second.subscribe(changed);
    await first.update({
      polish: { accountToken: "private-key" },
      widget: { x: 130, y: 240, enabled: true },
    });
    await first.update({ recognition: { language: "ja-JP" } });
    expect(await second.load()).toMatchObject({
      polish: { accountToken: "private-key", enabled: false },
      widget: { x: 130, y: 240, enabled: true },
      recognition: { language: "ja-JP", mode: "device" },
    });
    expect(changed).toHaveBeenCalled();
    expect(shared.values.has(MIC_CONFIG_KEY)).toBe(true);
    second.dispose();
    changed.mockClear();
    await first.update({ widget: { x: 150 } });
    expect(changed).not.toHaveBeenCalled();
    first.dispose();
  });

  it("supports modern asynchronous and legacy synchronous GM adapters", async () => {
    for (const modern of [true, false]) {
      const values = new Map<string, unknown>();
      const remove = vi.fn();
      let callback:
        | ((name: string, old: unknown, next: unknown, remote: boolean) => void)
        | undefined;
      const methods = {
        getValue: (key: string) => (modern ? Promise.resolve(values.get(key)) : values.get(key)),
        setValue: (key: string, value: unknown) => {
          values.set(key, value);
        },
        addValueChangeListener: (_key: string, listener: NonNullable<typeof callback>) => {
          callback = listener;
          return 4;
        },
        removeValueChangeListener: remove,
      };
      const api = modern
        ? methods
        : {
            GM_getValue: methods.getValue,
            GM_setValue: methods.setValue,
            GM_addValueChangeListener: methods.addValueChangeListener,
            GM_removeValueChangeListener: remove,
          };
      const storage = createGmStorage(api);
      await storage.set("private", "key");
      expect(await storage.get("private")).toBe("key");
      const listener = vi.fn();
      const stop = await storage.listen("private", listener);
      callback?.("private", null, "new", true);
      expect(listener).toHaveBeenCalledWith("new", true);
      stop();
      callback?.("private", null, "later", true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(4);
    }
  });
});

describe("cross-tab microphone ownership", () => {
  it("settles simultaneous claims to one deterministic winner before capture", async () => {
    vi.useFakeTimers();
    const shared = sharedStorage();
    const first = owner(shared.tab("a"), "a");
    const second = owner(shared.tab("b"), "b");
    const pending = [first.acquire(), second.acquire()];
    expect(first.isOwner()).toBe(false);
    expect(second.isOwner()).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(await Promise.all(pending)).toEqual([true, false]);
    expect([first.isOwner(), second.isOwner()]).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(2200);
    expect(first.isOwner()).toBe(true);
    expect(await second.acquire()).toBe(false);
  });

  it("revokes synchronously on a remote overwrite and permits acquisition after release", async () => {
    vi.useFakeTimers();
    const shared = sharedStorage();
    const first = owner(shared.tab("a"), "a");
    const second = owner(shared.tab("b"), "b");
    const listener = vi.fn();
    first.listen(listener);
    const acquire = first.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await acquire).toBe(true);
    await shared.tab("b").set(MIC_OWNERSHIP_KEY, null);
    expect(first.isOwner()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith({ owned: false, reason: "remote" });
    const next = second.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await next).toBe(true);
    await first.release();
    expect(second.isOwner()).toBe(true);
    await second.release();
    expect(second.isOwner()).toBe(false);
    expect(shared.values.get(MIC_OWNERSHIP_KEY)).toBe(null);
  });

  it("recovers stale or malformed ownership without preempting a live lease", async () => {
    vi.useFakeTimers();
    const shared = sharedStorage();
    const storage = shared.tab("new");
    await storage.set(MIC_OWNERSHIP_KEY, {
      ownerId: "old",
      claimId: "stale",
      startedAt: Date.now() - 3000,
      expiresAt: Date.now() - 1,
      phase: "held",
    });
    const first = owner(storage, "new");
    const pending = first.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toBe(true);
    first.dispose();
    await vi.advanceTimersByTimeAsync(1001);
    const next = owner(shared.tab("next"), "next");
    const acquired = next.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await acquired).toBe(true);
    await next.release();
    await storage.set(MIC_OWNERSHIP_KEY, { ownerId: "malformed", expiresAt: Infinity });
    const final = owner(shared.tab("final"), "final");
    const last = final.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await last).toBe(true);
  });

  it("cancels an in-flight claim when released and fails closed on storage errors", async () => {
    vi.useFakeTimers();
    const shared = sharedStorage();
    const first = owner(shared.tab("a"), "a");
    const pending = first.acquire();
    await vi.advanceTimersByTimeAsync(1);
    await first.release();
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toBe(false);
    expect(first.isOwner()).toBe(false);
    const broken = owner(
      {
        async get() {
          throw new Error("unavailable");
        },
        async set() {
          throw new Error("unavailable");
        },
        async listen() {
          return () => {};
        },
      },
      "broken",
    );
    expect(await broken.acquire()).toBe(false);
  });

  it.each(["get", "set"])("expires ownership even when a heartbeat %s hangs", async (operation) => {
    vi.useFakeTimers();
    const shared = sharedStorage();
    const storage = shared.tab("a");
    let hang = false;
    const first = owner(
      {
        ...storage,
        get: (key) => (hang && operation === "get" ? new Promise(() => {}) : storage.get(key)),
        set: (key, value) =>
          hang && operation === "set" ? new Promise(() => {}) : storage.set(key, value),
      },
      "a",
    );
    const listener = vi.fn();
    first.listen(listener);
    const pending = first.acquire();
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toBe(true);
    hang = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(first.isOwner()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith({ owned: false, reason: "expired" });
  });
});

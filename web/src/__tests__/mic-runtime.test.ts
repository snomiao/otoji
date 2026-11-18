import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMicConfig, patchMicConfig, type MicConfig } from "../../mic/config";
import type { MicConfigStore } from "../../mic/storage";
import type { MicOwnership, OwnershipState } from "../../mic/ownership";
import type { MicRawOptions, MicVadHandle } from "../lib/mic-vad";

import { mountMicWidget, type MicRuntimeDeps } from "../../mic/runtime";
import { MicPolishError } from "../../mic/polish";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const runtimes: Awaited<ReturnType<typeof mountMicWidget>>[] = [];

function harness(config: MicConfig = defaultMicConfig()) {
  let saved = structuredClone(config);
  const subscribers = new Set<(next: MicConfig) => void>();
  const store: MicConfigStore = {
    load: vi.fn(async () => structuredClone(saved)),
    save: vi.fn(async (value) => {
      saved = structuredClone(value);
      for (const subscriber of subscribers) subscriber(structuredClone(saved));
      return structuredClone(saved);
    }),
    update: vi.fn(async (patch) => {
      saved = patchMicConfig(saved, patch);
      for (const subscriber of subscribers) subscriber(structuredClone(saved));
      return structuredClone(saved);
    }),
    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    dispose: vi.fn(),
  };
  let owned = false;
  const listeners = new Set<(state: OwnershipState) => void>();
  const ownership: MicOwnership = {
    acquire: vi.fn(async () => {
      owned = true;
      return true;
    }),
    release: vi.fn(async () => {
      owned = false;
    }),
    isOwner: () => owned,
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: vi.fn(),
  };
  const revoke = () => {
    owned = false;
    for (const listener of listeners) listener({ owned: false, reason: "remote" });
  };
  const stopped = vi.fn(async () => {});
  let captureOptions: MicRawOptions | undefined;
  const capture = vi.fn(async (options: MicRawOptions): Promise<MicVadHandle> => {
    captureOptions = options;
    return { stop: stopped };
  });
  const warm = vi.fn(async () => undefined);
  const recognize = vi.fn(async () => ({ text: "hello" }));
  const polish = vi.fn(async (text: string) => text);
  const deps: MicRuntimeDeps = { capture, localWarm: warm, localRecognize: recognize, polish };
  const field = document.createElement("textarea");
  field.value = "seed ";
  document.body.append(field);
  field.focus();
  field.setSelectionRange(5, 5);
  const mount = async () => {
    const runtime = await mountMicWidget(store, ownership, deps);
    runtimes.push(runtime);
    return runtime;
  };
  const utterance = () => {
    if (!captureOptions) throw new Error("No capture started");
    for (let i = 0; i < 8; i++) captureOptions.onFrame(new Float32Array(512).fill(0.1), i * 32);
    for (let i = 0; i < 23; i++) captureOptions.onFrame(new Float32Array(512), (i + 8) * 32);
  };
  return {
    store,
    ownership,
    revoke,
    stopped,
    capture,
    warm,
    recognize,
    polish,
    deps,
    field,
    mount,
    utterance,
    get listenerCount() {
      return listeners.size + subscribers.size;
    },
  };
}

const socket = vi.fn(() => {
  throw new Error("Real network access is disabled in this test");
});
beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  vi.stubGlobal("WebSocket", socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real fetch is disabled in this test");
    }),
  );
});
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await runtime.stop();
    runtime.destroy();
  }
  await flush();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("mic widget lifecycle", () => {
  it("mounts without starting media and starts only after an explicit user action", async () => {
    const h = harness();
    const runtime = await h.mount();
    await flush();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.ownership.acquire).not.toHaveBeenCalled();
    await runtime.start();
    expect(h.ownership.acquire).toHaveBeenCalledOnce();
    expect(h.capture).toHaveBeenCalledOnce();
    expect(h.warm).toHaveBeenCalledOnce();
    await runtime.stop();
    expect(h.stopped).toHaveBeenCalledOnce();
  });

  it("does not resume media from saved enabled intent or later storage notifications", async () => {
    const config = defaultMicConfig();
    config.widget.enabled = true;
    const h = harness(config);
    await h.mount();
    await h.store.update({ widget: { enabled: true, x: 40 } });
    await flush();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.warm).not.toHaveBeenCalled();
    expect(h.ownership.acquire).not.toHaveBeenCalled();
  });

  it("does not warm models or open capture when another tab holds ownership", async () => {
    const h = harness();
    vi.mocked(h.ownership.acquire).mockResolvedValue(false);
    const runtime = await h.mount();
    await runtime.start();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.warm).not.toHaveBeenCalled();
  });

  it.each(["webrtc", "server"] as const)(
    "requires explicit remote audio consent for %s",
    async (mode) => {
      const config = defaultMicConfig();
      config.recognition.mode = mode;
      config.recognition.remoteAudioConsent = false;
      const h = harness(config);
      const runtime = await h.mount();
      await runtime.start();
      expect(h.capture).not.toHaveBeenCalled();
      expect(h.ownership.acquire).not.toHaveBeenCalled();
      expect(socket).not.toHaveBeenCalled();
    },
  );

  it("stopping during model preparation prevents delayed capture", async () => {
    const h = harness();
    const ready = deferred<undefined>();
    h.warm.mockReturnValue(ready.promise);
    const runtime = await h.mount();
    const starting = runtime.start();
    await flush();
    expect(h.warm).toHaveBeenCalledOnce();
    await runtime.stop();
    ready.resolve(undefined);
    await starting;
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.ownership.release).toHaveBeenCalled();
  });

  it("stops the eventual capture handle when stopped during permission acquisition", async () => {
    const h = harness();
    const handle = deferred<MicVadHandle>();
    h.capture.mockReturnValue(handle.promise);
    const runtime = await h.mount();
    const starting = runtime.start();
    await flush();
    expect(h.capture).toHaveBeenCalledOnce();
    await runtime.stop();
    handle.resolve({ stop: h.stopped });
    await starting;
    expect(h.stopped).toHaveBeenCalledOnce();
  });

  it("inserts a finished local utterance into the captured editor without submitting", async () => {
    const h = harness();
    const input = vi.fn();
    const form = document.createElement("form");
    form.append(h.field);
    document.body.append(form);
    h.field.focus();
    h.field.addEventListener("input", input);
    const submit = vi.fn();
    form.addEventListener("submit", submit);
    const runtime = await h.mount();
    await runtime.start();
    h.utterance();
    await flush();
    expect(h.recognize).toHaveBeenCalledOnce();
    expect(h.field.value).toBe("seed hello");
    expect(input).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("ownership loss stops media and discards an in-flight transcription", async () => {
    const h = harness();
    const result = deferred<{ text: string }>();
    h.recognize.mockReturnValue(result.promise);
    const runtime = await h.mount();
    await runtime.start();
    h.utterance();
    await flush();
    expect(h.recognize).toHaveBeenCalledOnce();
    h.revoke();
    expect(h.stopped).toHaveBeenCalledOnce();
    result.resolve({ text: "must not insert" });
    await flush();
    expect(h.field.value).toBe("seed ");
    expect(document.querySelector("[data-otoji-interim]")).toBeNull();
  });

  it.each(["credits", "daily-limit"] as const)(
    "keeps the raw transcript on %s refusal without retrying paid AI",
    async (code) => {
      const config = defaultMicConfig();
      config.polish.enabled = true;
      const h = harness(config);
      h.polish.mockRejectedValue(new MicPolishError(code));
      const runtime = await h.mount();
      await runtime.start();
      h.utterance();
      await flush();
      expect(h.field.value).toBe("seed hello");
      expect(h.polish).toHaveBeenCalledOnce();
    },
  );

  it("shows when a successful polishing charge uses estimated usage", async () => {
    const config = defaultMicConfig();
    config.polish.enabled = true;
    const h = harness(config);
    h.deps.polish = async (_text, _config, _context, _signal, onBilling) => {
      onBilling?.({ basis: "estimated", charged: 1, daily: { used: 1, max: 300 } });
      return "clean";
    };
    const attach = Element.prototype.attachShadow;
    let root!: ShadowRoot;
    const spy = vi
      .spyOn(Element.prototype, "attachShadow")
      .mockImplementationOnce(function (this: Element, options) {
        root = attach.call(this, options);
        return root;
      });
    const runtime = await h.mount();
    spy.mockRestore();
    await runtime.start();
    h.utterance();
    await flush();
    expect(h.field.value).toBe("seed clean");
    expect(root.textContent).toContain("Billing was estimated from text length.");
  });

  it("ownership loss aborts pending polishing and ignores its delayed result", async () => {
    const config = defaultMicConfig();
    config.polish.enabled = true;
    const h = harness(config);
    const result = deferred<string>();
    h.polish.mockReturnValue(result.promise);
    const runtime = await h.mount();
    await runtime.start();
    h.utterance();
    await flush();
    expect(h.polish).toHaveBeenCalledOnce();
    const signal = vi.mocked(h.deps.polish!).mock.calls[0][3];
    h.revoke();
    expect(signal?.aborted).toBe(true);
    result.resolve("must not insert");
    await flush();
    expect(h.field.value).toBe("seed ");
  });

  it("destroy removes listeners and stops an active capture", async () => {
    const h = harness();
    const runtime = await h.mount();
    await runtime.start();
    expect(h.listenerCount).toBe(2);
    runtime.destroy();
    await flush();
    expect(h.listenerCount).toBe(0);
    expect(h.stopped).toHaveBeenCalledOnce();
    expect(document.querySelector("#otoji-mic-widget")).toBeNull();
  });

  it("a stop while the ownership lease is pending cancels the start", async () => {
    const h = harness();
    const claim = deferred<boolean>();
    vi.mocked(h.ownership.acquire).mockReturnValue(claim.promise);
    const runtime = await h.mount();
    const starting = runtime.start();
    await flush();
    await runtime.stop();
    claim.resolve(true);
    await starting;
    expect(h.warm).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("ignores webpage-generated keyboard shortcuts instead of treating them as a gesture", async () => {
    const h = harness();
    await h.mount();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { altKey: true, shiftKey: true, code: "KeyM", bubbles: true }),
    );
    await flush();
    expect(h.ownership.acquire).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("rechecks remote consent after awaiting ownership and loading latest settings", async () => {
    const config = defaultMicConfig();
    config.recognition.mode = "server";
    config.recognition.remoteAudioConsent = true;
    config.recognition.serverUrl = "wss://speech.example.test/stt";
    const h = harness(config);
    const claim = deferred<boolean>();
    vi.mocked(h.ownership.acquire).mockReturnValue(claim.promise);
    const runtime = await h.mount();
    const starting = runtime.start();
    await flush();
    await h.store.update({ recognition: { remoteAudioConsent: false } });
    claim.resolve(true);
    await starting;
    expect(socket).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("stops when the current site's context permission is revoked", async () => {
    const config = defaultMicConfig();
    config.polish.enabled = true;
    config.polish.useSiteContext = true;
    config.sites[location.origin] = { contextEnabled: true };
    const h = harness(config);
    const runtime = await h.mount();
    await runtime.start();
    await h.store.update({ sites: { [location.origin]: { contextEnabled: false } } });
    await flush();
    expect(h.stopped).toHaveBeenCalledOnce();
    h.utterance();
    await flush();
    expect(h.polish).not.toHaveBeenCalled();
  });

  it("stops when voiceprint settings change so an old filter cannot remain active", async () => {
    const h = harness();
    const runtime = await h.mount();
    await runtime.start();
    await h.store.update({ voiceprint: { enabled: true } });
    await flush();
    expect(h.stopped).toHaveBeenCalledOnce();
  });

  it("does not start a second capture while the previous stop is still pending", async () => {
    const h = harness();
    const stopped = deferred<void>();
    h.stopped.mockReturnValueOnce(stopped.promise);
    const runtime = await h.mount();
    await runtime.start();
    const stopping = runtime.stop();
    const restarting = runtime.start();
    await flush();
    const capturesBeforeCleanup = h.capture.mock.calls.length;
    stopped.resolve();
    await stopping;
    await restarting;
    expect(capturesBeforeCleanup).toBe(1);
  });

  it("cannot restart after destroy, including a pending initial configuration read", async () => {
    const h = harness();
    const runtime = await h.mount();
    const loaded = deferred<MicConfig>();
    vi.mocked(h.store.load).mockReturnValueOnce(loaded.promise);
    const starting = runtime.start();
    await flush();
    runtime.destroy();
    loaded.resolve(defaultMicConfig());
    await starting;
    await runtime.start();
    expect(h.ownership.acquire).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("previews ongoing local speech without changing the editor before the final", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const h = harness();
    const runtime = await h.mount();
    await runtime.start();
    const options = h.capture.mock.calls[0][0];
    options.onFrame(new Float32Array(512).fill(0.1), 0);
    options.onFrame(new Float32Array(512).fill(0.1), 32);
    now = 2600;
    options.onFrame(new Float32Array(512).fill(0.1), 64);
    await flush();
    expect(h.recognize).toHaveBeenCalledOnce();
    expect(h.field.value).toBe("seed ");
    for (let i = 0; i < 23; i++) options.onFrame(new Float32Array(512), i * 32);
    await flush();
    expect(h.recognize).toHaveBeenCalledTimes(2);
    expect(h.field.value).toBe("seed hello");
  });
});

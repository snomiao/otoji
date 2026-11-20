import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMicConfig, normalizeMicConfig } from "../../mic/config";
import type { MicConfigStore } from "../../mic/storage";
import { mountMicSettings } from "../../mic/settings";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function fixture() {
  let saved = defaultMicConfig();
  saved.polish.accountToken = `lk_${"a".repeat(64)}`;
  saved.widget.enabled = true;
  const roots: ShadowRoot[] = [];
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, options) {
    const root = attach.call(this, options);
    roots.push(root);
    return root;
  });
  const store: MicConfigStore = {
    load: vi.fn(async () => structuredClone(saved)),
    save: vi.fn(async (value) => {
      saved = normalizeMicConfig(value);
      return structuredClone(saved);
    }),
    update: vi.fn(),
    subscribe: () => () => {},
    dispose() {},
  };
  await mountMicSettings(store);
  const root = roots[0];
  const field = (name: string) => root.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  const submit = async () => {
    root
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    store,
    field,
    submit,
    root,
    get saved() {
      return saved;
    },
  };
}

describe("private microphone settings", () => {
  it("keeps settings inside a closed root without pre-filling saved keys", async () => {
    const h = await fixture();
    expect(document.querySelector("#otoji-mic-private-settings")!.shadowRoot).toBeNull();
    expect(document.body.textContent).not.toContain(`lk_${"a".repeat(64)}`);
    expect(h.field("accountToken").value).toBe("");
    expect(h.field("accountToken").type).toBe("password");
  });
  it("saves preferences, retains an unchanged key and stops shared mic intent", async () => {
    const h = await fixture();
    h.field("sites").value = "https://github.com\nhttps://app.slack.com";
    await h.submit();
    expect(h.saved.widget.enabled).toBe(false);
    expect(h.saved.polish.accountToken).toBe(`lk_${"a".repeat(64)}`);
    expect(h.saved.sites["https://github.com"].contextEnabled).toBe(true);
    expect(h.store.save).toHaveBeenCalledOnce();
  });
  it("requires a valid server and explicit consent for remote recognition", async () => {
    const h = await fixture();
    h.field("mode").value = "server";
    h.field("serverUrl").value = "wss://speech.example/stt";
    await h.submit();
    expect(h.store.save).not.toHaveBeenCalled();
    h.field("remoteAudioConsent").checked = true;
    await h.submit();
    expect(h.saved.recognition.mode).toBe("server");
    expect(h.saved.recognition.serverUrl).toBe("wss://speech.example/stt");
  });
  it("does not enable polishing without a valid account token or context for path URLs", async () => {
    const h = await fixture();
    h.field("polish").checked = true;
    h.field("accountToken").value = "invalid";
    await h.submit();
    expect(h.store.save).not.toHaveBeenCalled();
    h.field("accountToken").value = `lk_${"a".repeat(64)}`;
    h.field("sites").value = "https://example.com/private-path";
    await h.submit();
    expect(h.store.save).not.toHaveBeenCalled();
    h.field("sites").value = "https://example.com";
    await h.submit();
    expect(h.saved.polish.enabled).toBe(true);
  });
  it("clears a saved account credential only through the explicit checkbox", async () => {
    const h = await fixture();
    h.field("clearToken").checked = true;
    await h.submit();
    expect(h.saved.polish.accountToken).toBe("");
  });
  it("requires a server-enrolled device profile when voice filtering is enabled", async () => {
    const h = await fixture();
    h.field("mode").value = "server";
    h.field("serverUrl").value = "wss://speech.example/stt";
    h.field("remoteAudioConsent").checked = true;
    h.field("voiceprint").checked = true;
    await h.submit();
    expect(h.store.save).not.toHaveBeenCalled();
    h.field("voiceDevice").value = "test-device";
    await h.submit();
    expect(h.saved.voiceprint.device).toBe("test-device");
  });
});

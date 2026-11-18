import {
  createGmStorage,
  createMicConfigStore,
  type GmStorageApi,
  type LegacyGmStorageApi,
} from "./storage";
import { createMicOwnership } from "./ownership";
import { mountMicWidget } from "./runtime";
import { mountMicSettings } from "./settings";
import { createProviderRequest, type ProviderGmRequest } from "./request";
import { polishText } from "./polish";

declare const GM: GmStorageApi | undefined;
declare const GM_getValue: LegacyGmStorageApi["GM_getValue"];
declare const GM_setValue: LegacyGmStorageApi["GM_setValue"];
declare const GM_addValueChangeListener: LegacyGmStorageApi["GM_addValueChangeListener"];
declare const GM_removeValueChangeListener: LegacyGmStorageApi["GM_removeValueChangeListener"];
declare const GM_registerMenuCommand: ((label: string, fn: () => void) => unknown) | undefined;
declare const GM_xmlhttpRequest: ProviderGmRequest;

async function main() {
  if (
    window.top !== window.self ||
    document.getElementById("otoji-mic-widget") ||
    document.getElementById("otoji-mic-private-settings")
  )
    return;
  const api =
    typeof GM !== "undefined" && typeof GM.getValue === "function"
      ? GM
      : {
          GM_getValue,
          GM_setValue,
          GM_addValueChangeListener,
          GM_removeValueChangeListener,
        };
  const store = createMicConfigStore(createGmStorage(api));
  // Configuration lives in the isolated world on one trusted origin only.
  // Arbitrary sites receive no configuration bridge or key-reading events.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const settingsOrigin =
    location.origin === "https://otoji.org" || (local && location.port === "5185");
  if (settingsOrigin && /^\/mic\/settings\/?$/.test(location.pathname)) {
    await mountMicSettings(store);
  } else {
    const providerRequest = createProviderRequest((details) => GM_xmlhttpRequest(details));
    await mountMicWidget(store, createMicOwnership(createGmStorage(api)), {
      polish: (text, config, context, signal) =>
        polishText(text, config, context, signal, providerRequest),
    });
  }
  if (typeof GM_registerMenuCommand === "function")
    GM_registerMenuCommand("Otoji Mic settings", () => {
      window.open("https://otoji.org/mic/settings", "_blank", "noopener,noreferrer");
    });
}
void main().catch(() => {
  console.warn("Otoji Mic could not initialize. Check userscript storage permissions.");
});

import type { MicConfigStore } from "./storage";
import { normalizeMicConfig } from "./config";

/** Rendered by the installed userscript only, in its closed shadow root.
 * There is no postMessage/event API through which another page can read keys.
 */
export async function mountMicSettings(store: MicConfigStore) {
  let saved = await store.load();
  const host = document.createElement("div");
  host.id = "otoji-mic-private-settings";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    :host{display:block;color-scheme:light dark;font:16px/1.5 system-ui;color:light-dark(#182230,#e8eef5)}form{max-width:760px;margin:2rem auto;padding:1.5rem;border:1px solid #7b879855;border-radius:18px;background:light-dark(white,#16202b)}fieldset{border:0;padding:0;margin:1.5rem 0}legend{font-weight:700;font-size:1.15rem}label{display:block;margin:.8rem 0}input:not([type=checkbox]),select,textarea{box-sizing:border-box;display:block;width:100%;font:inherit;padding:.6rem;border:1px solid #8794a3;border-radius:8px;background:transparent;color:inherit}input[type=checkbox]{margin-right:.6rem}small{display:block;color:light-dark(#4b5b6c,#a9b5c3)}button{font:inherit;padding:.7rem 1rem;border:1px solid #647b96;border-radius:9px;cursor:pointer}button[type=submit]{background:#2464ba;color:white}output{display:block;margin:1rem 0}a{color:inherit}code{overflow-wrap:anywhere}
  </style><form>
    <h1>Mic settings</h1><p>These settings belong to your installed Otoji Mic userscript and sync across its browser tabs. Microphone access always starts from a click.</p>
    <fieldset><legend>Recognition</legend>
      <label>Where speech is recognized<select name="mode"><option value="device">This device · SenseVoice (audio stays here)</option><option value="webrtc">Your approved Otoji peer · WebRTC</option><option value="server">Your configured speech server · WSS</option></select></label>
      <small>The local model downloads about 228 MB once per site/device cache. Recognition runs in your browser. Site policies may block model or worker loading.</small>
      <label>Local model<select name="modelId"><option value="sensevoice-small-int8">SenseVoice Small int8</option><option value="sensevoice-small-fp32">SenseVoice Small fp32 · larger download</option></select></label>
      <label>Otoji signaling base<input name="signalingUrl" type="url" placeholder="https://otoji.org/signal"></label>
      <label>Peer room<input name="room" autocomplete="off"></label><label>Recognition node peer ID<input name="peerId" autocomplete="off"></label>
      <small>Open <a href="https://otoji.org/mic/" target="_blank" rel="noopener noreferrer">Otoji Mic</a> on the recognizing device, start its node with the same room and peer ID, and approve this tab there. Signaling carries connection details; audio uses the peer data channel.</small>
      <label>Speech server URL<input name="serverUrl" placeholder="wss://speech.example/stt" autocomplete="off"></label>
      <label><input type="checkbox" name="remoteAudioConsent">Allow microphone audio to be sent to my selected peer or speech server for recognition.</label>
      <small>This script does not save or upload recordings for storage. Your selected server controls its own retention. No cloud fallback runs automatically.</small>
    </fieldset>
    <fieldset><legend>Voice filtering</legend><label><input type="checkbox" name="voiceprint">Ask my configured speech server to apply its enrolled voice filter.</label><label>Server voice profile / device ID<input name="voiceDevice" autocomplete="off" placeholder="Profile already enrolled on your server"></label><small>Server mode only. Enroll voices on that server first; this script does not record enrollment samples or train voiceprints. Unsupported servers may ignore this request.</small></fieldset>
    <fieldset><legend>Optional text polishing</legend>
      <label><input type="checkbox" name="polish">Polish recognized text with Otoji's Cloudflare Workers AI.</label>
      <label>Lianki account token<input name="accountToken" type="password" autocomplete="new-password" placeholder="Leave empty to keep the saved token"></label>
      <label><input type="checkbox" name="clearToken">Delete the saved account token.</label>
      <small>Create a token with the microphone polishing permission in <a href="https://lianki.com/my/preferences" target="_blank" rel="noopener noreferrer">your account preferences</a>. Polishing spends that account's credits at actual usage, subject to its daily maximum. Insufficient credits or a reached limit preserves your original transcription. Tokens stay in userscript storage; only otoji.org receives requests.</small>
      <label><input type="checkbox" name="useSiteContext">Include limited page context on sites I list below.</label>
      <label>Allowed site origins, one per line<textarea name="sites" rows="4" placeholder="https://github.com&#10;https://app.slack.com"></textarea></label>
      <small>Each listed site opts in to limited visible context: page title, selection, editor label and a bounded set of relevant Slack thread or GitHub issue/PR details. Password and payment fields are excluded. Leave blank to send only dictated text.</small>
    </fieldset><button type="submit">Save settings</button> <a href="/mic/">Back to Otoji Mic</a><output aria-live="polite" role="status"></output>
  </form>`;
  (document.querySelector("[data-mic-settings]") ?? document.body).append(host);
  const form = shadow.querySelector("form")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const output = shadow.querySelector("output")!;
  const fill = () => {
    for (const name of ["mode", "modelId", "signalingUrl", "room", "peerId", "serverUrl"] as const)
      field(name).value =
        saved.recognition[name] || (name === "modelId" ? "sensevoice-small-int8" : "");
    field("remoteAudioConsent").checked = saved.recognition.remoteAudioConsent;
    field("voiceprint").checked = saved.voiceprint.enabled;
    field("voiceDevice").value = saved.voiceprint.device;
    field("polish").checked = saved.polish.enabled;
    field("useSiteContext").checked = saved.polish.useSiteContext;
    field("sites").value = Object.entries(saved.sites)
      .filter(([, value]) => value.contextEnabled)
      .map(([origin]) => origin)
      .join("\n");
    field("accountToken").value = "";
    field("accountToken").placeholder = saved.polish.accountToken
      ? "Token saved · leave empty to keep it"
      : "Enter your account token";
    field("clearToken").checked = false;
  };
  fill();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const current = await store.load();
      const origins = field("sites").value.split(/\s+/).filter(Boolean);
      const sites = Object.fromEntries(
        origins.map((value) => {
          const url = new URL(value);
          if (url.origin !== value || !["http:", "https:"].includes(url.protocol))
            throw new Error("Use full site origins without paths, for example https://github.com.");
          return [url.origin, { contextEnabled: true }];
        }),
      );
      const next = normalizeMicConfig({
        ...current,
        recognition: {
          ...current.recognition,
          ...Object.fromEntries(
            ["mode", "modelId", "signalingUrl", "room", "peerId", "serverUrl"].map((name) => [
              name,
              field(name).value.trim(),
            ]),
          ),
          remoteAudioConsent: field("remoteAudioConsent").checked,
        },
        voiceprint: {
          ...current.voiceprint,
          enabled: field("voiceprint").checked,
          device: field("voiceDevice").value.trim(),
        },
        polish: {
          enabled: field("polish").checked,
          accountToken: field("clearToken").checked
            ? ""
            : field("accountToken").value.trim() || current.polish.accountToken,
          useSiteContext: field("useSiteContext").checked,
        },
        widget: { ...current.widget, enabled: false },
        sites,
      });
      if (
        next.recognition.mode === "webrtc" &&
        (!next.recognition.room || !next.recognition.peerId || !next.recognition.signalingUrl)
      )
        throw new Error("Set a signaling base, room and recognition node peer ID.");
      if (next.recognition.mode === "server" && !next.recognition.serverUrl)
        throw new Error("Use a secure WSS speech server URL (or loopback for development).");
      if (next.recognition.mode !== "device" && !next.recognition.remoteAudioConsent)
        throw new Error("Remote recognition requires enabling audio transfer above.");
      if (next.voiceprint.enabled && next.recognition.mode !== "server")
        throw new Error("Voice filtering requires speech server mode.");
      if (next.voiceprint.enabled && !next.voiceprint.device)
        throw new Error("Choose the voice profile / device ID enrolled on your server.");
      if (next.polish.enabled && !/^lk_[0-9a-f]{64}$/.test(next.polish.accountToken))
        throw new Error("Polishing requires a valid Lianki account token with microphone permission.");
      saved = await store.save(next);
      fill();
      output.textContent =
        "Saved. Microphones were stopped; turn one on in the editor tab when ready.";
    })().catch((error: unknown) => {
      output.textContent = error instanceof Error ? error.message : "Could not save settings.";
    });
  });
  return () => host.remove();
}

# Standalone dictation

`/mic/` is a standalone introduction and recognition-node page. Install
`/mic.user.js` in a userscript manager with GM storage and value-change support,
then open `/mic/settings/` in the same browser profile. The installed script
renders the configuration form in its isolated world and saves it with GM
storage. A normal page receives no event or message API for reading keys.

Focus an input, textarea, or contenteditable field before clicking the floating
microphone. Alt+Shift+M toggles it with a real keyboard event. The script never
submits the editor. Interim text is a separate preview; final text replaces the
captured selection only if the editor has not changed. If a result cannot be
inserted safely, use the widget's Copy text button.

## Recognition and data flow

- Device recognition is the default. The existing SenseVoice ONNX provider
  downloads its model, then processes bounded 16 kHz utterances in the browser.
  No microphone samples go to a recognition service in this mode.
- WebRTC recognition requires a room, the recognizing device's peer ID, and
  explicit audio-transfer consent in settings. On that device, open `/mic/`,
  start a node in the same room and with that peer ID, then approve the requesting
  peer. SDP/ICE uses Otoji signaling; PCM uses the peer data channel. Approval is
  session-only. The node sends text back only to the requesting peer.
- WSS recognition requires an explicitly configured server and audio-transfer
  consent. It uses the existing speech-server protocol: `ready`, tagged PCM16
  frames, `end`, partial/final text. Voice filtering requests the server's enrolled
  filter; this script neither enrolls voices nor stores biometric recordings.
- There is no automatic cloud fallback, audio recording storage, or playback.
  Selecting an external server does not control that server's retention policy.

The core energy gate and ordered recognition behavior are adapted from Lianki's
MIT microphone core. Capture and local SenseVoice inference reuse Otoji's
existing framework-independent modules. No runtime imports cross repositories.

## Optional polishing

Polishing is disabled by default. Enabling it requires a provider API key and a
model available to that key. Only recognized text is sent, directly from the
userscript manager to the selected provider. Keys remain in GM storage and are
sent in HTTP headers through `GM_xmlhttpRequest`, never URL parameters or page
messages. Failed polishing preserves the recognized text.

Page context additionally requires the context switch and an explicit allowed
site origin. Adapters collect bounded visible title/selection/editor labels and
relevant Slack thread or GitHub issue/PR details. Form values, password/payment
fields and hidden content are excluded. A configuration change stops active
capture and cancels pending polishing; restart explicitly to use new settings.

Provider API formats:
[DeepSeek chat completions](https://api-docs.deepseek.com/api/create-chat-completion/)
and [Gemini content generation](https://ai.google.dev/api/generate-content).
Provider policies, model availability and charges apply.

## Multiple tabs

Enabled intent, position and dictation configuration synchronize through GM
value-change listeners. A settled claim and renewable lease coordinate capture;
foreign ownership events immediately stop the old owner. Opening another tab
never starts its microphone automatically. GM storage has no atomic compare-and-
swap, so coordination depends on timely listener delivery; suspended tabs can
retain an OS microphone handle until their JavaScript resumes. No browser-wide
OS microphone lock is promised.

## Development

From `web/`, `bun run build:userscript` builds the legacy script and standalone
mic artifacts into `dist-userscript/`. `bun run build` also emits `dist/mic/`,
`dist/mic/settings/`, `dist/mic.user.js` and `dist/mic/loader.user.js`.

`bun run dev -- --host 127.0.0.1 --port 5185 --strictPort` serves the pages and
development script routes. Install `/mic/loader.user.js` to load the fixed
loopback bundle. It uses the same script identity as the regular script, so
installation replaces it rather than running two independent microphones.
Manager storage retention varies; verify settings after replacement. Revert by
installing the regular script again. The loader does not fetch an executable
bundle from an arbitrary configured URL or enable automatic updates.

## Limits

Cross-origin iframes require their own editor integration; the script runs in
the top frame only. Editors that reject plain DOM input transactions may need
a site-specific adapter. Browser/site CSP can block model downloads, workers,
microphone access or peer connections; failures are shown without switching to
a cloud recognizer. A local model that stalls cannot be forcibly cancelled by
the microphone UI; refreshing the tab releases that execution context.

The regression suites use fake audio/recognition transports and never open a
microphone, call a paid API or play sound. A physical microphone and two-device
connection still require a manual acceptance run before claiming hardware
compatibility.

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

Polishing is disabled by default. Opting in sends recognized text through the
userscript manager to `https://otoji.org/signal/mic/polish` only. The production
script grants `@connect otoji.org`; it never requests direct access to third-party
AI domains. Models and pricing stay on the server. Old provider keys and model
settings are discarded; old consent does not opt into account-billed polishing.

Create an expiring Lianki account token with the `mic:polish` permission at
`https://lianki.com/my/preferences`, then save it in the installed script's
private settings form. Tokens stay in GM storage and are sent only as an
Authorization header, never in URLs or page messages. The account service
validates the token's live account, expiry and permission, reserves credits
before inference and settles reported usage afterward (or a bounded text-length
estimate when token counts are unavailable), and enforces the account's
daily call maximum (shared by all its tokens, reset at 00:00 UTC). Admin permissions do not bypass payment or the daily maximum.
The billed backend ships dark pending approval of the new permission.

The Otoji signaling Worker proxies only this fixed contract to
`https://lianki.com/api/mic/polish`. It does not forward cookies, redirects,
client-supplied account/model/price overrides or raw upstream errors. A missing
account service never falls back to anonymous inference. The existing
`otoji.org/signal/*` route covers the endpoint; no new DNS route is required.

- Request: POST, Bearer account token, JSON `{transcript, context: null | object}`.
  Transcript: 8000 characters; context: 2000 characters of complete JSON,
  including keys and escapes; whole body: 32 KiB of UTF-8. The client fits
  optional context to those limits and drops it first if the body is too large;
  dictated text is never silently truncated.
- Success: `{text, charged, basis, daily: {used, max}}`, all billing quantities
  validated. `basis` must be `reported` or `estimated`; the proxy preserves it.
  Estimated usage is shown in the private widget and disclosed in settings.
  The backend logs the basis but does not persist it on individual credit-ledger
  rows, so historical ledger rows cannot distinguish the two bases.
- 401/403: invalid token or missing permission; 402: insufficient credits;
  404: paid polishing is not enabled; 429 `daily-limit`: account daily call
  maximum reached (safe `daily` and UTC `resetAt` are preserved); rate-limit
  refusals preserve a bounded numeric `Retry-After`. An explicit 502
  `model-failed` means the backend refunded the failed call.
- A refusal shows an actionable notice and preserves the raw transcription.
  No automatic retry spends credits twice.

Page context additionally requires the context switch and an explicit allowed
site origin. Adapters collect bounded visible title/selection/editor labels and
relevant Slack thread or GitHub issue/PR details. Form values, password/payment
fields and hidden content are excluded. A configuration change stops active
capture and cancels pending polishing; restart explicitly to use new settings.
Only text goes to Workers AI; this path does not send microphone audio.

The paired account service implementation and its configuration/limit tests are
in [Lianki #1001](https://github.com/snolab/lianki/pull/1001), with its contract
in `docs/mic-polish-api.md` on that branch. Deploy that backend and the Otoji
Worker together after review; installing the script alone does not enable paid AI.

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

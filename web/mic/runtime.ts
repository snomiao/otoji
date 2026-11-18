import { createSpeechGate, createRecognitionQueue } from "./core";
import type { MicConfig } from "./config";
import type { MicConfigStore } from "./storage";
import type { MicOwnership } from "./ownership";
import { InputPipe, findEditableTarget, type EditableTarget } from "./input";
import { collectContext, type SiteContext } from "./context";
import type { polishText } from "./polish";
import { startMicRaw, type MicVadHandle } from "../src/lib/mic-vad";
import { sttRecognize, warmSenseVoice } from "../src/providers/stt/sensevoice";
import { connectPeerRecognizer, connectServerRecognizer } from "./remote";

type Recognizer = { recognize(samples: Float32Array): Promise<{ text: string }>; close(): void };
type Batch = {
  pipe: InputPipe;
  text: string;
  pending: number;
  speaking: boolean;
  context: SiteContext | null;
};
export interface MicRuntimeDeps {
  capture?: typeof startMicRaw;
  localWarm?: typeof warmSenseVoice;
  localRecognize?: typeof sttRecognize;
  polish?: typeof polishText;
}

/** A microphone starts only from an explicit user gesture after the GM lease is acquired. */
export async function mountMicWidget(
  store: MicConfigStore,
  ownership: MicOwnership,
  deps: MicRuntimeDeps = {},
) {
  let config = await store.load();
  let capture: MicVadHandle | null = null,
    recognizer: Recognizer | null = null;
  let active = false,
    starting = false,
    destroyed = false,
    generation = 0,
    batch: Batch | null = null;
  let abort = new AbortController();
  let stopping: Promise<void> | null = null;
  let partialRunning = false,
    lastPreview = 0;
  let target: EditableTarget | null = findEditableTarget();
  let lastText = "";
  const gate = createSpeechGate();
  const queue = createRecognitionQueue();
  const host = document.createElement("div");
  host.id = "otoji-mic-widget";
  host.style.cssText =
    "position:fixed;z-index:2147483647;right:24px;bottom:24px;font:14px system-ui";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    :host{color-scheme:light dark}section{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #76808a66;border-radius:24px;background:light-dark(#fff,#18212c);color:light-dark(#172536,#edf3fa);box-shadow:0 4px 24px #0003;max-width:min(360px,90vw)}
    button,a{font:inherit;color:inherit}button{border:1px solid #72849a66;border-radius:16px;padding:8px;cursor:pointer;background:transparent;touch-action:none}button:focus-visible,a:focus-visible{outline:2px solid #287adb}button[aria-pressed=true]{background:#b32630;color:white}output{display:block;font-size:12px;max-width:180px;overflow-wrap:anywhere}button[data-handle]{cursor:move;padding:6px}a{font-size:12px}meter{width:24px;height:8px}
  </style><section aria-label="Otoji microphone"><button data-handle aria-label="Move microphone" title="Drag to move">⠿</button><button data-toggle aria-pressed="false">Mic off</button><div><output role="status" aria-live="polite">Click an editor, then turn the mic on.</output><meter min="0" max="1" value="0" aria-label="Microphone level"></meter></div><button data-copy hidden>Copy text</button><a href="https://otoji.org/mic/settings" target="_blank" rel="noopener noreferrer">Settings</a></section>`;
  const toggle = shadow.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const status = shadow.querySelector<HTMLOutputElement>("output")!;
  const level = shadow.querySelector<HTMLMeterElement>("meter")!;
  const copy = shadow.querySelector<HTMLButtonElement>("[data-copy]")!;
  document.documentElement.append(host);
  const note = (text: string) => {
    status.textContent = text;
  };
  const setPosition = () => {
    host.style.right = `${Math.max(8, Math.min(innerWidth - 80, config.widget.x))}px`;
    host.style.bottom = `${Math.max(8, Math.min(innerHeight - 60, config.widget.y))}px`;
  };
  const updateToggle = () => {
    toggle.setAttribute("aria-pressed", String(active));
    toggle.textContent = active ? "Stop mic" : config.widget.enabled ? "Stop other tab" : "Mic off";
  };
  setPosition();
  updateToggle();
  const focus = () => {
    const next = findEditableTarget();
    if (next && !host.contains(next)) target = next;
  };
  document.addEventListener("focusin", focus, true);
  const join = (a: string, b: string) =>
    !a
      ? b
      : !b
        ? a
        : `${a}${/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(a) || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(b) ? "" : " "}${b}`;
  const commit = (item: Batch) => {
    if (item.pending || item.speaking) return;
    if (item.text) {
      lastText = item.text;
      copy.hidden = false;
      if (!item.pipe.final(item.text)) note("Editor changed. Use Copy text to keep this sentence.");
    } else item.pipe.cancel();
    if (batch === item) batch = null;
  };
  async function stop(saveIntent = true) {
    if (stopping) return stopping;
    active = false;
    starting = false;
    generation++;
    abort.abort();
    abort = new AbortController();
    gate.discard();
    batch?.pipe.cancel();
    batch = null;
    partialRunning = false;
    lastPreview = 0;
    const current = capture;
    capture = null;
    recognizer?.close();
    recognizer = null;
    stopping = (async () => {
      await current?.stop().catch(() => {});
      await ownership.release();
      if (saveIntent) config = await store.update({ widget: { enabled: false } });
      level.value = 0;
      updateToggle();
      note("Microphone off.");
    })().finally(() => {
      stopping = null;
    });
    return stopping;
  }
  async function start() {
    if (active || starting || stopping || destroyed) return;
    starting = true;
    const run = ++generation;
    try {
      const loaded = await store.load();
      if (run !== generation) return;
      config = loaded;
      if (config.recognition.mode !== "device" && !config.recognition.remoteAudioConsent) {
        note("Enable audio transfer to your chosen node in Settings first.");
        return;
      }
      if (!target?.isConnected) {
        note("Focus a text editor before turning the microphone on.");
        return;
      }
      const acquired = await ownership.acquire();
      if (run !== generation) return;
      if (!acquired) {
        note("Another tab owns the microphone. Stop it there first.");
        return;
      }
      active = true;
      updateToggle();
      note("Preparing recognition…");
      config = await store.update({ widget: { enabled: true } });
      if (run !== generation) return;
      const settings = config;
      if (settings.recognition.mode !== "device" && !settings.recognition.remoteAudioConsent) {
        await stop();
        note("Audio transfer permission was disabled.");
        return;
      }
      let engine: Recognizer;
      const partial = (text: string) => {
        if (run === generation && batch) batch.pipe.partial(join(batch.text, text));
      };
      if (settings.recognition.mode === "device") {
        await (deps.localWarm ?? warmSenseVoice)(settings.recognition.modelId || undefined, (p) => {
          if (run === generation)
            note(
              p.stage === "fetch-model"
                ? `Downloading local model${p.total ? ` ${Math.round(((p.received ?? 0) / p.total) * 100)}%` : ""}…`
                : "Preparing local model…",
            );
        });
        engine = {
          recognize: (samples) =>
            (deps.localRecognize ?? sttRecognize)(
              samples,
              settings.recognition.modelId || undefined,
            ),
          close() {},
        };
      } else if (settings.recognition.mode === "webrtc") {
        engine = connectPeerRecognizer(settings.recognition, { onPartial: partial });
      } else {
        engine = connectServerRecognizer(
          {
            serverUrl: settings.recognition.serverUrl,
            voiceprint: settings.voiceprint.enabled,
            voiceprintDevice: settings.voiceprint.device,
          },
          { onPartial: partial },
        );
      }
      if (run !== generation || !ownership.isOwner()) {
        engine.close();
        return;
      }
      recognizer = engine;
      const handle = await (deps.capture ?? startMicRaw)({
        frameMs: 32,
        onLevel(l) {
          if (run === generation) level.value = Math.min(1, l.rms * 8);
        },
        onFrame(samples) {
          if (run !== generation || !ownership.isOwner()) return;
          const event = gate.push(samples);
          if (event.start) {
            if (!batch) {
              const pipe = new InputPipe();
              if (!target || !pipe.begin(target)) {
                note("Choose an editable text field.");
                return;
              }
              const contextOn =
                settings.polish.enabled &&
                settings.polish.useSiteContext &&
                settings.sites[location.origin]?.contextEnabled === true;
              batch = {
                pipe,
                text: "",
                pending: 0,
                speaking: true,
                context: collectContext(
                  { enabled: contextOn, adapters: { slack: true, github: true } },
                  target,
                ),
              };
            }
            batch.speaking = true;
            lastPreview = performance.now();
            batch.pipe.partial(join(batch.text, "…"));
            note("Listening…");
          }
          if (event.segment && batch) {
            const item = batch;
            item.speaking = false;
            item.pending++;
            const engine = recognizer!;
            void queue
              .run(async () => {
                if (run !== generation) return;
                note("Recognizing…");
                let { text } = await engine.recognize(event.segment!);
                if (run !== generation) return;
                text = text.trim();
                if (text && settings.polish.enabled) {
                  try {
                    if (!deps.polish) throw new Error("Polishing transport is not configured.");
                    text = await deps.polish(text, settings.polish, item.context, abort.signal);
                  } catch {
                    if (run === generation)
                      note("Polishing unavailable; keeping the recognized text.");
                  }
                }
                if (run !== generation) return;
                item.text = join(item.text, text);
                item.pipe.partial(join(item.text, item.speaking ? "…" : ""));
              })
              .catch(() => {
                if (run === generation)
                  note("Recognition failed. Check Mic settings and try again.");
              })
              .finally(() => {
                item.pending--;
                if (run === generation) commit(item);
              });
          }
          // Local SenseVoice can preview a growing utterance without sending
          // extra audio off-device. Final requests stay serialized behind it.
          if (
            settings.recognition.mode === "device" &&
            batch?.speaking &&
            !partialRunning &&
            performance.now() - lastPreview >= 2500
          ) {
            const preview = gate.snapshot();
            const item = batch;
            if (preview) {
              partialRunning = true;
              lastPreview = performance.now();
              void queue
                .run(() => engine.recognize(preview))
                .then(({ text }) => {
                  if (run === generation && batch === item && text.trim())
                    item.pipe.partial(join(item.text, text.trim()));
                })
                .catch(() => {})
                .finally(() => {
                  if (run === generation) partialRunning = false;
                });
            }
          }
        },
      });
      if (run !== generation || !ownership.isOwner()) {
        await handle.stop();
        return;
      }
      capture = handle;
      note("Listening. Your words go to the selected editor.");
    } catch {
      if (run === generation) {
        await stop();
        note("Could not start. Check microphone permission and recognition settings.");
      }
    } finally {
      if (run === generation) starting = false;
    }
  }
  const click = () => {
    void (active || config.widget.enabled ? stop() : start());
  };
  toggle.addEventListener("pointerdown", (e) => e.preventDefault());
  toggle.addEventListener("click", click);
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(lastText).then(
      () => note("Text copied."),
      () => note("Clipboard unavailable."),
    );
  });
  const handle = shadow.querySelector<HTMLButtonElement>("[data-handle]")!;
  let drag: { id: number; x: number; y: number; right: number; bottom: number } | null = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      right: parseFloat(host.style.right),
      bottom: parseFloat(host.style.bottom),
    };
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    config.widget.x = drag.right + drag.x - e.clientX;
    config.widget.y = drag.bottom + drag.y - e.clientY;
    setPosition();
  });
  handle.addEventListener("pointerup", () => {
    if (drag) {
      drag = null;
      void store.update({
        widget: { x: parseFloat(host.style.right), y: parseFloat(host.style.bottom) },
      });
    }
  });
  handle.addEventListener("pointercancel", () => {
    drag = null;
  });
  const unsubscribe = store.subscribe((next) => {
    const mustStop =
      active &&
      (!next.widget.enabled ||
        JSON.stringify(next.recognition) !== JSON.stringify(config.recognition) ||
        JSON.stringify(next.polish) !== JSON.stringify(config.polish) ||
        JSON.stringify(next.sites) !== JSON.stringify(config.sites) ||
        JSON.stringify(next.voiceprint) !== JSON.stringify(config.voiceprint));
    config = next;
    setPosition();
    updateToggle();
    if (mustStop) void stop(false);
  });
  const unown = ownership.listen((state) => {
    if (!state.owned && active) void stop(false);
  });
  const pagehide = () => {
    void stop(false);
  };
  const resize = () => setPosition();
  const key = (e: KeyboardEvent) => {
    if (e.isTrusted && e.altKey && e.shiftKey && e.code === "KeyM") {
      e.preventDefault();
      click();
    }
  };
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("resize", resize);
  document.addEventListener("keydown", key);
  return {
    start,
    stop,
    destroy() {
      destroyed = true;
      unsubscribe();
      unown();
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", pagehide);
      host.remove();
      void stop(false);
    },
  };
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { browserKeyStore, type OtojiKeys } from "../lib/keystore";
import { ProviderRouter } from "../providers/router";
import type { PolishProvider, SttProvider, SttSession, TtsProvider } from "../providers/types";
import { IflytekRtasrProvider } from "../providers/stt/iflytek_rtasr";
import { OpenAiWhisperProvider } from "../providers/stt/openai_whisper";
import { WebSpeechSttProvider } from "../providers/stt/webspeech";
import { TransformersWhisperProvider } from "../providers/stt/transformers";
import { SenseVoiceSttProvider, warmSenseVoice, type LoadProgress } from "../providers/stt/sensevoice";
import { SENSEVOICE_MODELS, DEFAULT_SENSEVOICE_MODEL } from "../providers/stt/sensevoice-models";
import { backoffDelay, sleep } from "../lib/backoff";
import { LiveWaveform } from "./LiveWaveform";
import { RecordingPlayer, type Recording } from "./RecordingPlayer";
import type { SttLevel } from "../providers/types";
import { computePeaks, packPeaks, unpackPeaks } from "../lib/peaks";
import { encodeOpus, isOpusSupported } from "../lib/opus";
import { recordingsDB, requestPersistentStorage } from "../lib/recordings-db";
import { isReadableTranscript } from "../lib/text";
import { IflytekTtsProvider } from "../providers/tts/iflytek_tts";
import { OpenAiTtsProvider } from "../providers/tts/openai_tts";
import { SpeechSynthesisTtsProvider } from "../providers/tts/speechsynthesis";
import { AnthropicPolishProvider } from "../providers/polish/anthropic";
import { NoopPolishProvider } from "../providers/polish/noop";
import { SelectOmnibox } from "./EnumOmnibox";

function buildRouters(keys: OtojiKeys) {
  const stt: SttProvider[] = [
    new SenseVoiceSttProvider(keys.SENSEVOICE_MODEL ?? DEFAULT_SENSEVOICE_MODEL),
    new IflytekRtasrProvider({ appId: keys.IFLYTEK_APP_ID ?? "", apiKey: keys.IFLYTEK_API_KEY ?? "" }),
    new OpenAiWhisperProvider({ apiKey: keys.OPENAI_API_KEY ?? "", baseUrl: keys.OPENAI_BASE_URL }),
    new WebSpeechSttProvider(),
    new TransformersWhisperProvider({ enabled: false }),
  ];
  const tts: TtsProvider[] = [
    new IflytekTtsProvider({
      appId: keys.IFLYTEK_APP_ID ?? "",
      apiKey: keys.IFLYTEK_TTS_API_KEY ?? "",
      apiSecret: keys.IFLYTEK_TTS_API_SECRET ?? "",
      voice: keys.IFLYTEK_TTS_VOICE,
      aue: keys.IFLYTEK_TTS_AUE,
    }),
    new OpenAiTtsProvider({ apiKey: keys.OPENAI_API_KEY ?? "", baseUrl: keys.OPENAI_BASE_URL }),
    new SpeechSynthesisTtsProvider(),
  ];
  const polish: PolishProvider[] = [
    new AnthropicPolishProvider({ apiKey: keys.ANTHROPIC_API_KEY ?? "", model: keys.ANTHROPIC_MODEL }),
    new NoopPolishProvider(),
  ];
  return {
    stt: new ProviderRouter<SttProvider>(stt, keys.STT_PROVIDER ?? "sensevoice"),
    tts: new ProviderRouter<TtsProvider>(tts),
    polish: new ProviderRouter<PolishProvider>(polish),
  };
}

export function App() {
  const store = useMemo(() => browserKeyStore(), []);
  const [keys, setKeys] = useState<OtojiKeys>(() => store.getAll());
  const [segments, setSegments] = useState<{ text: string; final: boolean }[]>([]);
  const [partial, setPartial] = useState("");
  const [polished, setPolished] = useState("");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [modelStatus, setModelStatus] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const routers = useMemo(() => buildRouters(keys), [keys]);
  const listenRef = useRef(false);
  const sessionRef = useRef<SttSession | null>(null);
  const levelsRef = useRef<SttLevel[]>([]);
  const recCounter = useRef(0);
  const clearGenRef = useRef(0);

  const sttName = routers.stt.pick()?.name ?? "(none)";
  const ttsName = routers.tts.pick()?.name ?? "(none)";
  const polishName = routers.polish.pick()?.name ?? "(none)";

  // Eager default: warm (download + init + cache) the SenseVoice model on load
  // and whenever the selected model changes, so it's ready instantly.
  const selectedModel = keys.SENSEVOICE_MODEL ?? DEFAULT_SENSEVOICE_MODEL;
  useEffect(() => {
    if ((keys.STT_PROVIDER ?? "sensevoice") !== "sensevoice") return;
    let cancelled = false;
    const onProg = (p: LoadProgress) => {
      if (cancelled) return;
      if (p.stage === "fetch-model" && p.total) {
        setModelStatus(`Downloading model… ${((p.received! / p.total) * 100).toFixed(0)}%`);
      } else if (p.stage === "fetch-tokens") setModelStatus("Downloading tokens…");
      else if (p.stage === "init") setModelStatus("Initializing recognizer…");
      else if (p.stage === "ready") setModelStatus("Model ready ✓");
    };
    setModelStatus("Loading model…");
    warmSenseVoice(selectedModel, onProg)
      .then(() => !cancelled && setModelStatus("Model ready ✓"))
      .catch((e) => !cancelled && setModelStatus(`Model load failed: ${e.message}`));
    return () => { cancelled = true; };
  }, [selectedModel, keys.STT_PROVIDER]);

  useEffect(() => () => { listenRef.current = false; sessionRef.current?.stop().catch(() => {}); }, []);

  // Restore persisted recordings on load + request durable storage.
  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage().catch(() => {});
    if (!recordingsDB.available()) return;
    recordingsDB
      .all()
      .then((list) => {
        if (cancelled) return;
        // Purge previously-stored noise segments with no readable transcript.
        const readable = list.filter((r) => isReadableTranscript(r.text));
        for (const r of list) if (!isReadableTranscript(r.text)) recordingsDB.delete(r.id).catch(() => {});
        setRecordings(
          readable.map((r) => ({
            id: r.id,
            at: r.at,
            durationMs: r.durationMs,
            text: r.text,
            peaks: unpackPeaks(r.peaks),
            sampleRate: r.opus.sampleRate,
            opus: r.opus,
          })),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Capture a VAD segment: show instantly (in-memory PCM), then compress to
  // Opus and persist to IndexedDB (~10x smaller than WAV).
  function addRecording(audio: { samples: Float32Array; sampleRate: number; durationMs: number }, text: string) {
    const peaks = computePeaks(audio.samples, 400);
    const id = `rec-${recCounter.current++}-${Date.now()}`;
    const at = Date.now();
    const gen = clearGenRef.current;
    setRecordings((prev) => [
      { id, at, durationMs: audio.durationMs, text, peaks, sampleRate: audio.sampleRate, samples: audio.samples },
      ...prev,
    ]);
    if (isOpusSupported() && recordingsDB.available()) {
      encodeOpus(audio.samples, audio.sampleRate)
        .then((opus) => {
          // Skip if the user cleared recordings while we were encoding —
          // otherwise the cleared clip reappears on reload.
          if (clearGenRef.current !== gen) return;
          return recordingsDB.put({ id, at, durationMs: audio.durationMs, text, peaks: packPeaks(peaks), opus });
        })
        .catch(() => {});
    }
  }

  async function clearRecordings() {
    clearGenRef.current += 1; // invalidate any in-flight encode→persist
    setRecordings([]);
    await recordingsDB.clear().catch(() => {});
  }

  // Infinite listen: keep a session alive, auto-restart on error/end with
  // golden-ratio (φ) exponential backoff.
  async function startListening() {
    if (listenRef.current) return;
    listenRef.current = true;
    setListening(true);
    let attempt = 0;
    while (listenRef.current) {
      const prov = routers.stt.pick();
      if (!prov) { setStatus("no stt provider"); break; }
      try {
        setStatus(`listening via ${prov.name}`);
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
          prov
            .start(
              (seg) => {
                attempt = 0; // healthy output resets backoff
                if (seg.final) {
                  setPartial("");
                  // Drop noise/non-speech segments that yield no readable text.
                  if (isReadableTranscript(seg.text)) {
                    setSegments((prev) => [...prev, { text: seg.text, final: true }]);
                    if (seg.audio) addRecording(seg.audio, seg.text);
                  }
                } else setPartial(seg.text);
              },
              (e) => done(() => reject(e)),
              (level) => {
                const buf = levelsRef.current;
                buf.push(level);
                if (buf.length > 600) buf.splice(0, buf.length - 600);
              },
            )
            .then((s) => {
              sessionRef.current = s;
              if (!listenRef.current) { s.stop().catch(() => {}); done(resolve); }
            })
            .catch((e) => done(() => reject(e)));
          // resolve only when the user stops (checked via poll below)
          const poll = setInterval(() => {
            if (!listenRef.current) { clearInterval(poll); done(resolve); }
          }, 200);
        });
      } catch (e: any) {
        if (!listenRef.current) break;
        attempt += 1;
        const d = backoffDelay(attempt);
        setStatus(`error: ${e?.message ?? e} — retrying in ${(d / 1000).toFixed(1)}s`);
        await sleep(d);
      } finally {
        await sessionRef.current?.stop().catch(() => {});
        sessionRef.current = null;
      }
    }
    setListening(false);
    setStatus("stopped");
  }

  async function stopListening() {
    listenRef.current = false;
    await sessionRef.current?.stop().catch(() => {});
    sessionRef.current = null;
  }

  async function polishAll() {
    const prov = routers.polish.pick();
    if (!prov) return;
    const text = segments.map((s) => s.text).join(" ");
    const out = await prov.polish(text);
    setPolished(out);
  }

  async function speak() {
    const prov = routers.tts.pick();
    if (!prov) return;
    const text = polished || segments.map((s) => s.text).join(" ");
    if (!text) return;
    const r = await prov.synthesize(text);
    if ("audio" in r) {
      const blob = new Blob([r.audio as BlobPart], { type: r.mime });
      new Audio(URL.createObjectURL(blob)).play();
    }
  }

  function saveKeys(next: OtojiKeys) {
    store.setAll(next);
    setKeys({ ...store.getAll() });
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>otoji</h1>
        <button onClick={() => setShowSettings((v) => !v)}>Settings</button>
      </header>
      <p style={{ color: "#666" }}>STT: {sttName} · TTS: {ttsName} · Polish: {polishName}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {listening
          ? <button onClick={stopListening}>Stop</button>
          : <button onClick={startListening}>Start</button>}
        <button onClick={polishAll} disabled={!segments.length}>Polish</button>
        <button onClick={speak} disabled={!segments.length && !polished}>Speak</button>
        <label style={{ marginLeft: "auto", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          Model:
          <SelectOmnibox
            value={keys.STT_PROVIDER ?? "sensevoice"}
            onChange={(e) => saveKeys({ ...keys, STT_PROVIDER: e.target.value })}
          >
            {routers.stt.all().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </SelectOmnibox>
        </label>
        {(keys.STT_PROVIDER ?? "sensevoice") === "sensevoice" && (
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            Variant:
            <SelectOmnibox
              value={selectedModel}
              onChange={(e) => saveKeys({ ...keys, SENSEVOICE_MODEL: e.target.value })}
            >
              {SENSEVOICE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </SelectOmnibox>
          </label>
        )}
      </div>
      <p style={{ color: "#888", fontSize: 12 }}>{status}{modelStatus ? ` · ${modelStatus}` : ""}</p>
      <section style={{ margin: "8px 0" }}>
        <LiveWaveform levelsRef={levelsRef} running={listening} width={480} height={64} />
      </section>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Recordings ({recordings.length})</h2>
          {recordings.length > 0 && (
            <button onClick={clearRecordings} style={{ fontSize: 12 }}>Clear</button>
          )}
        </div>
        {recordings.length === 0 ? (
          <p style={{ color: "#aaa", fontSize: 13 }}>
            VAD-segmented utterances appear here — each with a waveform you can replay.
          </p>
        ) : (
          <div data-testid="recordings">
            {recordings.map((r, i) => (
              <RecordingPlayer key={r.id} rec={r} index={recordings.length - 1 - i} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2>Transcript</h2>
        <div data-testid="transcript">
          {segments.map((s, i) => <span key={i}>{s.text} </span>)}
          {partial && <em style={{ color: "#888" }}>{partial}</em>}
        </div>
      </section>
      {polished && (
        <section>
          <h2>Polished</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{polished}</pre>
        </section>
      )}
      {showSettings && <SettingsPanel keys={keys} onSave={saveKeys} />}
    </div>
  );
}

function SettingsPanel({ keys, onSave }: { keys: OtojiKeys; onSave: (k: OtojiKeys) => void }) {
  const [draft, setDraft] = useState<OtojiKeys>(keys);
  const fields: { name: keyof OtojiKeys; label: string }[] = [
    { name: "IFLYTEK_APP_ID", label: "iFlytek App ID" },
    { name: "IFLYTEK_API_KEY", label: "iFlytek API Key (RTASR)" },
    { name: "IFLYTEK_TTS_API_KEY", label: "iFlytek TTS API Key" },
    { name: "IFLYTEK_TTS_API_SECRET", label: "iFlytek TTS API Secret" },
    { name: "IFLYTEK_TTS_VOICE", label: "iFlytek TTS Voice" },
    { name: "IFLYTEK_TTS_AUE", label: "iFlytek TTS AUE" },
    { name: "OPENAI_API_KEY", label: "OpenAI API Key" },
    { name: "OPENAI_BASE_URL", label: "OpenAI Base URL" },
    { name: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
    { name: "ANTHROPIC_MODEL", label: "Anthropic Model" },
    { name: "GOOGLE_OAUTH_TOKEN", label: "Google OAuth Token" },
    { name: "GOOGLE_DOC_ID", label: "Google Doc ID" },
  ];
  return (
    <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
      <h2>Settings (BYOK, stored in localStorage)</h2>
      <div style={{ display: "grid", gap: 6 }}>
        {fields.map((f) => (
          <label key={f.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 220, fontSize: 12 }}>{f.label}</span>
            <input
              type="password"
              value={draft[f.name] ?? ""}
              onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })}
              style={{ flex: 1 }}
            />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => onSave(draft)}>Save</button>
      </div>
    </section>
  );
}

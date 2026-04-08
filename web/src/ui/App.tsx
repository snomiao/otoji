import React, { useEffect, useMemo, useState } from "react";
import { browserKeyStore, type OtojiKeys } from "../lib/keystore";
import { ProviderRouter } from "../providers/router";
import type { PolishProvider, SttProvider, SttSession, TtsProvider } from "../providers/types";
import { IflytekRtasrProvider } from "../providers/stt/iflytek_rtasr";
import { OpenAiWhisperProvider } from "../providers/stt/openai_whisper";
import { WebSpeechSttProvider } from "../providers/stt/webspeech";
import { TransformersWhisperProvider } from "../providers/stt/transformers";
import { IflytekTtsProvider } from "../providers/tts/iflytek_tts";
import { OpenAiTtsProvider } from "../providers/tts/openai_tts";
import { SpeechSynthesisTtsProvider } from "../providers/tts/speechsynthesis";
import { AnthropicPolishProvider } from "../providers/polish/anthropic";
import { NoopPolishProvider } from "../providers/polish/noop";

function buildRouters(keys: OtojiKeys) {
  const stt: SttProvider[] = [
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
    stt: new ProviderRouter<SttProvider>(stt),
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
  const [session, setSession] = useState<SttSession | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [showSettings, setShowSettings] = useState(false);

  const routers = useMemo(() => buildRouters(keys), [keys]);

  const sttName = routers.stt.pick()?.name ?? "(none)";
  const ttsName = routers.tts.pick()?.name ?? "(none)";
  const polishName = routers.polish.pick()?.name ?? "(none)";

  useEffect(() => () => { session?.stop().catch(() => {}); }, [session]);

  async function start() {
    const prov = routers.stt.pick();
    if (!prov) { setStatus("no stt provider"); return; }
    setStatus(`listening via ${prov.name}`);
    const s = await prov.start(
      (seg) => {
        if (seg.final) {
          setSegments((prev) => [...prev, seg]);
          setPartial("");
        } else {
          setPartial(seg.text);
        }
      },
      (e) => setStatus(`error: ${e.message}`),
    );
    setSession(s);
  }

  async function stop() {
    await session?.stop();
    setSession(null);
    setStatus("stopped");
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
      <div style={{ display: "flex", gap: 8 }}>
        {session
          ? <button onClick={stop}>Stop</button>
          : <button onClick={start}>Start</button>}
        <button onClick={polishAll} disabled={!segments.length}>Polish</button>
        <button onClick={speak} disabled={!segments.length && !polished}>Speak</button>
      </div>
      <p style={{ color: "#888", fontSize: 12 }}>{status}</p>
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

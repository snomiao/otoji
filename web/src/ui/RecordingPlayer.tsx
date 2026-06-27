import React, { useEffect, useRef, useState } from "react";
import { Waveform } from "./Waveform";
import { samplesToWavBlob, type Peak } from "../lib/peaks";
import { decodeOpus, type StoredOpus } from "../lib/opus";

export interface Recording {
  id: string;
  at: number;
  durationMs: number;
  text: string;
  peaks: Peak[];
  sampleRate: number;
  /** Compressed source (persisted). */
  opus?: StoredOpus;
  /** Optional in-memory PCM (live session, before/instead of decode). */
  samples?: Float32Array;
}

// One shared AudioContext for all playback (created lazily on first play).
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

export function RecordingPlayer({ rec, index }: { rec: Recording; index: number }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const manualStopRef = useRef(false);
  const decodedRef = useRef<{ samples: Float32Array; rate: number } | null>(null);

  const duration = rec.durationMs / 1000;

  useEffect(() => () => stop(true), []); // cleanup on unmount

  // Decode the Opus payload at most once; reused by playback and download.
  async function getDecoded(): Promise<{ samples: Float32Array; rate: number }> {
    if (decodedRef.current) return decodedRef.current;
    let decoded: { samples: Float32Array; rate: number };
    if (rec.samples) decoded = { samples: rec.samples, rate: rec.sampleRate };
    else if (rec.opus) { const d = await decodeOpus(rec.opus); decoded = { samples: d.samples, rate: d.sampleRate }; }
    else decoded = { samples: new Float32Array(0), rate: rec.sampleRate };
    decodedRef.current = decoded;
    return decoded;
  }

  async function ensureBuffer(): Promise<AudioBuffer> {
    if (bufferRef.current) return bufferRef.current;
    setBusy(true);
    try {
      const { samples, rate } = await getDecoded();
      const ctx = getCtx();
      const buf = ctx.createBuffer(1, Math.max(1, samples.length), rate);
      buf.getChannelData(0).set(samples);
      bufferRef.current = buf;
      return buf;
    } finally {
      setBusy(false);
    }
  }

  function tick() {
    const t = getCtx().currentTime - startedAtRef.current;
    setProgress(Math.min(1, t / duration));
    rafRef.current = requestAnimationFrame(tick);
  }

  async function play(fromFraction?: number) {
    const ctx = getCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const buffer = await ensureBuffer();
    stop(true);
    if (fromFraction != null) offsetRef.current = fromFraction * duration;
    if (offsetRef.current >= duration) offsetRef.current = 0;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    manualStopRef.current = false;
    src.onended = () => {
      if (manualStopRef.current) return;
      cancelAnimationFrame(rafRef.current);
      offsetRef.current = 0;
      setProgress(0);
      setPlaying(false);
    };
    startedAtRef.current = ctx.currentTime - offsetRef.current;
    src.start(0, offsetRef.current);
    sourceRef.current = src;
    setPlaying(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function pause() {
    offsetRef.current = getCtx().currentTime - startedAtRef.current;
    stop(true);
    setPlaying(false);
  }

  function stop(keepOffset = false) {
    cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      manualStopRef.current = true;
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (!keepOffset) { offsetRef.current = 0; setProgress(0); }
  }

  function seek(fraction: number) {
    if (playing) play(fraction);
    else { offsetRef.current = fraction * duration; setProgress(fraction); }
  }

  async function download() {
    const { samples, rate } = await getDecoded();
    const url = URL.createObjectURL(samplesToWavBlob(samples, rate));
    const a = document.createElement("a");
    a.href = url;
    a.download = `otoji-${index + 1}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
      <button
        onClick={() => (playing ? pause() : play())}
        disabled={busy}
        style={{ width: 40, height: 40, borderRadius: 20, flex: "0 0 auto" }}
      >
        {busy ? "…" : playing ? "⏸" : "▶"}
      </button>
      <div style={{ flex: "0 0 auto" }}>
        <Waveform peaks={rec.peaks} width={300} height={44} progress={progress} onSeek={seek} />
      </div>
      <div style={{ fontSize: 13, minWidth: 0, flex: 1 }}>
        <div style={{ color: "#999", fontSize: 11 }}>
          #{index + 1} · {(rec.durationMs / 1000).toFixed(1)}s
        </div>
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {rec.text || <em style={{ color: "#bbb" }}>(no transcript)</em>}
        </div>
      </div>
      <button onClick={download} title="Download WAV" style={{ flex: "0 0 auto" }}>⬇</button>
    </div>
  );
}

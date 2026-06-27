import React, { useEffect, useRef, useState } from "react";
import { Waveform } from "./Waveform";
import { samplesToWavBlob } from "../lib/peaks";

export interface Recording {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  text: string;
  at: number; // epoch ms
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
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0); // ctx time when playback (re)started, minus offset
  const offsetRef = useRef(0); // seconds into the clip
  const rafRef = useRef(0);
  const manualStopRef = useRef(false);

  const duration = rec.samples.length / rec.sampleRate;

  useEffect(() => () => stop(true), []); // cleanup on unmount

  function ensureBuffer(): AudioBuffer {
    if (!bufferRef.current) {
      const ctx = getCtx();
      const buf = ctx.createBuffer(1, rec.samples.length, rec.sampleRate);
      buf.getChannelData(0).set(rec.samples);
      bufferRef.current = buf;
    }
    return bufferRef.current;
  }

  function tick() {
    const ctx = getCtx();
    const t = ctx.currentTime - startedAtRef.current;
    setProgress(Math.min(1, t / duration));
    rafRef.current = requestAnimationFrame(tick);
  }

  function play(fromFraction?: number) {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    const buffer = ensureBuffer();
    stop(true); // clear any existing source without resetting offset below
    if (fromFraction != null) offsetRef.current = fromFraction * duration;
    if (offsetRef.current >= duration) offsetRef.current = 0;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    manualStopRef.current = false;
    src.onended = () => {
      if (manualStopRef.current) return; // stopped by us; ignore
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
    const ctx = getCtx();
    offsetRef.current = ctx.currentTime - startedAtRef.current;
    stop(true);
    setPlaying(false);
  }

  // stop the current source; keepOffset=true preserves the resume point
  function stop(keepOffset = false) {
    cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      manualStopRef.current = true;
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (!keepOffset) {
      offsetRef.current = 0;
      setProgress(0);
    }
  }

  function seek(fraction: number) {
    if (playing) play(fraction);
    else {
      offsetRef.current = fraction * duration;
      setProgress(fraction);
    }
  }

  function download() {
    const url = URL.createObjectURL(samplesToWavBlob(rec.samples, rec.sampleRate));
    const a = document.createElement("a");
    a.href = url;
    a.download = `otoji-${index + 1}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
      <button onClick={() => (playing ? pause() : play())} style={{ width: 40, height: 40, borderRadius: 20, flex: "0 0 auto" }}>
        {playing ? "⏸" : "▶"}
      </button>
      <div style={{ flex: "0 0 auto" }}>
        <Waveform samples={rec.samples} width={300} height={44} progress={progress} onSeek={seek} />
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

// Wire frames for cross-device graph edges (sent over RTCDataChannel).
// Audio is carried as raw 16 kHz mono Float32 (base64) — kept at 16 kHz so the
// receiving STT node's fbank sees the rate it expects. (Opus-on-the-wire is a
// future bandwidth optimization; it decodes to 48 kHz and would need a resample.)

import { bytesToBase64, base64ToBytes } from "../lib/base64";
import type { SegmentMsg, TranscriptMsg } from "./runtime";

export interface EdgeFrame {
  kind: "edge";
  target: string; // node id
  port: string; // target input handle
  mtype: "segment" | "transcript";
  sampleRate: number;
  durationMs: number;
  text?: string;
  samplesB64: string; // Float32 PCM bytes, base64
}

function encodeSamples(samples: Float32Array): string {
  return bytesToBase64(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
}

function decodeSamples(b64: string): Float32Array {
  const bytes = base64ToBytes(b64); // fresh, 4-byte-aligned buffer
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

export function buildSegmentFrame(target: string, port: string, seg: SegmentMsg): EdgeFrame {
  return {
    kind: "edge",
    target,
    port,
    mtype: "segment",
    sampleRate: seg.sampleRate,
    durationMs: seg.durationMs,
    samplesB64: encodeSamples(seg.samples),
  };
}

export function buildTranscriptFrame(target: string, port: string, tr: TranscriptMsg): EdgeFrame {
  return {
    kind: "edge",
    target,
    port,
    mtype: "transcript",
    sampleRate: tr.audio.sampleRate,
    durationMs: tr.audio.durationMs,
    text: tr.text,
    samplesB64: encodeSamples(tr.audio.samples),
  };
}

export function frameToMessage(f: EdgeFrame): SegmentMsg | TranscriptMsg {
  const samples = decodeSamples(f.samplesB64);
  const seg: SegmentMsg = { samples, sampleRate: f.sampleRate, durationMs: f.durationMs };
  if (f.mtype === "transcript") return { text: f.text ?? "", audio: seg };
  return seg;
}

// Wire frames for cross-device graph edges (sent over RTCDataChannel).
// Audio is carried as raw 16 kHz mono Float32 (base64) — kept at 16 kHz so the
// receiving STT node's fbank sees the rate it expects. (Opus-on-the-wire is a
// future bandwidth optimization; it decodes to 48 kHz and would need a resample.)

import { bytesToBase64, base64ToBytes } from "../lib/base64";
import type { ControlMsg, ImageMsg, SegmentMsg, SpatialMsg, TranscriptMsg } from "./runtime";
import type { CameraCaptureInfo } from "../providers/vision/camera";
import type { ModelSourceMsg } from "../providers/model/model-source";

export interface EdgeFrame {
  kind: "edge";
  target: string; // node id
  port: string; // target input handle
  mtype: "segment" | "transcript" | "image" | "control" | "spatial" | "model";
  sampleRate?: number;
  durationMs?: number;
  offsetMs?: number; // segment offset in source timeline
  text?: string;
  lang?: string; // detected source language (transcript)
  emotion?: string; // SER tag (transcript)
  event?: string; // AED tag (transcript)
  tStartMs?: number; // CTC speech start (transcript, absolute)
  tEndMs?: number; // CTC speech end (transcript, absolute)
  segmentId?: number; // revision protocol (transcript): utterance id
  revision?: number; // revision protocol: monotonic within segmentId
  status?: "partial" | "provisional" | "final"; // revision protocol; absent = final
  replacesRevision?: number; // revision protocol: pass-2 supersede pointer
  sourceId?: string; // revision protocol: node that minted segmentId
  samplesB64?: string; // Float32 PCM bytes, base64
  imageDataUrl?: string; // compressed image frame
  width?: number;
  height?: number;
  ts?: number;
  pulse?: boolean;
  spatial?: unknown;
  model?: ModelSourceMsg;
  capture?: CameraCaptureInfo;
}

export type SegmentFrame = EdgeFrame & { mtype: "segment"; sampleRate: number; durationMs: number; samplesB64: string };
export type TranscriptFrame = EdgeFrame & { mtype: "transcript"; sampleRate: number; durationMs: number; samplesB64: string; text?: string };
export type ImageFrame = EdgeFrame & { mtype: "image"; imageDataUrl: string; width: number; height: number; ts: number };
export type ControlFrame = EdgeFrame & { mtype: "control"; ts: number };
export type SpatialFrame = EdgeFrame & { mtype: "spatial"; spatial: unknown; ts: number };
export type ModelFrame = EdgeFrame & { mtype: "model"; model: ModelSourceMsg; ts: number };

function encodeSamples(samples: Float32Array): string {
  return bytesToBase64(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
}

function decodeSamples(b64: string): Float32Array {
  const bytes = base64ToBytes(b64); // fresh, 4-byte-aligned buffer
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

export function buildSegmentFrame(target: string, port: string, seg: SegmentMsg): SegmentFrame {
  return {
    kind: "edge",
    target,
    port,
    mtype: "segment",
    sampleRate: seg.sampleRate,
    durationMs: seg.durationMs,
    offsetMs: seg.offsetMs,
    segmentId: seg.segmentId,
    revision: seg.revision,
    sourceId: seg.sourceId,
    samplesB64: encodeSamples(seg.samples),
  };
}

export function buildTranscriptFrame(target: string, port: string, tr: TranscriptMsg): TranscriptFrame {
  return {
    kind: "edge",
    target,
    port,
    mtype: "transcript",
    sampleRate: tr.audio.sampleRate,
    durationMs: tr.audio.durationMs,
    offsetMs: tr.audio.offsetMs,
    text: tr.text,
    lang: tr.lang,
    emotion: tr.emotion,
    event: tr.event,
    tStartMs: tr.tStartMs,
    tEndMs: tr.tEndMs,
    segmentId: tr.segmentId,
    revision: tr.revision,
    status: tr.status,
    replacesRevision: tr.replacesRevision,
    sourceId: tr.sourceId,
    samplesB64: encodeSamples(tr.audio.samples),
  };
}

export async function buildImageFrame(target: string, port: string, img: ImageMsg): Promise<ImageFrame> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("cannot encode image frame");
  ctx.drawImage(img.bitmap, 0, 0, img.width, img.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("image encode failed"));
    reader.readAsDataURL(blob);
  });
  return { kind: "edge", target, port, mtype: "image", width: img.width, height: img.height, ts: img.ts, imageDataUrl, capture: img.capture };
}

export function buildControlFrame(target: string, port: string, ctl: ControlMsg): ControlFrame {
  return { kind: "edge", target, port, mtype: "control", pulse: ctl.pulse, ts: ctl.ts };
}

export function buildSpatialFrame(target: string, port: string, msg: SpatialMsg): SpatialFrame {
  return { kind: "edge", target, port, mtype: "spatial", spatial: msg.data, ts: msg.ts };
}

export function buildModelFrame(target: string, port: string, model: ModelSourceMsg): ModelFrame {
  return { kind: "edge", target, port, mtype: "model", model, ts: Date.now() };
}

async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

export function frameToMessage(f: SegmentFrame): SegmentMsg;
export function frameToMessage(f: TranscriptFrame): TranscriptMsg;
export function frameToMessage(f: ControlFrame): ControlMsg;
export function frameToMessage(f: ImageFrame): Promise<ImageMsg>;
export function frameToMessage(f: SpatialFrame): SpatialMsg;
export function frameToMessage(f: ModelFrame): ModelSourceMsg;
export function frameToMessage(f: EdgeFrame): SegmentMsg | TranscriptMsg | ControlMsg | SpatialMsg | ModelSourceMsg | Promise<ImageMsg>;
export function frameToMessage(f: EdgeFrame): SegmentMsg | TranscriptMsg | ControlMsg | SpatialMsg | ModelSourceMsg | Promise<ImageMsg> {
  if (f.mtype === "image") {
    return dataUrlToImageBitmap(f.imageDataUrl ?? "").then((bitmap) => ({
      bitmap,
      width: f.width ?? bitmap.width,
      height: f.height ?? bitmap.height,
      ts: f.ts ?? Date.now(),
      capture: f.capture,
    }));
  }
  if (f.mtype === "control") return { pulse: f.pulse, ts: f.ts ?? Date.now() };
  if (f.mtype === "spatial") return { data: f.spatial, ts: f.ts ?? Date.now() };
  if (f.mtype === "model") return f.model!;
  const samples = decodeSamples(f.samplesB64 ?? "");
  const seg: SegmentMsg = { samples, sampleRate: f.sampleRate ?? 16000, durationMs: f.durationMs ?? 0, offsetMs: f.offsetMs, segmentId: f.mtype === "segment" ? f.segmentId : undefined, revision: f.mtype === "segment" ? f.revision : undefined, sourceId: f.mtype === "segment" ? f.sourceId : undefined };
  if (f.mtype === "transcript")
    return { text: f.text ?? "", audio: seg, lang: f.lang, emotion: f.emotion, event: f.event, tStartMs: f.tStartMs, tEndMs: f.tEndMs, segmentId: f.segmentId, revision: f.revision, status: f.status, replacesRevision: f.replacesRevision, sourceId: f.sourceId };
  return seg;
}

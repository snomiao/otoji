export const SPATIAL_CURSOR_CHANNEL = "otoji-spatial";
export const SPATIAL_CURSOR_VERSION = 1 as const;

export interface CaptureMetadata {
  facingMode: string;
  mirroredPreview: boolean;
  inferenceMirrored: boolean;
  deviceId?: string;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface SpatialCursorConfidence {
  overall: number;
  hand: number;
  depth: number;
  temporal: number;
}

export interface CalibratedHandSpace {
  kind: "calibrated-hand-space";
  finger: Point3;
  direction: Point3;
  landmarks: Array<{ x: number; y: number; z?: number }>;
  joints3d: { indexMcp: Point3; indexTip: Point3 };
  depthMeters: number;
  depthNormalized: number;
  intrinsics: { fx: number; fy: number; cx: number; cy: number; fovDegrees: number };
  skewMs: number;
  capture: CaptureMetadata;
}

export type SpatialCursorEnvelope =
  | { version: 1; type: "cursor"; ts: number; sourceId: string; state: "tracking"; space: CalibratedHandSpace; confidence: SpatialCursorConfidence; cameraToWorld?: number[] }
  | { version: 1; type: "cursor"; ts: number; sourceId: string; state: "lost"; space: null; confidence: SpatialCursorConfidence; reason: SpatialCursorFailure; cameraToWorld?: number[] };

export type SpatialCursorFailure =
  | "waiting-for-depth"
  | "hand-not-found"
  | "invalid-depth-field"
  | "invalid-landmarks"
  | "depth-out-of-range"
  | "temporal-skew"
  | "invalid-calibration";

export interface DepthFieldData { kind?: "depth-field"; width: number; height: number; values: number[] }
export interface HandSpaceData {
  kind?: "hand-landmarks";
  landmarks: Array<{ x: number; y: number; z?: number }>;
  width: number;
  height: number;
  capture?: CaptureMetadata;
}

export interface SpatialCalibrationOptions {
  nearMeters?: number;
  farMeters?: number;
  fovDegrees?: number;
  maxSkewMs?: number;
  cameraToWorld?: number[];
}

export type SpatialCalibrationResult =
  | { ok: true; space: CalibratedHandSpace; confidence: SpatialCursorConfidence; ts: number }
  | { ok: false; reason: SpatialCursorFailure; confidence: SpatialCursorConfidence; ts: number };

const ZERO_CONFIDENCE: SpatialCursorConfidence = { overall: 0, hand: 0, depth: 0, temporal: 0 };
const finite = (...xs: number[]) => xs.every(Number.isFinite);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function fail(reason: SpatialCursorFailure, ts: number, confidence: Partial<SpatialCursorConfidence> = {}): SpatialCalibrationResult {
  const c = { ...ZERO_CONFIDENCE, ...confidence };
  return { ok: false, reason, ts, confidence: { ...c, overall: Math.min(c.hand, c.depth, c.temporal) } };
}

function sampleDepth(depth: DepthFieldData, p: { x: number; y: number }): number | null {
  if (!finite(p.x, p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
  const x = Math.max(0, Math.min(depth.width - 1, Math.round(p.x * (depth.width - 1))));
  const y = Math.max(0, Math.min(depth.height - 1, Math.round(p.y * (depth.height - 1))));
  const value = depth.values[y * depth.width + x];
  return value != null && Number.isFinite(value) && value >= 0 && value <= 255 ? value / 255 : null;
}

export function calibrateSpatialCursor(
  depth: DepthFieldData | null,
  depthTs: number,
  hand: HandSpaceData | null,
  handTs: number,
  opts: SpatialCalibrationOptions = {},
): SpatialCalibrationResult {
  const timestampsValid = finite(depthTs, handTs);
  const ts = timestampsValid ? Math.max(depthTs, handTs) : 0;
  if (!depth) return fail("waiting-for-depth", ts);
  if (!Number.isInteger(depth.width) || !Number.isInteger(depth.height) || depth.width < 2 || depth.height < 2 || depth.values.length < depth.width * depth.height)
    return fail("invalid-depth-field", ts);
  if (!hand?.landmarks?.length) return fail("hand-not-found", ts, { depth: 1 });
  if (hand.landmarks.length < 21 || !finite(hand.width, hand.height) || hand.width < 2 || hand.height < 2)
    return fail("invalid-landmarks", ts, { depth: 1 });

  const maxSkewMs = opts.maxSkewMs ?? 200;
  const skewMs = Math.abs(depthTs - handTs);
  const temporal = clamp01(1 - skewMs / maxSkewMs);
  if (!timestampsValid || !finite(maxSkewMs, skewMs) || maxSkewMs <= 0 || skewMs >= maxSkewMs)
    return fail("temporal-skew", ts, { hand: 1, depth: 1, temporal });

  const near = opts.nearMeters ?? .2;
  const far = opts.farMeters ?? 2.5;
  const fovDegrees = opts.fovDegrees ?? 60;
  if (!finite(near, far, fovDegrees) || near <= 0 || far <= near || fovDegrees <= 5 || fovDegrees >= 175)
    return fail("invalid-calibration", ts, { hand: 1, depth: 1, temporal });

  const base2 = hand.landmarks[5];
  const tip2 = hand.landmarks[8];
  if (!base2 || !tip2 || !finite(base2.x, base2.y, tip2.x, tip2.y))
    return fail("invalid-landmarks", ts, { depth: 1, temporal });
  const baseDepth = sampleDepth(depth, base2);
  const tipDepth = sampleDepth(depth, tip2);
  if (baseDepth == null || tipDepth == null)
    return fail("depth-out-of-range", ts, { hand: 1, temporal });
  const railQuality = (v: number) => clamp01(Math.min(v, 1 - v) / .08);
  const depthConfidence = Math.min(railQuality(baseDepth), railQuality(tipDepth));
  if (depthConfidence === 0) return fail("depth-out-of-range", ts, { hand: 1, temporal });

  const fx = .5 * hand.width / Math.tan((fovDegrees * Math.PI / 180) / 2);
  const fy = fx;
  const cx = hand.width / 2;
  const cy = hand.height / 2;
  const reconstruct = (p: { x: number; y: number }, normalized: number): Point3 => {
    const z = near + (1 - normalized) * (far - near);
    return { x: (p.x * hand.width - cx) * z / fx, y: -(p.y * hand.height - cy) * z / fy, z };
  };
  const indexMcp = reconstruct(base2, baseDepth);
  const indexTip = reconstruct(tip2, tipDepth);
  const dx = indexTip.x - indexMcp.x, dy = indexTip.y - indexMcp.y, dz = indexTip.z - indexMcp.z;
  const length = Math.hypot(dx, dy, dz);
  if (!finite(indexMcp.x, indexMcp.y, indexMcp.z, indexTip.x, indexTip.y, indexTip.z, length) || length < 1e-5)
    return fail("invalid-landmarks", ts, { hand: .5, depth: depthConfidence, temporal });
  const handConfidence = 1;
  const confidence = { hand: handConfidence, depth: depthConfidence, temporal, overall: Math.min(handConfidence, depthConfidence, temporal) };
  return {
    ok: true,
    ts,
    confidence,
    space: {
      kind: "calibrated-hand-space",
      finger: indexTip,
      direction: { x: dx / length, y: dy / length, z: dz / length },
      landmarks: hand.landmarks,
      joints3d: { indexMcp, indexTip },
      depthMeters: indexTip.z,
      depthNormalized: tipDepth,
      intrinsics: { fx, fy, cx, cy, fovDegrees },
      skewMs,
      capture: hand.capture ?? { facingMode: "unknown", mirroredPreview: false, inferenceMirrored: false },
    },
  };
}

interface ChannelLike { postMessage(message: unknown): void; close(): void }

export class SpatialCursorPublisher {
  private channel: ChannelLike | null;
  private state: "tracking" | "lost" | null = null;

  constructor(
    readonly sourceId: string,
    private cameraToWorld?: number[],
    channelFactory: (name: string) => ChannelLike | null = (name) => typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(name),
  ) {
    this.cameraToWorld = validMatrix(cameraToWorld) ? [...cameraToWorld!] : undefined;
    this.channel = channelFactory(SPATIAL_CURSOR_CHANNEL);
  }

  publish(result: SpatialCalibrationResult): SpatialCursorEnvelope | null {
    const envelope: SpatialCursorEnvelope = result.ok
      ? { version: 1, type: "cursor", ts: result.ts, sourceId: this.sourceId, state: "tracking", space: result.space, confidence: result.confidence, ...(this.cameraToWorld ? { cameraToWorld: this.cameraToWorld } : {}) }
      : { version: 1, type: "cursor", ts: result.ts, sourceId: this.sourceId, state: "lost", space: null, confidence: result.confidence, reason: result.reason, ...(this.cameraToWorld ? { cameraToWorld: this.cameraToWorld } : {}) };
    // Tracking is a continuous cursor stream. Lost is edge-triggered to avoid spam.
    if (envelope.state === "lost" && this.state === "lost") return null;
    this.state = envelope.state;
    this.channel?.postMessage(envelope);
    return envelope;
  }

  close(ts = Date.now()): void {
    if (this.state === "tracking") this.publish(fail("hand-not-found", ts));
    this.channel?.close();
    this.channel = null;
  }
}

function validMatrix(matrix?: number[]): boolean {
  return !!matrix && matrix.length === 16 && matrix.every(Number.isFinite);
}

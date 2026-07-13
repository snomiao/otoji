import { describe, expect, it } from "vitest";
import {
  SPATIAL_CURSOR_CHANNEL,
  SpatialCursorPublisher,
  calibrateSpatialCursor,
  type DepthFieldData,
  type HandSpaceData,
} from "../graph/spatial-cursor";

const depth: DepthFieldData = {
  kind: "depth-field",
  width: 2,
  height: 2,
  values: [128, 128, 64, 192],
};

function hand(): HandSpaceData {
  const landmarks = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
  landmarks[5] = { x: .25, y: .5, z: .1 };
  landmarks[8] = { x: .75, y: .5, z: -.1 };
  return {
    kind: "hand-landmarks",
    landmarks,
    width: 100,
    height: 100,
    capture: { facingMode: "user", mirroredPreview: true, inferenceMirrored: false, deviceId: "front" },
  };
}

describe("spatial cursor calibration", () => {
  it("reconstructs MCP and fingertip at their own depths with deterministic timestamps", () => {
    const result = calibrateSpatialCursor(depth, 1_000, hand(), 1_100, { nearMeters: .2, farMeters: 2.5, fovDegrees: 60, maxSkewMs: 200 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ts).toBe(1_100);
    expect(result.space.joints3d.indexMcp.z).not.toBe(result.space.joints3d.indexTip.z);
    expect(Math.abs(result.space.direction.z)).toBeGreaterThan(.1);
    expect(Math.hypot(result.space.direction.x, result.space.direction.y, result.space.direction.z)).toBeCloseTo(1, 6);
    expect(result.space.capture).toEqual({ facingMode: "user", mirroredPreview: true, inferenceMirrored: false, deviceId: "front" });
    expect(result.confidence.overall).toBeGreaterThan(0);
  });

  it("rejects skew at the exact maximum instead of tracking at zero confidence", () => {
    const result = calibrateSpatialCursor(depth, 1_000, hand(), 1_200, { maxSkewMs: 200 });
    expect(result).toMatchObject({ ok: false, reason: "temporal-skew", ts: 1_200, confidence: { overall: 0, temporal: 0 } });
  });

  it("emits explicit failures for missing hands, rail depth, and invalid timestamps", () => {
    expect(calibrateSpatialCursor(depth, 10, { ...hand(), landmarks: [] }, 10)).toMatchObject({ ok: false, reason: "hand-not-found" });
    expect(calibrateSpatialCursor({ ...depth, values: [0, 0, 0, 255] }, 10, hand(), 10)).toMatchObject({ ok: false, reason: "depth-out-of-range" });
    expect(calibrateSpatialCursor(depth, Number.NaN, hand(), 10)).toMatchObject({ ok: false, reason: "temporal-skew", ts: 0 });
  });
});

describe("SpatialCursorPublisher", () => {
  it("uses the stable channel/envelope, streams tracking, and edge-triggers lost", () => {
    const messages: unknown[] = [];
    let channelName = "";
    let closed = false;
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const publisher = new SpatialCursorPublisher("cal-1", matrix, (name) => {
      channelName = name;
      return { postMessage: (m) => messages.push(m), close: () => { closed = true; } };
    });
    const tracking = calibrateSpatialCursor(depth, 100, hand(), 110);
    const lost = calibrateSpatialCursor(depth, 200, { ...hand(), landmarks: [] }, 200);
    publisher.publish(tracking);
    publisher.publish(tracking);
    publisher.publish(lost);
    expect(publisher.publish(lost)).toBeNull();
    publisher.close(300);

    expect(channelName).toBe(SPATIAL_CURSOR_CHANNEL);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ version: 1, type: "cursor", sourceId: "cal-1", state: "tracking", cameraToWorld: matrix });
    expect(messages[2]).toMatchObject({ state: "lost", space: null, reason: "hand-not-found", confidence: { overall: 0 } });
    expect(closed).toBe(true);
  });
});

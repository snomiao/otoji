# Spatial Cursor Broadcast Contract v1

Otoji の `spatial-calibration` node は、graph の `space` output と並行して、同一 origin の browser context に depth-aware cursor を配信する。

```ts
const channel = new BroadcastChannel("otoji-spatial");
channel.onmessage = ({ data }) => {
  if (data?.version !== 1 || data?.type !== "cursor") return;
  if (data.state === "lost") return hideCursor(data.reason);
  updateCursor(data.space, data.confidence, data.cameraToWorld);
};
```

## Origin constraint

`BroadcastChannel` は同一 origin 限定である。scheme、host、port のどれかが異なる context には届かない。たとえば `localhost:5173` から `localhost:5190` へは配信されない。consumer は otoji と同じ origin（例: `/cube/`）で提供するか、別途 `postMessage` / WebRTC relay を用意する。

## Envelope

```ts
type CursorEnvelope = {
  version: 1;
  type: "cursor";
  ts: number;                 // source frame timestamp; deterministic on replay
  sourceId: string;           // spatial-calibration node id
  state: "tracking" | "lost";
  space: CalibratedHandSpace | null;
  confidence: {
    overall: number;          // min(hand, depth, temporal), range 0..1
    hand: number;
    depth: number;
    temporal: number;
  };
  reason?: SpatialCursorFailure;
  cameraToWorld?: number[];   // 16 column-major values, capture frame → world
};
```

`tracking` は frame ごとに送られる。`lost` は状態遷移時だけ送られ、`space` は必ず `null`、`overall` は 0 になる。

## Coordinate frames

`space` は capture-camera frame で表される。

- `+X`: image right
- `+Y`: image up
- `+Z`: camera forward
- unit: meter（ただし monocular depth の near/far mapping に依存する推定値）

Three.js camera space は forward が `-Z` なので、`cameraToWorld` を指定しない最小 consumer は `(x,y,z) → (x,y,-z)` と変換する。`cameraToWorld` は capture frame の規約を変えず、capture frame から consumer world への変換だけを表す。

```ts
const p = new THREE.Vector3(space.finger.x, space.finger.y, -space.finger.z);
const d = new THREE.Vector3(space.direction.x, space.direction.y, -space.direction.z).normalize();
```

`direction` は MediaPipe landmark 5（index MCP）と 8（index tip）を、それぞれ独立した depth sample で3D復元した差分の単位 vector である。互換性のため raw `landmarks`、tip の `depthMeters` / `depthNormalized`、intrinsics も保持する。

## Tracking payload

```ts
interface CalibratedHandSpace {
  kind: "calibrated-hand-space";
  finger: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  landmarks: Array<{ x: number; y: number; z?: number }>;
  joints3d: {
    indexMcp: { x: number; y: number; z: number };
    indexTip: { x: number; y: number; z: number };
  };
  depthMeters: number;
  depthNormalized: number;
  intrinsics: { fx: number; fy: number; cx: number; cy: number; fovDegrees: number };
  skewMs: number;
  capture: {
    facingMode: string;
    mirroredPreview: boolean;
    inferenceMirrored: boolean;
    deviceId?: string;
  };
}
```

mirror は暗黙適用しない。consumer は `capture` metadata を見て必要な変換を明示的に行う。

## Failure and confidence

failure reasons:

- `waiting-for-depth`
- `hand-not-found`
- `invalid-depth-field`
- `invalid-landmarks`
- `depth-out-of-range`
- `temporal-skew`
- `invalid-calibration`

既定では depth と hand の `skewMs >= 200` を拒否する。depth confidence は normalized depth が 0/1 の rail に近いほど下がる heuristic であり、model probability ではない。現在の hand confidence も landmark set の構造検証値で、MediaPipe probability ではない。

consumer は tracking 中も smoothing（One Euro / EMA）、world-space cell boundary の hysteresis、短い lost grace period を適用することを推奨する。

## Calibration

`nearMeters`、`farMeters`、`fovDegrees` は calibration node の設定値で、既定は `0.2`、`2.5`、`60`。単眼 depth には絶対 scale ambiguity があるため、正確な metric cursor には既知平面・marker・実 depth sensor のいずれかで再校正する。

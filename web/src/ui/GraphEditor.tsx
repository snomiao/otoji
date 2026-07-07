import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type Peer } from "../net/signaling";

// Local graph node/edge types (the graph is rendered by @snomiao/rgui, not React
// Flow). `data` mirrors the old React Flow node data payload the code reads/writes.
type Node = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  selected?: boolean;
};
type Edge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  selected?: boolean;
};
import { MultiSignalingClient } from "../net/multi-signaling";
import { envTrackers, capTrackers, urlTrackers, appendTrackers, dedupeTrackers } from "../lib/trackers";
import { loadApproved, saveApproved, vetTracker } from "../lib/tracker-trust";
import { PeerMesh } from "../net/peers";
import { type DeviceOpt } from "./device-opt";
import { GraphContext } from "./graph-context";
import { GraphRuntime, nodeOwner, type TranscriptMsg } from "../graph/runtime";
import { HEAVY_NODE_TYPES, offloadType } from "../graph/model-lifecycle";
import {
  BUILTIN_TEMPLATES,
  loadUserTemplates,
  saveUserTemplate,
  deleteUserTemplate,
  templateFromSelection,
  type GraphTemplate,
} from "../lib/templates";
import { LiveStore } from "../graph/live-store";
import { fileStore, fileKindForName } from "../graph/file-store";
import { PeerMeshTransport } from "../graph/mesh-transport";
import { PreviewSync } from "../graph/preview-sync";
import { p2pModelCache } from "../providers/model/p2p-cache";
import { DEFAULT_CAMERA_FPS } from "../providers/vision/camera";
import { togglePreviewShown, isPreviewShown, shownRemoteNodes, isPeerBadgeShown, togglePeerBadgeShown, subscribePrefs } from "../lib/prefs";
import { RecordingPlayer, type Recording } from "./RecordingPlayer";
import { computePeaks } from "../lib/peaks";
import { isReadableTranscript } from "../lib/text";
import { isRoomCode, joinUrl } from "../lib/roomcode";
import { getDeviceId, getDeviceName, setDeviceName } from "../lib/device-id";
import { getRole, setRole, detectCaps, type DeviceRole } from "../lib/device-role";
import { NetworkView } from "./NetworkView";
import { JoinGate } from "./JoinGate";
import { RguiGraphView, type RguiHandlers, type RguiApi } from "./RguiGraphView";
import { NodeInspector } from "./NodeInspector";
import type { Panel, SummaryContent } from "@snomiao/rgui";
import { TimelineView } from "./TimelineView";
import type { PortType } from "../graph/model";
import {
  NODE_SPECS,
  NODE_CATEGORIES,
  canConnect,
  edgeId,
  emptyGraph,
  type NodeType,
  type VoiceGraph,
} from "../graph/model";


/** Trackers ADVERTISED by Signaling nodes in the synced graph. These are
 *  proposals from the room — untrusted until the local user approves them. */
function trackersFromNodes(ns: Node[]): string[] {
  const out: string[] = [];
  for (const n of ns) {
    if ((n.data as any).voiceType !== "tracker") continue;
    const t = (n.data as any).config?.trackers;
    if (Array.isArray(t)) out.push(...(t as string[]));
  }
  return dedupeTrackers(out);
}

/** Live tracker set this browser actually connects to: trusted env defaults plus
 *  locally-approved trackers. NEVER auto-includes remote/link proposals — those
 *  go through explicit approval (see trust model). */
function activeTrackers(approved: string[]): string[] {
  return capTrackers([...envTrackers(), ...approved]);
}

/** Port/signal-type accent colors (palette dots, etc.). */
const PORT_COLOR: Record<PortType, string> = { segment: "#dd6b20", transcript: "#2b6cb0", image: "#319795", control: "#d69e2e" };

/** localStorage key for the persisted local-mode graph (rooms use the DO). */
const LOCAL_GRAPH_KEY = "otoji.local.graph";

/** Truncate text with an ellipsis to fit `maxW` screen px in the given ctx. */
function clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

/** Human-readable throughput, e.g. 1536 -> "1.5 KB/s". */
function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

// Floating overlay card shared by the toolbar, palette, sink and view panels.
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  backdropFilter: "blur(4px)",
};

// ---- VoiceGraph <-> React Flow conversion -------------------------------
function toRF(g: VoiceGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes = Object.values(g.nodes).map((n) => ({
    id: n.id,
    type: "voice",
    position: n.pos,
    data: { voiceType: n.type, device: n.device, config: n.config ?? {} },
  }));
  const edges = g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
  }));
  return { nodes, edges };
}

function fromRF(nodes: Node[], edges: Edge[], version: number): VoiceGraph {
  const g = emptyGraph();
  g.version = version;
  for (const n of nodes) {
    g.nodes[n.id] = {
      id: n.id,
      type: (n.data as any).voiceType as NodeType,
      device: ((n.data as any).device ?? null) as string | null,
      pos: { x: n.position.x, y: n.position.y },
      config: (n.data as any).config ?? undefined,
    };
  }
  g.edges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? "out",
    target: e.target,
    targetHandle: e.targetHandle ?? "in",
  }));
  return g;
}

// --- Auto-layout: depth columns + hard non-overlap + connection spring -----
// Constraint-projection layout (position-based, no momentum):
//   0. seed each node into a COLUMN by its longest-path depth (cheap coarse
//      layout that pre-solves the slow chain-stretch mode → fast convergence);
//   1. a SOFT spring nudges connected nodes toward a rest gap and biases the
//      flow left→right (source left of its target, aligned in y);
//   2. then non-overlap is enforced as a STRONG/HARD constraint — overlapping
//      boxes (sized by each node's MEASURED box) are projected fully apart,
//      repeated until the layout is clean.
// The result is a deterministic function of (nodes, edges, sizes) — it does NOT
// read prior positions — so re-running yields the SAME tidy layout: a genuine
// fixpoint (no drift / no sparsening). Pure + deterministic, safe to broadcast.
function autoLayout(
  nodes: Node[],
  edges: Edge[],
  sizeOf: (id: string) => { w: number; h: number },
): Record<string, { x: number; y: number }> {
  // Work in box CENTERS (node.position is the top-left corner).
  const P = nodes.map((n) => {
    const { w, h } = sizeOf(n.id);
    return { id: n.id, cx: n.position.x + w / 2, cy: n.position.y + h / 2, w, h };
  });
  if (P.length === 0) return {};
  const idx = new Map(P.map((p, i) => [p.id, i] as const));
  const links = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
    .filter((l): l is [number, number] => l[0] != null && l[1] != null);

  const GAP = 40; // hard min empty space between any two boxes
  const SPRING_GAP = 64; // desired edge-to-edge gap along a connection (≥ GAP)
  const SPRING_K = 0.2; // soft spring step fraction (per endpoint)
  const SEP_LOOP = 4; // cheap approximate separation passes inside the spring loop
  // Iteration cap scaled DOWN as the graph grows so a non-converging dense graph
  // can't lock the UI: cost is ~ITERS·N², so ITERS·N² is held ≈ constant (with a
  // floor for quality on small graphs and a ceiling for big ones). Still breaks
  // early on convergence, so small/typical graphs run far fewer iterations.
  const ITERS = Math.max(80, Math.min(600, Math.round(2_000_000 / (P.length * P.length))));
  // Global budget on separation passes (each is an O(N²) pairwise scan), so the
  // total auto-arrange cost is hard-capped (~20M comparisons, tens of ms) and a
  // pathological dense/cyclic graph can never freeze the UI. The budget is sized
  // so the per-node pass allowance exceeds any realistic column height: at N=200
  // it's ~500 passes (a 200-tall column needs ~200), and this editor's graphs are
  // far smaller — so real graphs always fully de-overlap. Only an extreme graph
  // (many hundreds of dense nodes) would hit the cap, degrading gracefully (a few
  // residual overlaps) rather than hanging. settle()/the loop stop when clean OR
  // when this is exhausted; for real inputs that's always "clean".
  let sepBudget = Math.ceil(20_000_000 / (P.length * P.length));

  // Coarse initial layout: place each node in a COLUMN by its longest-path depth
  // (source→target distance), rows stacked within a column. This solves the
  // slow "stretch the whole chain" relaxation mode up front — the spring then
  // only fine-tunes — so even long pipelines converge in a few dozen iterations
  // instead of thousands. It also makes the result a deterministic function of
  // (nodes, edges, sizes): re-running gives the same layout (a true fixpoint).
  const depth = new Array(P.length).fill(0);
  for (let pass = 0; pass < P.length; pass++) {
    let changed = false;
    for (const [s, t] of links) if (depth[t] < depth[s] + 1) { depth[t] = depth[s] + 1; changed = true; }
    if (!changed) break; // (caps naturally on cycles after P.length passes)
  }
  const COL = 230, ROW = 140; // approx column/row pitch (≥ box+GAP); spring + separation refine it
  const rowOf: Record<number, number> = {};
  for (let k = 0; k < P.length; k++) {
    const d = depth[k];
    const r = (rowOf[d] = (rowOf[d] ?? 0) + 1) - 1;
    P[k].cx = d * COL;
    P[k].cy = r * ROW;
  }

  // One relaxation pass of the non-overlap constraint: project every overlapping
  // box pair apart along the axis of least penetration (half each). Returns
  // whether anything moved, so callers can stop once the layout is clean.
  const separatePass = (): boolean => {
    if (sepBudget <= 0) return false; // out of budget — stop separating (no freeze)
    sepBudget--;
    let moved = false;
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j];
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        const minX = (a.w + b.w) / 2 + GAP;
        const minY = (a.h + b.h) / 2 + GAP;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          // `|| s/2` breaks the exact dx/dy===0 tie so coincident boxes split.
          if (ox <= oy) {
            const s = (ox / 2) * (dx < 0 ? -1 : 1) || ox / 2;
            a.cx -= s; b.cx += s;
          } else {
            const s = (oy / 2) * (dy < 0 ? -1 : 1) || oy / 2;
            a.cy -= s; b.cy += s;
          }
        }
      }
    }
    return moved;
  };
  // "Separate to completion": pass until nothing overlaps or the global budget
  // runs out. Used for the initial seed and the FINAL guarantee, so the returned
  // layout has zero overlaps whenever the budget allows (always, for real graphs).
  const settle = () => { while (separatePass()) { /* until clean or out of budget */ } };

  settle(); // start from a guaranteed non-overlapping state
  for (let it = 0; it < ITERS; it++) {
    // snapshot to measure net movement this iteration (for convergence break)
    const px = P.map((p) => p.cx), py = P.map((p) => p.cy);
    // 1) soft springs: nudge connected nodes toward a rest gap to the right and
    //    into the same row. Small steps so the hard pass can always restore order.
    for (const [s, t] of links) {
      const a = P[s], b = P[t];
      const wantX = (a.w + b.w) / 2 + SPRING_GAP;
      const ex = (b.cx - a.cx) - wantX; // x error (>0 too far / <0 too close)
      const ey = b.cy - a.cy; // y error → pull into the same row
      a.cx += ex * SPRING_K; a.cy += ey * SPRING_K;
      b.cx -= ex * SPRING_K; b.cy -= ey * SPRING_K;
    }
    // 2) hard constraint: a few cheap separation passes — approximate is fine
    //    mid-relaxation (the final settle() guarantees a clean result), and it
    //    keeps per-iteration cost at O(SEP_LOOP·N²) instead of O(N³).
    for (let s = 0; s < SEP_LOOP; s++) if (!separatePass()) break;
    // Stop once the layout has settled (net per-node move below ~0.1px) so small
    // graphs don't burn the whole ITERS budget.
    let maxMove = 0;
    for (let k = 0; k < P.length; k++) {
      maxMove = Math.max(maxMove, Math.abs(P[k].cx - px[k]), Math.abs(P[k].cy - py[k]));
    }
    if (maxMove < 0.1) break;
  }
  settle(); // final guarantee: spread until truly clean (no overlaps remain)

  // Snap the whole layout so its top-left starts near a tidy origin.
  let minX = Infinity, minY = Infinity;
  for (const p of P) { minX = Math.min(minX, p.cx - p.w / 2); minY = Math.min(minY, p.cy - p.h / 2); }
  const out: Record<string, { x: number; y: number }> = {};
  for (const p of P) {
    out[p.id] = { x: Math.round(p.cx - p.w / 2 - minX + 40), y: Math.round(p.cy - p.h / 2 - minY + 40) };
  }
  return out;
}

function Editor({ initialRoom, local }: { initialRoom?: string; local?: boolean }) {
  const [room, setRoom] = useState(initialRoom ?? "");
  const [name, setName] = useState(getDeviceName());
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(!!local); // local mode: no room, runs single-device
  const myDeviceId = useMemo(() => getDeviceId(), []);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [present, setPresent] = useState<Record<string, { peerId: string; name: string; role: string; hasMic: boolean; runtime?: string; net?: string }>>({});
  const [status, setStatus] = useState("not connected");
  const [paused, setPaused] = useState(!!local); // local demo starts paused (don't grab the mic until asked)
  const [role, setRoleState] = useState<DeviceRole>(() => getRole());
  const caps = useMemo(() => detectCaps(), []);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [sinkRecs, setSinkRecs] = useState<Recording[]>([]);
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0); // periodic refresh for live counters
  const [view, setView] = useState<"graph" | "network" | "timeline">("graph");
  // Omnibox shown when a connection is dropped on empty canvas. Works in both
  // directions: drag from an OUTPUT → lists downstream nodes that accept its
  // type (new node is the target); drag from an INPUT → lists upstream nodes
  // that produce its type (new node is the source). `anchor.dir` is the type of
  // the EXISTING handle the drag started from.
  const [connectMenu, setConnectMenu] = useState<
    | null
    | {
        x: number;
        y: number;
        anchor: { nodeId: string; handleId: string; portType: PortType; dir: "source" | "target" };
        options: { type: NodeType; label: string }[];
        world?: { x: number; y: number }; // rgui: drop point in world coords
      }
  >(null);
  // Per-node context menu (right-click / long-press): duplicate/replace/remove/visibility.
  const [nodeMenu, setNodeMenu] = useState<null | { x: number; y: number; nodeId: string }>(null);
  // rgui-owned selection (click / shift-drag box). Mirrored to the canvas and
  // used by Ctrl/Cmd+A and Delete when rgui is the renderer.
  const [selected, setSelected] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;
  // rgui: currently-selected edge id (click to select, Delete to remove).
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const selectedEdgeRef = useRef<string | null>(null);
  selectedEdgeRef.current = selectedEdge;
  // rgui (@snomiao/rgui readable-grid canvas) is the ONLY renderer now.
  const useRgui = true;

  const rguiApiRef = useRef<RguiApi | null>(null); // imperative viewport (fitView/zoom)
  // set by graph-generation paths (default pipeline / template expand / arrange) so
  // the next commit snaps the whole graph to rgui's main grid (see the effect below).
  const pendingSnapRef = useRef(false);
  // 3-D billboard gizmo: drag the mic handle to tilt the graph plane (yaw/pitch),
  // double-click to flatten it. Records the base orientation + grab point on down.
  const gizmoDrag = useRef<{ x0: number; y0: number; base: { yaw: number; pitch: number; roll: number } } | null>(null);
  const sigRef = useRef<MultiSignalingClient | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const transportRef = useRef<PeerMeshTransport | null>(null);
  const runtimeRef = useRef<GraphRuntime | null>(null);
  const recCounter = useRef(0);
  const versionRef = useRef(0);
  const activityRef = useRef({ segments: 0, stt: 0 });
  const micLevelRef = useRef(0);
  const liveRef = useRef(new LiveStore());
  const previewSyncRef = useRef<PreviewSync | null>(null);
  if (!previewSyncRef.current) previewSyncRef.current = new PreviewSync(liveRef.current);
  const recordsByNodeRef = useRef(new Map<string, Recording[]>()); // uncapped, for file export
  const edgeBytesRef = useRef(new Map<string, number>()); // per-edge bytes accumulated this second
  const [edgeRates, setEdgeRates] = useState<Record<string, number>>({}); // per-edge bytes/sec
  const [lastError, setLastError] = useState<string>(""); // most recent runtime error, for bug reports
  const peerBadgeShown = useSyncExternalStore(subscribePrefs, isPeerBadgeShown, () => true);
  const fileSeqRef = useRef(0);
  const nameCacheRef = useRef<Record<string, string>>({});
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const roomRef = useRef(room);
  roomRef.current = room.trim(); // canonical room key (join/load/save must agree)

  // After a graph-generation commit, snap every node to rgui's main grid. Runs
  // AFTER RguiGraphView's setGraph effect (child effects flush before parent), so
  // the viewer already holds the new nodes. snapGraph fires onNodeMoveEnd per moved
  // node (otoji's normal broadcast path); it's idempotent so it can't loop.
  useEffect(() => {
    if (!pendingSnapRef.current) return;
    pendingSnapRef.current = false;
    rguiApiRef.current?.snapGraph();
  }, [nodes]);

  // --- Federation trust: which signaling servers (trackers) THIS browser will
  // connect to. active = trusted env defaults + locally-approved. Proposals from
  // a share link (?tr=) or a peer's Signaling node are PENDING until the local
  // user approves them here, so one participant can't move anyone else's trust. ---
  const [approved, setApproved] = useState<string[]>(() => loadApproved(initialRoom ?? ""));
  const active = useMemo(() => activeTrackers(approved), [approved]);
  const pending = useMemo(() => {
    const have = new Set(active);
    return dedupeTrackers([...urlTrackers(), ...trackersFromNodes(nodes)]).filter((t) => !have.has(t));
  }, [active, nodes]);
  const approveTracker = useCallback((url: string): string | void => {
    const { url: ok, error } = vetTracker(url, approved.length);
    if (error) return error;
    setApproved((prev) => {
      const next = dedupeTrackers([...prev, ok!]);
      saveApproved(roomRef.current, next);
      return next;
    });
  }, [approved.length]);
  const revokeTracker = useCallback((url: string) => {
    setApproved((prev) => {
      const next = prev.filter((t) => t !== url);
      saveApproved(roomRef.current, next);
      return next;
    });
  }, []);

  // Derived device list: online (present) ∪ devices referenced by node
  // assignments (shown offline). Names are cached so offline devices keep a label.
  const devices: DeviceOpt[] = useMemo(() => {
    for (const [dev, info] of Object.entries(present)) nameCacheRef.current[dev] = info.name;
    const referenced = new Set<string>();
    for (const n of nodes) {
      const dv = (n.data as any).device as string | null;
      if (dv) referenced.add(dv);
    }
    const ids = new Set<string>([myDeviceId, ...Object.keys(present), ...referenced]);
    return [...ids]
      .map((deviceId) => {
        const on = present[deviceId];
        return {
          deviceId,
          peerId: on?.peerId,
          name: on?.name ?? nameCacheRef.current[deviceId] ?? deviceId.slice(0, 6),
          online: !!on,
          me: deviceId === myDeviceId,
          role: on?.role ?? (deviceId === myDeviceId ? role : "general"),
          hasMic: on?.hasMic ?? (deviceId === myDeviceId ? caps.hasMic : true),
          runtime: on?.runtime ?? (deviceId === myDeviceId ? "browser" : undefined),
          net: on?.net,
        };
      })
      .sort((a, b) => (a.me ? -1 : b.me ? 1 : Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)));
  }, [present, nodes, myDeviceId]);

  const onlineDeviceIds = useMemo(() => Object.keys(present), [present]);
  const onlineRef = useRef<string[]>([]);
  onlineRef.current = onlineDeviceIds;

  // Keep transport routing (deviceId -> current peerId) current as peers come/go.
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const [dev, info] of Object.entries(present)) map[dev] = info.peerId;
    transportRef.current?.setRouting(map);
  }, [present]);

  // Does THIS device own (run) a node? Mirrors nodeOwner: explicit assignment, else
  // the smallest online deviceId; with no online devices known (local mode) it's ours.
  const ownsNodeHere = useCallback(
    (nodeId: string): boolean => {
      const dv = (nodesRef.current.find((n) => n.id === nodeId)?.data as any)?.device as string | null;
      const online = onlineRef.current;
      const owner = dv || (online.length ? [...online].sort()[0] : null);
      return owner == null || owner === myDeviceId;
    },
    [myDeviceId],
  );

  // Tell the room which non-owned node previews we want streamed to us. Recompute
  // on graph/presence changes (ownership) and when the user toggles a preview.
  useEffect(() => {
    const recompute = () => {
      const ps = previewSyncRef.current;
      if (!ps) return;
      const owned = new Set<string>();
      for (const n of nodesRef.current) if (ownsNodeHere(n.id)) owned.add(n.id);
      ps.setSubscriptions(shownRemoteNodes(owned));
    };
    recompute();
    return subscribePrefs(recompute);
  }, [nodes, onlineDeviceIds, ownsNodeHere]);

  useEffect(() => () => { meshRef.current?.destroy(); sigRef.current?.close(); }, []);

  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      setTick((x) => x + 1);
      // Snapshot per-edge bytes/sec over the last second, then reset the window.
      const acc = edgeBytesRef.current;
      if (acc.size) {
        const rates: Record<string, number> = {};
        for (const [k, v] of acc) rates[k] = v;
        acc.clear();
        setEdgeRates(rates);
      } else {
        setEdgeRates((prev) => (Object.keys(prev).length ? {} : prev));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [joined]);

  // Local "try it" mode: seed a runnable demo pipeline (mic → STT → translate →
  // sink = live captions + translation). Safe: no audio output, no feedback loop.
  useEffect(() => {
    if (!local) return;
    // No signaling in local mode — register this device as present so its nodes
    // aren't shown offline / treated as unassigned.
    setPresent({ [myDeviceId]: { peerId: myDeviceId, name, role, hasMic: caps.hasMic, runtime: "browser" } });
    // Remember the local layout across refreshes: restore a saved graph if any,
    // otherwise seed the runnable demo pipeline (mic → STT → translate → sink).
    try {
      const saved = localStorage.getItem(LOCAL_GRAPH_KEY);
      if (saved) {
        const g = JSON.parse(saved) as VoiceGraph;
        if (g?.nodes && Object.keys(g.nodes).length) {
          const rf = toRF(g);
          nodesRef.current = rf.nodes;
          edgesRef.current = rf.edges;
          setNodes(rf.nodes);
          setEdges(rf.edges);
          return;
        }
      }
    } catch {
      /* ignore corrupt storage → fall through to the demo seed */
    }
    const mk = (id: string, vt: NodeType, x: number): Node => ({
      id,
      type: "voice",
      position: { x, y: 150 },
      data: { voiceType: vt, device: myDeviceId, config: {} },
    });
    const ns = [mk("d-mic", "mic-vad", 40), mk("d-stt", "stt", 280), mk("d-tr", "translate", 520), mk("d-sink", "sink", 760)];
    const mkE = (s: string, sh: string, t: string, th: string): Edge => ({ id: `${s}->${t}`, source: s, sourceHandle: sh, target: t, targetHandle: th });
    const es = [mkE("d-mic", "out", "d-stt", "in"), mkE("d-stt", "out", "d-tr", "in"), mkE("d-tr", "out", "d-sink", "in")];
    nodesRef.current = ns;
    edgesRef.current = es;
    setNodes(ns);
    setEdges(es);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  // Persist the local layout on every change (local mode only; rooms sync to the
  // DO instead). Skip empty graphs so the initial mount doesn't clobber a save.
  useEffect(() => {
    if (!local || nodes.length === 0) return;
    try { localStorage.setItem(LOCAL_GRAPH_KEY, JSON.stringify(fromRF(nodes, edges, versionRef.current))); } catch { /* ignore */ }
  }, [local, nodes, edges]);

  // Frame the graph once when it first loads (demo seed / restored local layout /
  // room graph) so a saved layout is never stranded off-screen.
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current || nodes.length === 0) return;
    didFitRef.current = true;
    setTimeout(() => rguiApiRef.current?.fitView(60), 150);
  }, [nodes.length]);

  const broadcast = useCallback((ns: Node[], es: Edge[]) => {
    versionRef.current += 1;
    sigRef.current?.patchGraph(fromRF(ns, es, versionRef.current));
  }, []);

  const applyRemote = useCallback(
    (g: VoiceGraph | null) => {
      if (!g) return;
      versionRef.current = Math.max(versionRef.current, g.version ?? 0);
      const rf = toRF(g);
      setNodes(rf.nodes);
      setEdges(rf.edges);
    },
    [setNodes, setEdges],
  );

  // Re-home live signaling when the APPROVED tracker set changes. Keyed on
  // `active` (env + approved), NOT the synced graph — a peer adding a tracker
  // node can't make us connect anywhere until we approve it. setBases() diffs.
  useEffect(() => {
    if (joined) sigRef.current?.setBases(active);
  }, [active, joined]);

  // Offload a heavy model when its last node leaves the graph (frees GPU/wasm).
  // Re-adding the node lazy-loads it again. Tracks heavy types graph-wide.
  const loadedTypesRef = useRef<Set<NodeType>>(new Set());
  useEffect(() => {
    const present = new Set<NodeType>(nodes.map((n) => (n.data as any).voiceType as NodeType));
    for (const t of loadedTypesRef.current) if (!present.has(t)) offloadType(t);
    loadedTypesRef.current = new Set(HEAVY_NODE_TYPES.filter((t) => present.has(t)));
  }, [nodes]);

  function join() {
    if (joined || !room.trim()) return;
    const dn = name.trim() || "device";
    setDeviceName(dn);
    const appr = loadApproved(room.trim());
    setApproved(appr);
    const sig = new MultiSignalingClient(room.trim(), dn, myDeviceId, role, caps.hasMic, activeTrackers(appr));
    sigRef.current = sig;
    sig.on("open", () => setStatus("connected"));
    sig.on("close", () => setStatus("reconnecting…"));
    sig.on("hello", (m) => {
      setMyPeerId(m.peerId);
      setPresent(() => {
        const p: Record<string, { peerId: string; name: string; role: string; hasMic: boolean; runtime?: string; net?: string }> = {
          [myDeviceId]: { peerId: m.peerId, name: dn, role, hasMic: caps.hasMic, runtime: "browser" },
        };
        for (const peer of m.peers as Peer[]) p[peer.deviceId] = { peerId: peer.peerId, name: peer.name, role: peer.role, hasMic: peer.hasMic, runtime: peer.runtime, net: peer.net };
        return p;
      });
      applyRemote(m.graph);
      sig.getGraph();
      // (re)establish the WebRTC mesh for cross-device edge transport. Keep a
      // STABLE transport object across reconnects (just swap its mesh) so a
      // running runtime's captured transport keeps delivering frames.
      meshRef.current?.destroy();
      const mesh = new PeerMesh(sig, m.peerId, {
        onData: (peer, _label, data) => transportRef.current?.handleData(data, peer),
        onPeerState: (id, st) => {
          setPeerStates((s) => ({ ...s, [id]: st }));
          // A freshly-connected peer hasn't seen our preview subscriptions yet;
          // a dropped one may never send a signaling leave, so stop streaming to it.
          if (st === "connected") previewSyncRef.current?.resync();
          else if (st === "disconnected" || st === "failed" || st === "closed") previewSyncRef.current?.dropPeer(id);
        },
      });
      meshRef.current = mesh;
      if (!transportRef.current) transportRef.current = new PeerMeshTransport(mesh);
      else transportRef.current.setMesh(mesh);
      // Cross-device live preview: route pv/pv-sub messages to the controller and
      // give it a sender backed by the (stable) transport.
      const tp = transportRef.current;
      tp.onPreview = (msg, peer) => previewSyncRef.current?.handleMessage(msg, peer);
      previewSyncRef.current?.setSender({
        send: (peer, s) => tp.sendString(peer, s),
        broadcast: (s) => tp.broadcastString(s),
      });
      // P2P model sharing: serve cached model files to roommates, and pull missing
      // ones from the room before transformers.js falls back to the network.
      transportRef.current.onBlobRequest = (url) => p2pModelCache.getServable(url);
      p2pModelCache.fetchFromRoom = (url) => transportRef.current?.requestBlob(url) ?? Promise.resolve(null);
      // Minimal hook for e2e verification of room P2P model transfer.
      (window as any).__otojiP2P = {
        keys: () => p2pModelCache.keys(),
        requestBlob: (u: string) => transportRef.current?.requestBlob(u),
        provide: (u: string, bytes: ArrayBuffer) => p2pModelCache.provide(u, bytes),
      };
      (m.peers as Peer[]).forEach((peer) => mesh.consider(peer.peerId));
    });
    sig.on("peer-joined", (m) => {
      const peer = m.peer as Peer;
      setPresent((p) => ({ ...p, [peer.deviceId]: { peerId: peer.peerId, name: peer.name, role: peer.role, hasMic: peer.hasMic, runtime: peer.runtime, net: peer.net } }));
      meshRef.current?.consider(peer.peerId);
    });
    sig.on("peer-left", (m) => {
      if (m.peerId) previewSyncRef.current?.dropPeer(m.peerId); // stop streaming preview to a gone peer
      setPresent((p) => {
        // Ignore a stale leave for a device that has since reconnected with a
        // new peerId (only remove when the stored peerId matches).
        if (!m.deviceId || p[m.deviceId]?.peerId !== m.peerId) return p;
        const n = { ...p };
        delete n[m.deviceId];
        return n;
      });
    });
    sig.on("graph", (m) => applyRemote(m.graph));
    // Text from an external `otoji node` CLI → inject into local pipe node(s). The
    // CLI may target a specific node id or "*" (all pipe nodes in the room).
    sig.on("pipe", (m) => {
      if (m.src !== "cli") return;
      const rt = runtimeRef.current;
      if (!rt) return;
      if (m.node && m.node !== "*") rt.pipeIn(m.node, m.text);
      else for (const n of nodesRef.current) if ((n.data as any).voiceType === "pipe") rt.pipeIn(n.id, m.text);
    });
    sig.connect();
    setJoined(true);
    // Reflect the room in the address bar so it's a shareable join URL.
    if (isRoomCode(room.trim())) history.replaceState(null, "", `/${room.trim()}`);
  }

  // Auto-join when arriving via a shareable room link (otoji.org/<code>): the
  // room/name/role fields are already populated with sensible defaults, so drop
  // straight into the editor instead of showing the gate a second time. The ref
  // guards against React StrictMode's double effect-invocation opening two
  // signaling clients (setJoined hasn't re-rendered yet between the two calls).
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || local || joined) return;
    if (initialRoom && isRoomCode(initialRoom)) {
      autoJoinedRef.current = true;
      join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open GitHub's new-issue page prefilled with the current error + graph context.
  function reportIssue() {
    const ns = nodesRef.current;
    const nodeList = ns.map((n) => (n.data as any).voiceType).join(", ") || "(none)";
    const edgeList = edgesRef.current
      .map((e) => `${e.source}.${e.sourceHandle ?? "out"}→${e.target}.${e.targetHandle ?? "in"}`)
      .join("\n") || "(none)";
    const body = [
      "**What happened?**",
      "",
      "<!-- describe what you were doing -->",
      "",
      "**Error**",
      "```",
      (lastError || runStatus || "(none captured)").slice(0, 1500),
      "```",
      "**Graph** (" + ns.length + " nodes)",
      "```",
      "nodes: " + nodeList,
      edgeList,
      "```",
      "**Environment**",
      `- url: ${location.href}`,
      `- mode: ${local ? "local (single device)" : `room ${room || "(none)"} · ${devices.length} device(s)`}`,
      `- WebGPU: ${typeof navigator !== "undefined" && "gpu" in navigator ? "yes" : "no"}`,
      `- userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
    ].join("\n");
    const title = "[bug] " + (lastError ? lastError.slice(0, 90) : "");
    const url = `https://github.com/snomiao/otoji/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");
  }

  // Share link carries this browser's active extra trackers as `?tr=` params
  // (magnet-style). They arrive as PENDING proposals for the friend, who must
  // approve them before connecting — the link can't silently re-home them.
  function shareUrl(): string {
    return appendTrackers(joinUrl(room.trim(), location.origin), active);
  }

  function share() {
    const url = shareUrl();
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  const onAssign = useCallback(
    (nodeId: string, device: string | null) => {
      const next = nodesRef.current.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, device } } : n,
      );
      nodesRef.current = next; // keep ref synchronous across batched calls
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [setNodes, broadcast],
  );

  // Snap a dropped world position to the rgui readable grid so nodes/workflows
  // land aligned to the visible grid (and connected template nodes snap flush).
  const snapWorld = useCallback((p: { x: number; y: number }) => rguiApiRef.current?.snapWorld(p) ?? p, []);

  const addNode = useCallback(
    (type: NodeType, worldPos?: { x: number; y: number }) => {
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      // worldPos (from the rgui canvas drop) is in world coords; else a random spot.
      const position = worldPos ? snapWorld(worldPos) : { x: 80 + Math.random() * 120, y: 80 + Math.random() * 160 };
      const n: Node = {
        id,
        type: "voice",
        position,
        data: { voiceType: type, device: myDeviceId, config: {} },
      };
      let nextNodes = [...nodesRef.current, n];
      let nextEdges = edgesRef.current;
      // Default-pair: a Vosk streaming node is useless without continuous audio, so
      // drop in a mic-raw source wired to it — one click for live captions.
      if (type === "vosk") {
        const micId = `mic-raw-${Math.random().toString(36).slice(2, 8)}`;
        const mic: Node = {
          id: micId,
          type: "voice",
          position: { x: position.x - 220, y: position.y },
          data: { voiceType: "mic-raw", device: myDeviceId, config: {} },
        };
        const eid = edgeId({ source: micId, sourceHandle: "out", target: id, targetHandle: "in" });
        nextNodes = [...nextNodes, mic];
        nextEdges = [...nextEdges, { id: eid, source: micId, sourceHandle: "out", target: id, targetHandle: "in" }];
      }
      nodesRef.current = nextNodes; // keep refs synchronous across batched calls
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
    },
    [myDeviceId, setNodes, setEdges, broadcast],
  );

  // --- Templates: drop a subgraph onto the canvas (fresh ids, auto-selected). ---
  const [userTemplates, setUserTemplates] = useState<GraphTemplate[]>(() => loadUserTemplates());
  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...userTemplates], [userTemplates]);

  const addTemplate = useCallback(
    (tpl: GraphTemplate, screen?: { x: number; y: number }, worldPos?: { x: number; y: number }) => {
      const base = worldPos ? snapWorld(worldPos) : { x: 80 + Math.random() * 80, y: 80 + Math.random() * 80 };
      const idOf = new Map<string, string>();
      const newNodes: Node[] = tpl.nodes.map((tn) => {
        const id = `${tn.type}-${Math.random().toString(36).slice(2, 8)}`;
        idOf.set(tn.key, id);
        return {
          id,
          type: "voice",
          position: { x: base.x + tn.dx, y: base.y + tn.dy },
          selected: true,
          data: { voiceType: tn.type, device: myDeviceId, config: tn.config ? { ...tn.config } : {} },
        };
      });
      const newEdges: Edge[] = tpl.edges.map((te) => {
        const source = idOf.get(te.from)!;
        const target = idOf.get(te.to)!;
        return {
          id: edgeId({ source, sourceHandle: te.fromHandle, target, targetHandle: te.toHandle }),
          source,
          sourceHandle: te.fromHandle,
          target,
          targetHandle: te.toHandle,
          selected: true,
        };
      });
      // Deselect everything else so the dropped subgraph is the live selection.
      const nextNodes = [...nodesRef.current.map((n) => ({ ...n, selected: false })), ...newNodes];
      const nextEdges = [...edgesRef.current.map((e) => ({ ...e, selected: false })), ...newEdges];
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      pendingSnapRef.current = true; // align the expanded template to the grid
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
    },
    [myDeviceId, setNodes, setEdges, broadcast],
  );

  const saveSelectionAsTemplate = useCallback(() => {
    // rgui: the selection is the rgui-owned `selected` set; React Flow: node.selected.
    const sel = useRgui
      ? nodesRef.current.filter((n) => selectedRef.current.includes(n.id))
      : nodesRef.current.filter((n) => n.selected);
    if (sel.length === 0) {
      alert("Select one or more nodes first (Shift-drag a box, or click a node).");
      return;
    }
    const name = prompt(`Save ${sel.length} node(s) as a template named:`, "my template");
    if (!name) return;
    const tpl = templateFromSelection(
      name,
      sel.map((n) => ({ id: n.id, type: (n.data as any).voiceType, x: n.position.x, y: n.position.y, config: (n.data as any).config })),
      edgesRef.current.map((e) => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
      Math.random().toString(36).slice(2, 8),
    );
    setUserTemplates(saveUserTemplate(tpl));
  }, [useRgui]);

  const onConfig = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      const next = nodesRef.current.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: { ...((n.data as any).config ?? {}), ...patch } } } : n,
      );
      nodesRef.current = next;
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [setNodes, broadcast],
  );

  const removeNodes = useCallback(
    (nodeIds: string[], edgeIds: string[] = []) => {
      const ns = new Set(nodeIds);
      const es = new Set(edgeIds);
      if (!ns.size && !es.size) return;
      const nextNodes = nodesRef.current.filter((n) => !ns.has(n.id));
      const nextEdges = edgesRef.current.filter((e) => !es.has(e.id) && !ns.has(e.source) && !ns.has(e.target));
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
    },
    [setNodes, setEdges, broadcast],
  );

  const onDelete = useCallback((nodeId: string) => removeNodes([nodeId]), [removeNodes]);

  // Remove a single edge (rgui edge click/right-click, or Delete on a selected edge).
  const removeEdge = useCallback(
    (edgeId: string) => {
      if (!edgesRef.current.some((e) => e.id === edgeId)) return;
      const next = edgesRef.current.filter((e) => e.id !== edgeId);
      edgesRef.current = next;
      setEdges(next);
      broadcast(nodesRef.current, next);
    },
    [setEdges, broadcast],
  );

  // Clone a node (same type/device/config) slightly offset.
  const duplicateNode = useCallback(
    (nodeId: string) => {
      const n = nodesRef.current.find((x) => x.id === nodeId);
      if (!n) return;
      const vt = (n.data as any).voiceType as NodeType;
      const copyId = `${vt}-${Math.random().toString(36).slice(2, 8)}`;
      const copy: Node = {
        ...n,
        id: copyId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: false,
        data: { ...n.data, config: { ...((n.data as any).config ?? {}) } },
      };
      // File nodes keep their bytes in the per-device fileStore (keyed by node id) —
      // copy it so the duplicate actually has its file, not just the filename.
      const fe = fileStore.get(nodeId);
      if (fe) fileStore.set(copyId, { ...fe });
      const next = [...nodesRef.current, copy];
      nodesRef.current = next;
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [setNodes, broadcast],
  );

  // Change a node's type in place; drop edges that no longer type-check against it.
  const replaceNode = useCallback(
    (nodeId: string, newType: NodeType) => {
      const nextNodes = nodesRef.current.map((x) =>
        x.id === nodeId ? { ...x, data: { ...x.data, voiceType: newType, config: {} } } : x,
      );
      const typeOf = (nid: string) => (nextNodes.find((n) => n.id === nid)?.data as any)?.voiceType as NodeType | undefined;
      const portType = (t: NodeType | undefined, handle: string, dir: "in" | "out") => {
        if (!t) return undefined;
        const list = dir === "in" ? NODE_SPECS[t].inputs : NODE_SPECS[t].outputs;
        return list.find((p) => p.id === handle)?.type;
      };
      const nextEdges = edgesRef.current.filter((e) => {
        if (e.source !== nodeId && e.target !== nodeId) return true;
        const out = portType(typeOf(e.source), e.sourceHandle ?? "out", "out");
        const inp = portType(typeOf(e.target), e.targetHandle ?? "in", "in");
        return !!out && out === inp; // keep only if the port types still match
      });
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
    },
    [setNodes, setEdges, broadcast],
  );

  // Records collected at a sink/output node (oldest first) for file export — from
  // the uncapped per-node buffer (sinkRecs is capped for the live panel only).
  const getRecords = useCallback((nodeId: string) => recordsByNodeRef.current.get(nodeId) ?? [], []);

  // Associate a local file with a file-source node, then bump config (with a
  // monotonic seq so re-picking the SAME filename still restarts the runtime).
  const setFile = useCallback(
    (nodeId: string, file: File) => {
      const kind = fileKindForName(file.name) ?? "audio";
      fileStore.set(nodeId, { kind, name: file.name, file });
      onConfig(nodeId, { file: file.name, fileSeq: ++fileSeqRef.current, url: undefined }); // local file wins; clear any URL
    },
    [onConfig],
  );

  // Drag-drop a media/text file onto the canvas -> create a file-source node here.
  const addFileNodeAt = useCallback(
    (file: File, clientX: number, clientY: number, worldPos?: { x: number; y: number }) => {
      const kind = fileKindForName(file.name);
      if (!kind) return;
      const voiceType = kind === "audio" ? "file-audio" : "file-text";
      const id = `${voiceType}-${Math.random().toString(36).slice(2, 8)}`;
      const position = worldPos ? snapWorld(worldPos) : { x: 80 + Math.random() * 120, y: 80 + Math.random() * 120 };
      const n: Node = { id, type: "voice", position, data: { voiceType, device: myDeviceId, config: { file: file.name } } };
      fileStore.set(id, { kind, name: file.name, file });
      const next = [...nodesRef.current, n];
      nodesRef.current = next;
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [myDeviceId, setNodes, broadcast],
  );

  // Keyboard: Ctrl/Cmd+A selects all nodes; Delete/Backspace removes the current
  // selection (nodes + edges). Ignored while typing in a field.
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        if (useRgui) setSelected(nodesRef.current.map((n) => n.id));
        else setNodes(nodesRef.current.map((n) => ({ ...n, selected: true })));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // rgui: selection is the rgui-owned `selected` set (nodes) + `selectedEdge`.
        // React Flow: read node/edge `.selected` flags.
        const selN = useRgui ? selectedRef.current : nodesRef.current.filter((n) => n.selected).map((n) => n.id);
        const selE = useRgui
          ? selectedEdgeRef.current ? [selectedEdgeRef.current] : []
          : edgesRef.current.filter((ed) => ed.selected).map((ed) => ed.id);
        if (selN.length || selE.length) {
          e.preventDefault();
          removeNodes(selN, selE);
          if (useRgui) { setSelected([]); setSelectedEdge(null); }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, setNodes, removeNodes, useRgui]);

  // One-click pre-wired Mic+VAD -> STT -> Sink, assigned to me. Removes the
  // manual add+connect friction (the usual reason "no transcript" appears).
  const addPipeline = useCallback(() => {
    const sfx = Math.random().toString(36).slice(2, 6);
    const mic = `mic-vad-${sfx}`, stt = `stt-${sfx}`, sink = `sink-${sfx}`;
    // Distribute across devices by role (falls back to this device).
    const online = devices.filter((d) => d.online);
    const pickFor = (t: NodeType): string => {
      if (t === "mic-vad")
        return online.find((d) => d.role === "mic" && d.hasMic)?.deviceId ?? (caps.hasMic ? myDeviceId : online.find((d) => d.hasMic)?.deviceId ?? myDeviceId);
      if (t === "stt") return online.find((d) => d.role === "model")?.deviceId ?? myDeviceId;
      if (t === "sink") return online.find((d) => d.role === "viewer")?.deviceId ?? myDeviceId;
      return myDeviceId;
    };
    const mk = (id: string, type: NodeType, x: number): Node => ({
      id,
      type: "voice",
      position: { x, y: 120 },
      data: { voiceType: type, device: pickFor(type), config: {} },
    });
    const nextNodes = [...nodesRef.current, mk(mic, "mic-vad", 60), mk(stt, "stt", 320), mk(sink, "sink", 580)];
    const mkEdge = (s: string, t: string): Edge => ({ id: edgeId({ source: s, sourceHandle: "out", target: t, targetHandle: "in" }), source: s, sourceHandle: "out", target: t, targetHandle: "in" });
    const nextEdges = [...edgesRef.current, mkEdge(mic, stt), mkEdge(stt, sink)];
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    pendingSnapRef.current = true; // tidy the new pipeline onto the grid
    setNodes(nextNodes);
    setEdges(nextEdges);
    broadcast(nextNodes, nextEdges);
  }, [myDeviceId, devices, caps.hasMic, setNodes, setEdges, broadcast]);

  // Auto-arrange: relax all node positions with a box-collision spring layout so
  // boxes stop overlapping and connected nodes flow left→right, then fit the view.
  // rgui draws all nodes at a uniform width; a per-type height estimate keeps the
  // non-overlap layout roughly right without needing measured DOM sizes.
  const autoArrange = useCallback(() => {
    const sizeOf = (id: string) => {
      const t = (nodesRef.current.find((n) => n.id === id)?.data as any)?.voiceType as NodeType | undefined;
      const rows = t ? Math.max(NODE_SPECS[t].inputs.length, NODE_SPECS[t].outputs.length, 1) + 1 : 2;
      return { w: 200, h: 40 + rows * 22 };
    };
    const pos = autoLayout(nodesRef.current, edgesRef.current, sizeOf);
    const next = nodesRef.current.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n));
    nodesRef.current = next;
    pendingSnapRef.current = true; // land the spring layout on the grid
    setNodes(next);
    broadcast(next, edgesRef.current);
    setTimeout(() => rguiApiRef.current?.fitView(48), 60);
  }, [setNodes, broadcast]);

  // Create the chosen node at the drop point and wire it to the dragged handle,
  // in one synced update. If the drag started from an output the new node is the
  // target (downstream); if from an input the new node is the source (upstream).
  const createConnectedNode = useCallback(
    (type: NodeType, anchor: { nodeId: string; handleId: string; portType: PortType; dir: "source" | "target" }, worldPos?: { x: number; y: number }) => {
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      const position = worldPos ? snapWorld(worldPos) : { x: 80 + Math.random() * 120, y: 80 + Math.random() * 120 };
      const n: Node = { id, type: "voice", position, data: { voiceType: type, device: myDeviceId, config: {} } };
      let edge: Edge;
      if (anchor.dir === "source") {
        const targetHandle = NODE_SPECS[type].inputs.find((p) => p.type === anchor.portType)?.id ?? "in";
        const eid = edgeId({ source: anchor.nodeId, sourceHandle: anchor.handleId, target: id, targetHandle });
        edge = { id: eid, source: anchor.nodeId, sourceHandle: anchor.handleId, target: id, targetHandle };
      } else {
        const sourceHandle = NODE_SPECS[type].outputs.find((p) => p.type === anchor.portType)?.id ?? "out";
        const eid = edgeId({ source: id, sourceHandle, target: anchor.nodeId, targetHandle: anchor.handleId });
        edge = { id: eid, source: id, sourceHandle, target: anchor.nodeId, targetHandle: anchor.handleId };
      }
      const nextNodes = [...nodesRef.current, n];
      const nextEdges = [...edgesRef.current, edge];
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
      setConnectMenu(null);
    },
    [myDeviceId, setNodes, setEdges, broadcast],
  );

  const stopRuntime = useCallback(async () => {
    const rt = runtimeRef.current;
    runtimeRef.current = null;
    setRunning(false);
    await rt?.stop();
  }, []);

  const startRuntime = useCallback(async () => {
    if (runtimeRef.current) return;
    const graph = fromRF(nodesRef.current, edgesRef.current, versionRef.current);
    // Only run if this device owns at least one node.
    // Require the mesh transport: we're always in a room, so never fall back to
    // single-device mode (which would treat every node as local). Re-fires after hello.
    const transport = transportRef.current;
    if (!local && !transport) return; // room mode needs the mesh; local runs single-device
    const mine = local || Object.values(graph.nodes).some((n) => nodeOwner(n, onlineRef.current) === myDeviceId);
    if (!mine) {
      setRunStatus(Object.keys(graph.nodes).length ? "no nodes assigned here" : "");
      return;
    }
    activityRef.current = { segments: 0, stt: 0 };
    liveRef.current.reset();
    recordsByNodeRef.current.clear();
    const live = liveRef.current;
    const pv = previewSyncRef.current;
    const rt = new GraphRuntime(graph, {
      // Local mode: no transport -> single-device (every node runs here).
      self: transport ? { myId: myDeviceId, deviceIds: onlineRef.current, transport } : undefined,
      onStatus: (s) => setRunStatus(s),
      onError: (e) => { setRunStatus(`error: ${e.message}`); setLastError(e.message); },
      // Each preview hook updates the local store AND streams to any remote device
      // that opted into this node's preview (no-op when nobody is subscribed).
      onLevel: (id, l) => { micLevelRef.current = l.rms; live.pushLevel(id, l); pv?.onLocalPreview(id, "lvl", l); },
      onSegment: () => { activityRef.current.segments++; },
      onImage: (id, bitmap) => { live.setImage(id, bitmap); pv?.onLocalPreview(id, "img", bitmap); },
      onRecognized: (id, text) => { activityRef.current.stt++; if (isReadableTranscript(text)) { live.pushText(id, text); pv?.onLocalPreview(id, "txt", text); } },
      onNodeBusy: (id, b) => { live.setBusy(id, b); pv?.onLocalPreview(id, "busy", b); },
      onQueue: (id, processing, queued) => { live.setQueue(id, processing, queued); pv?.onLocalPreview(id, "queue", { processing, queued }); },
      hasPreviewConsumer: (id) => isPreviewShown(id) || (pv?.hasSubscriber(id) ?? false),
      onPipeOut: (id, text) => sigRef.current?.pipe(id, text, "node"), // pipe node input → CLI stdout
      onEdgeBytes: (eid, bytes) => edgeBytesRef.current.set(eid, (edgeBytesRef.current.get(eid) ?? 0) + bytes),
      onSink: (sinkId, tr: TranscriptMsg) => {
        if (!isReadableTranscript(tr.text)) return;
        live.pushText(sinkId, tr.text);
        const rec: Recording = {
          id: `g-${recCounter.current++}`,
          nodeId: sinkId,
          at: Date.now(),
          durationMs: tr.audio.durationMs,
          text: tr.text,
          peaks: computePeaks(tr.audio.samples, 400),
          sampleRate: tr.audio.sampleRate,
          samples: tr.audio.samples,
          lang: tr.lang,
          emotion: tr.emotion,
          event: tr.event,
          tStartMs: tr.tStartMs,
          tEndMs: tr.tEndMs,
        };
        const arr = recordsByNodeRef.current.get(sinkId) ?? [];
        arr.push(rec);
        recordsByNodeRef.current.set(sinkId, arr);
        setSinkRecs((prev) => [rec, ...prev].slice(0, 100));
      },
      onAudio: (nodeId, audio) => {
        // raw audio capture (audio-out seg input) — no readable-text filter
        const rec: Recording = {
          id: `a-${recCounter.current++}`,
          nodeId,
          at: Date.now(),
          durationMs: audio.durationMs,
          text: "",
          peaks: computePeaks(audio.samples, 400),
          sampleRate: audio.sampleRate,
          samples: audio.samples,
        };
        const arr = recordsByNodeRef.current.get(nodeId) ?? [];
        arr.push(rec);
        recordsByNodeRef.current.set(nodeId, arr);
        setTick((x) => x + 1); // refresh counts so audio-out's label updates promptly
      },
    });
    runtimeRef.current = rt;
    setRunning(true);
    try {
      await rt.start();
    } catch (e: any) {
      setRunStatus(`error: ${e?.message ?? e}`);
    }
  }, [myDeviceId]);

  // Structural signature — changes when the runnable graph changes (NOT on
  // node drags), so we can auto-(re)start without thrashing on every edit.
  const runtimeSig = useMemo(() => {
    const ns = nodes
      .map((n) => `${n.id}:${(n.data as any).voiceType}@${(n.data as any).device ?? ""}#${JSON.stringify((n.data as any).config ?? {})}`)
      .sort()
      .join("|");
    const es = edges.map((e) => `${e.source}.${e.sourceHandle}->${e.target}.${e.targetHandle}`).sort().join("|");
    return `${ns}#${es}#${[...onlineDeviceIds].sort().join(",")}`;
  }, [nodes, edges, onlineDeviceIds]);

  // Auto-run: start automatically once nodes are assigned; restart on structural
  // changes; stop when paused or left. No explicit Run button.
  useEffect(() => {
    if (!joined || paused) {
      stopRuntime();
      return;
    }
    const t = setTimeout(async () => {
      await stopRuntime();
      await startRuntime();
    }, 600);
    return () => clearTimeout(t);
  }, [joined, paused, runtimeSig, startRuntime, stopRuntime]);

  useEffect(() => () => { runtimeRef.current?.stop(); }, []);


  // Per-node record counts from the uncapped export buffer (sink transcripts AND
  // raw audio collected at audio-out). Recomputed on tick so memoized nodes that
  // read getRecords() (e.g. audio-out's download label) re-render as records land.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [nodeId, recs] of recordsByNodeRef.current) c[nodeId] = recs.length;
    return c;
  }, [tick, sinkRecs]);

  const currentGraph = useMemo(() => fromRF(nodes, edges, versionRef.current), [nodes, edges]);

  // rgui has no inline node widgets — every node gets a config-controls overlay
  // (device + per-type config) that rgui glues to the node and auto-hides when
  // the node isn't readable-sized. Stable identity; reads the latest node state.
  const renderNodeOverlay = useCallback((id: string) => {
    // Config controls overlay only the SELECTED node(s). Unselected nodes leave
    // their body clear so rgui's native live preview (transcript / waveform /
    // image) is visible — otherwise the controls would cover it. Reads the ref
    // (not `selected`) so this callback stays identity-stable and the rgui graph
    // memo doesn't rebuild on every selection change; the portal map re-runs on
    // selection change anyway (RguiGraphView re-renders on the `selection` prop).
    if (!selectedRef.current.includes(id)) return null;
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return null;
    const node = {
      id: n.id,
      voiceType: (n.data as any).voiceType as NodeType,
      device: ((n.data as any).device ?? null) as string | null,
      config: (n.data as any).config as Record<string, unknown> | undefined,
    };
    return <NodeInspector node={node} />;
  }, []);

  const deviceNameOf = useCallback(
    (id: string | null) => (id ? devices.find((d) => d.deviceId === id)?.name ?? id.slice(0, 6) : "unassigned"),
    [devices],
  );

  // Editing callbacks the rgui canvas drives back into otoji's authoritative
  // graph (then broadcast to the room). Mirrors the React Flow handlers.
  const rguiHandlers = useMemo<RguiHandlers>(
    () => ({
      onNodeMoveEnd: (id, pos) => {
        const next = nodesRef.current.map((n) => (n.id === id ? { ...n, position: { x: pos.x, y: pos.y } } : n));
        nodesRef.current = next;
        setNodes(next);
        broadcast(next, edgesRef.current);
      },
      isValidConnection: (from, to) =>
        canConnect(fromRF(nodesRef.current, edgesRef.current, 0), from.node, from.port, to.node, to.port),
      onConnect: (from, to) => {
        const g = fromRF(nodesRef.current, edgesRef.current, versionRef.current);
        if (!canConnect(g, from.node, from.port, to.node, to.port)) return;
        const id = edgeId({ source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port });
        const next = [...edgesRef.current, { id, source: from.node, sourceHandle: from.port, target: to.node, targetHandle: to.port }];
        edgesRef.current = next;
        setEdges(next);
        broadcast(nodesRef.current, next);
      },
      // Right-click opens the per-node menu (duplicate / replace / remove /
      // visibility). Left-click selection is handled by rgui (onSelectionChange).
      onNodeContextMenu: (id, screen) => setNodeMenu({ nodeId: id, x: screen.x, y: screen.y }),
      onSelectionChange: (ids) => setSelected(ids),
      // Edge: left-click selects (highlight; Delete removes), right-click removes.
      onEdgeClick: (edge) =>
        setSelectedEdge(edgeId({ source: edge.from.node, sourceHandle: edge.from.port, target: edge.to.node, targetHandle: edge.to.port })),
      onEdgeContextMenu: (edge) =>
        removeEdge(edgeId({ source: edge.from.node, sourceHandle: edge.from.port, target: edge.to.node, targetHandle: edge.to.port })),
      // Port drag ended on empty canvas → create-and-wire omnibox of compatible
      // node types (downstream inputs from an output; upstream outputs from an input).
      onConnectEnd: (from, at) => {
        const node = nodesRef.current.find((n) => n.id === from.node);
        if (!node) return;
        const vt = (node.data as any).voiceType as NodeType;
        const dir: "source" | "target" = from.side === "out" ? "source" : "target";
        // an input takes a single incoming edge — don't offer if already wired
        if (dir === "target" && edgesRef.current.some((e) => e.target === from.node && (e.targetHandle ?? "in") === from.port)) return;
        const portType =
          dir === "source"
            ? NODE_SPECS[vt]?.outputs.find((p) => p.id === from.port)?.type
            : NODE_SPECS[vt]?.inputs.find((p) => p.id === from.port)?.type;
        if (!portType) return;
        const options = (Object.keys(NODE_SPECS) as NodeType[])
          .filter((t) =>
            dir === "source"
              ? NODE_SPECS[t].inputs.some((p) => p.type === portType)
              : NODE_SPECS[t].outputs.some((p) => p.type === portType),
          )
          .map((t) => ({ type: t, label: NODE_SPECS[t].label }));
        if (!options.length) return;
        setConnectMenu({ x: at.screen.x, y: at.screen.y, anchor: { nodeId: from.node, handleId: from.port, portType, dir }, options, world: at.world });
      },
      onCanvasDrop: (world, dt) => {
        const f = dt.files?.[0];
        if (f) return addFileNodeAt(f, 0, 0, world);
        const tplId = dt.getData("application/otoji-template");
        if (tplId) {
          const tpl = allTemplates.find((x) => x.id === tplId);
          if (tpl) addTemplate(tpl, undefined, world);
          return;
        }
        const t = dt.getData("application/otoji-node") as NodeType;
        if (t && NODE_SPECS[t]) addNode(t, world);
      },
    }),
    [setNodes, setEdges, broadcast, addNode, addTemplate, addFileNodeAt, allTemplates, removeEdge],
  );

  // Per-edge visuals for the rgui canvas: highlight the selected edge, animate
  // (dashed) while the runtime is running, and label cross-device edges with rate.
  const edgeMeta = useCallback(
    (e: { id: string; source: string; target: string }) => {
      const selected = e.id === selectedEdge;
      const rate = edgeRates[e.id];
      return {
        dashed: running || undefined,
        style: selected ? { color: "#1a202c", width: 4 } : undefined,
        label: rate ? formatRate(rate) : undefined,
      };
    },
    [selectedEdge, edgeRates, running],
  );

  // Live node body drawn on the rgui canvas (screen-space, clipped to the body
  // region): mic waveform, latest image frame, latest transcript lines, busy dot.
  // Reads the LiveStore at draw time; RguiGraphView invalidates on live updates.
  const nodeBody = useCallback((node: { id: string; type: NodeType }) => {
    const t = node.type;
    const isMic = t === "mic-vad" || t === "mic-raw";
    const isImg = t === "camera" || t === "screen-share" || t === "paddle-ocr" || t === "vision-model";
    const isText = t === "stt" || t === "translate" || t === "sink" || t === "web-speech" || t === "vosk" || t === "model" || t === "paddle-ocr" || t === "text-diff";
    if (!isMic && !isImg && !isText) return undefined;
    const id = node.id;
    return {
      rows: isImg ? 4 : 2,
      draw: (ctx: CanvasRenderingContext2D, rect: { width: number; height: number }) => {
        const live = liveRef.current;
        if (isMic) {
          const levels = live.getLevels(id);
          const N = 48;
          const bw = rect.width / N;
          ctx.fillStyle = "#dd6b20";
          for (let i = 0; i < N; i++) {
            const lv = levels[levels.length - N + i];
            const h = Math.min(rect.height, (lv?.rms ?? 0) * rect.height * 4);
            if (h > 0.5) ctx.fillRect(i * bw, rect.height - h, Math.max(1, bw - 1), h);
          }
        } else if (isImg) {
          const img = live.getImage(id);
          if (img) {
            const s = Math.min(rect.width / img.width, rect.height / img.height);
            const w = img.width * s, h = img.height * s;
            ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h);
          }
        } else {
          const texts = live.getTexts(id);
          ctx.font = "12px system-ui, sans-serif";
          ctx.textBaseline = "top";
          // rgui draws field VALUES right-aligned and leaves ctx.textAlign="right";
          // reset it or the transcript is drawn off the left edge (invisible).
          ctx.textAlign = "left";
          // rgui nodes are dark (#2b3036); light text so transcripts are readable
          // (was #4a5568 — a light-theme leftover, invisible on the dark body).
          ctx.fillStyle = "#e6e9ec";
          let y = 0;
          for (let i = 0; i < Math.min(texts.length, 2); i++) {
            ctx.globalAlpha = 1 - i * 0.45;
            ctx.fillText(clipText(ctx, texts[i], rect.width), 0, y);
            y += 15;
          }
          ctx.globalAlpha = 1;
        }
        if (live.getBusy(id)) {
          ctx.fillStyle = "#dd6b20";
          ctx.beginPath();
          ctx.arc(rect.width - 5, 5, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  }, []);

  // Screen-space run-status HUD, drawn natively by rgui on the canvas (bottom-left)
  // instead of in the HTML sink card: mic level + segment/recognition counts +
  // run state. Reads refs (activityRef / micLevelRef) fresh each frame; RguiGraphView
  // invalidates on live events (per recognition) so the counts/level stay current.
  const hudStatus = useCallback((ctx: CanvasRenderingContext2D, size: { width: number; height: number }) => {
    // keep clear of the left node-palette panels (~190px); roughly centered on wide screens
    const x = Math.max(210, size.width / 2 - 170);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    if (running) {
      const y0 = size.height - 14;
      // status line (bottom): green dot + hint
      ctx.fillStyle = "#48bb78";
      ctx.beginPath();
      ctx.arc(x + 4, y0 - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cbd5e0";
      ctx.fillText("Running — speak to produce transcripts", x + 15, y0);
      // line above: mic level bar + counts
      const y1 = y0 - 18;
      const bw = 80, bh = 6, by = y1 - 9;
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(x, by, bw, bh);
      const lvl = Math.max(0, Math.min(1, micLevelRef.current * 6));
      ctx.fillStyle = "#48bb78";
      ctx.fillRect(x, by, bw * lvl, bh);
      ctx.fillStyle = "#8a94a6";
      ctx.fillText(`segments ${activityRef.current.segments} · recognized ${activityRef.current.stt}`, x + bw + 12, y1);
    } else {
      ctx.fillStyle = "rgba(180,190,205,0.5)";
      ctx.fillText(paused ? "paused — press Resume to start" : "Run the graph to produce transcripts.", x, size.height - 14);
    }
  }, [running, paused]);

  // Canvas-native palettes (rgui panels): a node palette per category + a
  // templates panel. Click adds at viewport center; drag drops at the world pos.
  const rguiPanels = useMemo<Panel[]>(() => {
    const kindColor = (t: NodeType) => {
      const spec = NODE_SPECS[t];
      const pt = spec.outputs[0]?.type ?? spec.inputs[0]?.type;
      return pt ? PORT_COLOR[pt] : "#a0aec0";
    };
    const nodePanels: Panel[] = NODE_CATEGORIES.map((cat) => ({
      id: `cat-${cat.id}`,
      title: cat.label,
      anchor: "left" as const,
      items: cat.types.map((t) => ({ id: t, label: NODE_SPECS[t].label, color: kindColor(t) })),
      onItemClick: (it) => addNode(it.id as NodeType),
      onItemDrop: (it, at) => addNode(it.id as NodeType, at.world),
    }));
    const tplPanel: Panel = {
      id: "templates",
      title: "Templates",
      anchor: "right",
      items: allTemplates.map((tpl) => ({ id: tpl.id, label: tpl.name })),
      onItemClick: (it) => { const tpl = allTemplates.find((x) => x.id === it.id); if (tpl) addTemplate(tpl); },
      onItemDrop: (it, at) => { const tpl = allTemplates.find((x) => x.id === it.id); if (tpl) addTemplate(tpl, undefined, at.world); },
    };
    return [...nodePanels, tplPanel];
  }, [allTemplates, addNode, addTemplate]);

  // DEV-only QA handle (like window.__rgui): drive add/inspect/connect from e2e.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__otoji = {
        addNode,
        addTemplate,
        select: (ids: string[]) => setSelected(ids),
        nodes: () => nodesRef.current,
        edges: () => edgesRef.current,
        live: liveRef.current,
      };
    }
  }, [addNode, addTemplate]);

  // Compact summary rgui renders when a node is too small for its config, or when
  // nodes merge into a pseudo-node. The host knows what each node means, so it
  // returns the key facts (device + type-specific model/lang), or a group line.
  const summarize = useCallback(
    (rgNodes: any[], info: any): SummaryContent | null => {
      if (info?.level === "pseudo") {
        const titles = rgNodes.map((n) => n.title);
        return { kind: "text", lines: [`${rgNodes.length} nodes`, titles.slice(0, 3).join(" → ")] };
      }
      const rg = rgNodes[0];
      if (!rg) return null;
      const n = nodesRef.current.find((x) => x.id === rg.id);
      const vt = (n?.data as any)?.voiceType as NodeType | undefined;
      const cfg = ((n?.data as any)?.config ?? {}) as Record<string, any>;
      const rows: [string, string][] = [["on", deviceNameOf((n?.data as any)?.device ?? null)]];
      if (vt === "stt") rows.push(["model", String(cfg.model ?? "SenseVoice")]);
      else if (vt === "translate") rows.push(["to", String(cfg.lang ?? "auto")]);
      else if (vt === "vosk" || vt === "tts-model" || vt === "model") rows.push(["model", String(cfg.model ?? "")]);
      else if (vt === "web-speech") rows.push(["lang", String(cfg.lang ?? "auto")]);
      else if (vt === "camera" || vt === "screen-share") rows.push(["fps", String(cfg.fps ?? DEFAULT_CAMERA_FPS)]);
      return { kind: "kv", rows };
    },
    [deviceNameOf],
  );

  const openNodeMenu = useCallback((nodeId: string, x: number, y: number) => setNodeMenu({ nodeId, x, y }), []);

  const trackerState = useMemo(
    () => ({ active, pending, approve: approveTracker, revoke: revokeTracker }),
    [active, pending, approveTracker, revokeTracker],
  );
  const ctx = useMemo(
    () => ({ devices, myDeviceId, onAssign, onConfig, onDelete, getRecords, setFile, counts, live: liveRef.current, openNodeMenu, trackerState }),
    [devices, myDeviceId, onAssign, onConfig, onDelete, getRecords, setFile, counts, openNodeMenu, trackerState],
  );

  if (!joined) {
    return (
      <JoinGate
        room={room}
        onRoomChange={setRoom}
        name={name}
        onNameChange={(v) => { setName(v); setDeviceName(v); }}
        role={role}
        onRoleChange={(v) => { setRoleState(v); setRole(v); }}
        submitLabel="Join"
        onSubmit={join}
        tagline="Join a room, then build a node graph. Open on multiple devices to assign nodes per device."
        footer={isRoomCode(room.trim()) && (
          <p style={{ fontSize: 12, color: "#718096", marginTop: 12 }}>
            Shareable link: <code>{shareUrl()}</code>
            <br />
            <span style={{ fontSize: 11, color: "#a0aec0" }}>
              Discoverable on {active.length} signaling server{active.length === 1 ? "" : "s"}:{" "}
              {active.map((t) => t.replace(/^https?:\/\//, "")).join(", ")}
            </span>
          </p>
        )}
      />
    );
  }

  return (
    <GraphContext.Provider value={ctx}>
      <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
        {/* full-bleed graph canvas — the whole background */}
        <div style={{ position: "absolute", inset: 0 }}>
          <RguiGraphView graph={currentGraph} deviceName={deviceNameOf} handlers={rguiHandlers} selection={selected} edgeMeta={edgeMeta} nodeBody={nodeBody} live={liveRef.current} panels={rguiPanels} renderNodeOverlay={renderNodeOverlay} summarize={summarize} hud={{ title: "otoji", subtitle: local ? "local · this device only" : `room ${room} · ${status} · ${role} · ${devices.length} device(s)` }} hudStatus={hudStatus} apiRef={rguiApiRef} />
        </div>

        {/* floating toolbar card (draggable). The "otoji" wordmark + status line
            are drawn natively by rgui on the canvas (top-left); this card carries
            only the interactive controls, sitting just below the canvas wordmark. */}
        <DraggableCard pkey="toolbar2" defaultPos={{ x: 12, y: 54 }} zIndex={11}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "2px 12px 8px", maxWidth: "calc(100vw - 48px)" }}>
          {local ? (
            <a href="/" style={{ fontSize: 12 }}>＋ create / join a room</a>
          ) : (
            <button onClick={share} style={{ fontSize: 12 }}>{copied ? "✓ link copied" : "Share link"}</button>
          )}
          <span style={{ display: "flex", gap: 4, marginLeft: 8 }}>
            {(["graph", "network", "timeline"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{ fontSize: 12, fontWeight: view === v ? 700 : 400, background: view === v ? "#ebf4ff" : undefined }}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </span>
          {view === "graph" && (
            <button onClick={addPipeline} style={{ fontSize: 12, fontWeight: 700 }}>+ Pipeline</button>
          )}
          {view === "graph" && (
            <button onClick={autoArrange} style={{ fontSize: 12 }} title="Auto-arrange nodes (spring layout, no overlapping boxes)">⤢ Arrange</button>
          )}
          {view === "graph" && (
            <button onClick={saveSelectionAsTemplate} style={{ fontSize: 12 }} title="Save the selected nodes as a reusable template">★ Save template</button>
          )}
          {view === "graph" && useRgui && (
            <span style={{ display: "flex", gap: 2 }}>
              <button onClick={() => rguiApiRef.current?.zoomBy(1.25)} style={{ fontSize: 12 }} title="Zoom in">＋</button>
              <button onClick={() => rguiApiRef.current?.zoomBy(0.8)} style={{ fontSize: 12 }} title="Zoom out">－</button>
              <button onClick={() => rguiApiRef.current?.fitView(48)} style={{ fontSize: 12 }} title="Fit graph to view">⤢ Fit</button>
              <button
                title="Drag to tilt the graph in 3-D · double-click to flatten"
                style={{ fontSize: 12, cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => {
                  const api = rguiApiRef.current;
                  if (!api) return;
                  gizmoDrag.current = { x0: e.clientX, y0: e.clientY, base: api.rotation3() };
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.currentTarget.style.cursor = "grabbing";
                }}
                onPointerMove={(e) => {
                  const d = gizmoDrag.current;
                  if (!d) return;
                  const S = 0.012; // rad per px — horizontal = yaw, vertical = pitch
                  rguiApiRef.current?.setRotation3(
                    { yaw: d.base.yaw + (e.clientX - d.x0) * S, pitch: d.base.pitch - (e.clientY - d.y0) * S },
                    { animate: false },
                  );
                }}
                onPointerUp={(e) => {
                  gizmoDrag.current = null;
                  e.currentTarget.style.cursor = "grab";
                }}
                onPointerCancel={(e) => {
                  gizmoDrag.current = null;
                  e.currentTarget.style.cursor = "grab";
                }}
                onDoubleClick={() => rguiApiRef.current?.setRotation3({ yaw: 0, pitch: 0, roll: 0 }, { animate: true })}
              >
                🎙 Tilt
              </button>
            </span>
          )}
          <button
            onClick={togglePeerBadgeShown}
            title="Show/hide each peer's connection-type badge ([wan] / [lan] / [browser])"
            style={{ fontSize: 12, fontWeight: peerBadgeShown ? 700 : 400, background: peerBadgeShown ? "#ebf4ff" : undefined }}
          >
            🏷 Peer type
          </button>
          <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
            {runStatus && <span style={{ fontSize: 12, color: runStatus.startsWith("error") ? "#e53e3e" : "#718096" }}>{runStatus}</span>}
            <span style={{ fontSize: 12, color: running ? "#2f855a" : "#a0aec0" }}>{running ? "● live" : paused ? "paused" : "idle"}</span>
            <button onClick={() => setPaused((v) => !v)} style={{ fontSize: 12 }}>{paused ? "Resume" : "Pause"}</button>
            <button
              onClick={reportIssue}
              title="Open a pre-filled GitHub issue with the current error + graph context"
              style={{ fontSize: 12, color: lastError ? "#e53e3e" : undefined, fontWeight: lastError ? 700 : 400 }}
            >
              🐞 {lastError ? "Report error" : "Report bug"}
            </button>
          </span>
        </div>
        </DraggableCard>

        {/* Node palette + templates are drawn as rgui canvas panels (see
            rguiPanels). Click a palette item to add at center, or drag it onto
            the canvas to drop at that point. */}

        {/* floating sink output card (draggable) */}
        {view === "graph" && (
          <DraggableCard pkey="sink" width={320} maxHeight="calc(100vh - 24px)" defaultPos={{ x: Math.max(12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 332), y: 12 }}>
            <div style={{ padding: "0 12px 10px" }}>
            {/* mic level + segment/recognition counts + run state are drawn natively
                by rgui on the canvas (bottom-left HUD); this card holds only the
                recordings, which need interactive audio players. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Sink output ({sinkRecs.length})</strong>
              {sinkRecs.length > 0 && (
                <button onClick={() => { setSinkRecs([]); recordsByNodeRef.current.clear(); }} style={{ fontSize: 11 }}>Clear</button>
              )}
            </div>
            {sinkRecs.length === 0 ? (
              <p style={{ color: "#a0aec0", fontSize: 12 }}>No recordings yet.</p>
            ) : (
              sinkRecs.map((r, i) => <RecordingPlayer key={r.id} rec={r} index={sinkRecs.length - 1 - i} />)
            )}
            </div>
          </DraggableCard>
        )}

        {/* network / timeline as floating overlay cards */}
        {view === "network" && (
          <div style={{ ...CARD, position: "absolute", left: 12, right: 12, top: 64, bottom: 12, overflow: "auto", padding: "12px", zIndex: 9 }}>
            <NetworkView myId={myDeviceId} devices={devices} peerStates={peerStates} graph={currentGraph} stats={transportRef.current} />
          </div>
        )}
        {view === "timeline" && (
          <div style={{ ...CARD, position: "absolute", left: 12, right: 12, top: 64, bottom: 12, overflow: "auto", padding: "12px", zIndex: 9 }}>
            <TimelineView recordings={sinkRecs} />
          </div>
        )}

        {connectMenu && (
          <ConnectMenu
            x={connectMenu.x}
            y={connectMenu.y}
            options={connectMenu.options}
            placeholder={connectMenu.anchor.dir === "source" ? "connect to…" : "connect from…"}
            onPick={(type) => createConnectedNode(type, connectMenu.anchor, connectMenu.world)}
            onClose={() => setConnectMenu(null)}
          />
        )}

        {nodeMenu && (
          <NodeMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            onDuplicate={() => { duplicateNode(nodeMenu.nodeId); setNodeMenu(null); }}
            onReplace={(type) => { replaceNode(nodeMenu.nodeId, type); setNodeMenu(null); }}
            onToggleVis={() => { togglePreviewShown(nodeMenu.nodeId, ownsNodeHere(nodeMenu.nodeId)); setNodeMenu(null); }}
            onRemove={() => { onDelete(nodeMenu.nodeId); setNodeMenu(null); }}
            onClose={() => setNodeMenu(null)}
          />
        )}
      </div>
    </GraphContext.Provider>
  );
}

// Cmd-K-style omnibox: filter compatible downstream nodes, arrow-key to choose,
// Enter to create + connect. Shown at the point an output drag was released.
function ConnectMenu({
  x,
  y,
  options,
  placeholder = "connect to…",
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  options: { type: NodeType; label: string }[];
  placeholder?: string;
  onPick: (t: NodeType) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())),
    [q, options],
  );
  useEffect(() => { setActive(0); }, [q]);
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x + 240) - 244);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y + 240) - 240);
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{ ...CARD, position: "fixed", left, top, width: 232, padding: 6, zIndex: 30 }}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(onClose, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); const sel = filtered[active]; if (sel) onPick(sel.type); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "5px 7px", border: "1px solid #cbd5e0", borderRadius: 6, outline: "none" }}
      />
      <div style={{ marginTop: 4, maxHeight: 200, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: "#a0aec0", padding: "6px 7px" }}>no compatible node</div>
        ) : (
          filtered.map((o, idx) => (
            <div
              key={o.type}
              onMouseEnter={() => setActive(idx)}
              onMouseDown={(e) => { e.preventDefault(); onPick(o.type); }}
              style={{ fontSize: 12, padding: "5px 7px", borderRadius: 5, cursor: "pointer", background: idx === active ? "#ebf4ff" : "transparent" }}
            >
              {o.label}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// A floating card the user can reposition by its grip. Position + pin state
// persist per key. Pinned (default): fixed to the screen, unaffected by pan/zoom.
// Unpinned (📍): the card lives ON the graph — rendered inside the viewport so it
// pans and zooms with the canvas like a node. The 📌 button toggles between them,
// converting the stored position between screen and flow coordinates so the card
// doesn't jump.
function DraggableCard({
  pkey,
  defaultPos,
  width,
  maxHeight,
  zIndex = 10,
  children,
}: {
  pkey: string;
  defaultPos: { x: number; y: number };
  width?: number;
  maxHeight?: string;
  zIndex?: number;
  children: React.ReactNode;
}) {
  // Panels are screen-fixed (the rgui graph canvas is the full-bleed background).
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem("otoji.panel." + pkey);
      if (s) {
        const p = JSON.parse(s);
        // Legacy graph-pinned positions stored flow coords — fall back to default.
        if (p.pinned === false) return { ...defaultPos };
        return { x: p.x ?? defaultPos.x, y: p.y ?? defaultPos.y };
      }
    } catch {
      /* ignore */
    }
    return { ...defaultPos };
  });
  const { x, y } = pos;
  const persist = (next: { x: number; y: number }) => {
    try { localStorage.setItem("otoji.panel." + pkey, JSON.stringify({ ...next, pinned: true })); } catch { /* ignore */ }
  };

  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { px: e.clientX, py: e.clientY, ox: x, oy: y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos({ x: Math.max(0, d.ox + (e.clientX - d.px)), y: Math.max(0, d.oy + (e.clientY - d.py)) });
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    persist({ x, y });
  };

  return (
    <div style={{ ...CARD, position: "fixed", left: x, top: y, width, maxHeight, overflow: maxHeight ? "auto" : undefined, zIndex }}>
      <div style={{ display: "flex", alignItems: "center", padding: "3px 6px 5px" }}>
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          title="drag to move this panel"
          style={{ flex: 1, cursor: "grab", textAlign: "center", color: "#cbd5e0", fontSize: 11, lineHeight: "11px", userSelect: "none", touchAction: "none" }}
        >
          ⠿⠿⠿
        </div>
      </div>
      {children}
    </div>
  );
}

// Right-click / long-press node menu: duplicate, replace (→ type list), toggle the
// preview, or remove. A transparent backdrop closes it on an outside click.
function NodeMenu({
  x,
  y,
  onDuplicate,
  onReplace,
  onToggleVis,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  onDuplicate: () => void;
  onReplace: (t: NodeType) => void;
  onToggleVis: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"actions" | "replace">("actions");
  const [hover, setHover] = useState<string>("");
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x + 200) - 200);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y + 280) - 280);
  const Item = ({ k, label, onClick, color }: { k: string; label: string; onClick: () => void; color?: string }) => (
    <div
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      onMouseEnter={() => setHover(k)}
      style={{ padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 13, color, background: hover === k ? "#ebf4ff" : "transparent" }}
    >
      {label}
    </div>
  );
  return (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
      <div onMouseDown={(e) => e.stopPropagation()} style={{ ...CARD, position: "fixed", left, top, width: 190, padding: 4, zIndex: 30 }}>
        {mode === "actions" ? (
          <>
            <Item k="dup" label="⧉ Duplicate" onClick={onDuplicate} />
            <Item k="rep" label="⇄ Replace…" onClick={() => setMode("replace")} />
            <Item k="vis" label="👁 Toggle preview" onClick={onToggleVis} />
            <Item k="rm" label="✕ Remove" onClick={onRemove} color="#e53e3e" />
          </>
        ) : (
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            <div style={{ padding: "4px 10px", fontSize: 11, color: "#a0aec0" }}>replace with…</div>
            {(Object.keys(NODE_SPECS) as NodeType[]).map((t) => (
              <Item key={t} k={t} label={NODE_SPECS[t].label} onClick={() => onReplace(t)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function GraphEditor({ initialRoom, local }: { initialRoom?: string; local?: boolean }) {
  return <Editor initialRoom={initialRoom} local={local} />;
}

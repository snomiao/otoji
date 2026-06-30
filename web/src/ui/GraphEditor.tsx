import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type FinalConnectionState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Peer } from "../net/signaling";
import { MultiSignalingClient } from "../net/multi-signaling";
import { envTrackers, capTrackers, urlTrackers, appendTrackers, dedupeTrackers } from "../lib/trackers";
import { loadApproved, saveApproved, vetTracker } from "../lib/tracker-trust";
import { PeerMesh } from "../net/peers";
import { VoiceNode, type DeviceOpt } from "./VoiceNode";
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
import { p2pModelCache } from "../providers/model/p2p-cache";
import { togglePreviewShown } from "../lib/prefs";
import { RecordingPlayer, type Recording } from "./RecordingPlayer";
import { computePeaks } from "../lib/peaks";
import { isReadableTranscript } from "../lib/text";
import { generateRoomCode, isRoomCode, joinUrl } from "../lib/roomcode";
import { getDeviceId, getDeviceName, setDeviceName, generateDeviceName } from "../lib/device-id";
import { getRole, setRole, detectCaps, ROLES, type DeviceRole } from "../lib/device-role";
import { NetworkView } from "./NetworkView";
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

const nodeTypes = { voice: VoiceNode };

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

function Editor({ initialRoom, local }: { initialRoom?: string; local?: boolean }) {
  const [room, setRoom] = useState(initialRoom ?? "");
  const [name, setName] = useState(getDeviceName());
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(!!local); // local mode: no room, runs single-device
  const myDeviceId = useMemo(() => getDeviceId(), []);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [present, setPresent] = useState<Record<string, { peerId: string; name: string; role: string; hasMic: boolean }>>({});
  const [status, setStatus] = useState("not connected");
  const [paused, setPaused] = useState(!!local); // local demo starts paused (don't grab the mic until asked)
  const [role, setRoleState] = useState<DeviceRole>(() => getRole());
  const caps = useMemo(() => detectCaps(), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [sinkRecs, setSinkRecs] = useState<Recording[]>([]);
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0); // periodic refresh for live counters
  const [view, setView] = useState<"graph" | "network" | "timeline">("graph");
  // Omnibox shown when an output connection is dropped on empty canvas — lists
  // only downstream node types whose input port type matches the dragged output.
  const [connectMenu, setConnectMenu] = useState<
    | null
    | {
        x: number;
        y: number;
        source: { nodeId: string; handleId: string; portType: PortType };
        options: { type: NodeType; label: string }[];
      }
  >(null);
  // Per-node context menu (right-click / long-press): duplicate/replace/remove/visibility.
  const [nodeMenu, setNodeMenu] = useState<null | { x: number; y: number; nodeId: string }>(null);

  const sigRef = useRef<MultiSignalingClient | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const transportRef = useRef<PeerMeshTransport | null>(null);
  const runtimeRef = useRef<GraphRuntime | null>(null);
  const recCounter = useRef(0);
  const versionRef = useRef(0);
  const activityRef = useRef({ segments: 0, stt: 0 });
  const micLevelRef = useRef(0);
  const liveRef = useRef(new LiveStore());
  const recordsByNodeRef = useRef(new Map<string, Recording[]>()); // uncapped, for file export
  const edgeBytesRef = useRef(new Map<string, number>()); // per-edge bytes accumulated this second
  const [edgeRates, setEdgeRates] = useState<Record<string, number>>({}); // per-edge bytes/sec
  const [lastError, setLastError] = useState<string>(""); // most recent runtime error, for bug reports
  const fileSeqRef = useRef(0);
  const nameCacheRef = useRef<Record<string, string>>({});
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const roomRef = useRef(room);
  roomRef.current = room.trim(); // canonical room key (join/load/save must agree)

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
    setPresent({ [myDeviceId]: { peerId: myDeviceId, name, role, hasMic: caps.hasMic } });
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
        const p: Record<string, { peerId: string; name: string; role: string; hasMic: boolean }> = {
          [myDeviceId]: { peerId: m.peerId, name: dn, role, hasMic: caps.hasMic },
        };
        for (const peer of m.peers as Peer[]) p[peer.deviceId] = { peerId: peer.peerId, name: peer.name, role: peer.role, hasMic: peer.hasMic };
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
        onPeerState: (id, st) => setPeerStates((s) => ({ ...s, [id]: st })),
      });
      meshRef.current = mesh;
      if (!transportRef.current) transportRef.current = new PeerMeshTransport(mesh);
      else transportRef.current.setMesh(mesh);
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
      setPresent((p) => ({ ...p, [peer.deviceId]: { peerId: peer.peerId, name: peer.name, role: peer.role, hasMic: peer.hasMic } }));
      meshRef.current?.consider(peer.peerId);
    });
    sig.on("peer-left", (m) => {
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

  const rf = useReactFlow();

  const addNode = useCallback(
    (type: NodeType, screen?: { x: number; y: number }) => {
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      const position = screen
        ? rf.screenToFlowPosition(screen)
        : { x: 80 + Math.random() * 120, y: 80 + Math.random() * 160 };
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
    [myDeviceId, setNodes, setEdges, broadcast, rf],
  );

  // --- Templates: drop a subgraph onto the canvas (fresh ids, auto-selected). ---
  const [userTemplates, setUserTemplates] = useState<GraphTemplate[]>(() => loadUserTemplates());
  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...userTemplates], [userTemplates]);

  const addTemplate = useCallback(
    (tpl: GraphTemplate, screen?: { x: number; y: number }) => {
      const base = screen ? rf.screenToFlowPosition(screen) : { x: 80 + Math.random() * 80, y: 80 + Math.random() * 80 };
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
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
    },
    [myDeviceId, setNodes, setEdges, broadcast, rf],
  );

  const saveSelectionAsTemplate = useCallback(() => {
    const sel = nodesRef.current.filter((n) => n.selected);
    if (sel.length === 0) {
      alert("Select one or more nodes first (Shift-drag a box, or Shift-click).");
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
  }, []);

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
    (file: File, clientX: number, clientY: number) => {
      const kind = fileKindForName(file.name);
      if (!kind) return;
      const voiceType = kind === "audio" ? "file-audio" : "file-text";
      const id = `${voiceType}-${Math.random().toString(36).slice(2, 8)}`;
      const position = rf.screenToFlowPosition({ x: clientX, y: clientY });
      const n: Node = { id, type: "voice", position, data: { voiceType, device: myDeviceId, config: { file: file.name } } };
      fileStore.set(id, { kind, name: file.name, file });
      const next = [...nodesRef.current, n];
      nodesRef.current = next;
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [rf, myDeviceId, setNodes, broadcast],
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
        setNodes(nodesRef.current.map((n) => ({ ...n, selected: true })));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const selN = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
        const selE = edgesRef.current.filter((ed) => ed.selected).map((ed) => ed.id);
        if (selN.length || selE.length) {
          e.preventDefault();
          removeNodes(selN, selE);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, setNodes, removeNodes]);

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
    setNodes(nextNodes);
    setEdges(nextEdges);
    broadcast(nextNodes, nextEdges);
  }, [myDeviceId, devices, caps.hasMic, setNodes, setEdges, broadcast]);

  const onConnect = useCallback(
    (params: Connection) => {
      const g = fromRF(nodesRef.current, edgesRef.current, versionRef.current);
      if (!canConnect(g, params.source!, params.sourceHandle ?? "out", params.target!, params.targetHandle ?? "in")) {
        setStatus("✗ incompatible ports");
        return;
      }
      const id = edgeId({
        source: params.source!,
        sourceHandle: params.sourceHandle ?? "out",
        target: params.target!,
        targetHandle: params.targetHandle ?? "in",
      });
      const next = addEdge({ ...params, id }, edgesRef.current);
      edgesRef.current = next; // keep ref synchronous across batched calls
      setEdges(next);
      broadcast(nodesRef.current, next);
    },
    [setEdges, broadcast],
  );

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const g = fromRF(nodesRef.current, edgesRef.current, 0);
    return canConnect(g, c.source!, c.sourceHandle ?? "out", c.target!, c.targetHandle ?? "in");
  }, []);

  // Dropping a connection on empty canvas opens the omnibox (instead of doing
  // nothing) listing the node types that can accept this output's port type.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, conn: FinalConnectionState) => {
    if (conn.isValid) return; // landed on a real handle → onConnect already wired it
    // Only treat as empty-canvas: an invalid drop ONTO a handle/node (e.g. a
    // mismatched port) should just be rejected, not open the omnibox over it.
    if (conn.toHandle || conn.toNode) return;
    const from = conn.fromHandle;
    const fromNode = conn.fromNode;
    if (!from || from.type !== "source" || !fromNode) return; // only from an output
    const vt = (fromNode.data as any)?.voiceType as NodeType | undefined;
    const portType = vt ? NODE_SPECS[vt]?.outputs.find((p) => p.id === (from.id ?? "out"))?.type : undefined;
    if (!portType) return;
    const options = (Object.keys(NODE_SPECS) as NodeType[])
      .filter((t) => NODE_SPECS[t].inputs.some((p) => p.type === portType))
      .map((t) => ({ type: t, label: NODE_SPECS[t].label }));
    if (!options.length) return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : (event as MouseEvent);
    setConnectMenu({ x: pt.clientX, y: pt.clientY, source: { nodeId: fromNode.id, handleId: from.id ?? "out", portType }, options });
  }, []);

  // Create the chosen downstream node at the drop point and wire the dragged
  // output into its matching input, in one synced update.
  const createConnectedNode = useCallback(
    (type: NodeType, src: { nodeId: string; handleId: string; portType: PortType }, screen: { x: number; y: number }) => {
      const targetHandle = NODE_SPECS[type].inputs.find((p) => p.type === src.portType)?.id ?? "in";
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      const position = rf.screenToFlowPosition(screen);
      const n: Node = { id, type: "voice", position, data: { voiceType: type, device: myDeviceId, config: {} } };
      const eid = edgeId({ source: src.nodeId, sourceHandle: src.handleId, target: id, targetHandle });
      const edge: Edge = { id: eid, source: src.nodeId, sourceHandle: src.handleId, target: id, targetHandle };
      const nextNodes = [...nodesRef.current, n];
      const nextEdges = [...edgesRef.current, edge];
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      broadcast(nextNodes, nextEdges);
      setConnectMenu(null);
    },
    [rf, myDeviceId, setNodes, setEdges, broadcast],
  );

  const afterDelete = useCallback(() => {
    // state settles via onNodesChange/onEdgesChange first
    setTimeout(() => broadcast(nodesRef.current, edgesRef.current), 0);
  }, [broadcast]);

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
    const rt = new GraphRuntime(graph, {
      // Local mode: no transport -> single-device (every node runs here).
      self: transport ? { myId: myDeviceId, deviceIds: onlineRef.current, transport } : undefined,
      onStatus: (s) => setRunStatus(s),
      onError: (e) => { setRunStatus(`error: ${e.message}`); setLastError(e.message); },
      onLevel: (id, l) => { micLevelRef.current = l.rms; live.pushLevel(id, l); },
      onSegment: () => { activityRef.current.segments++; },
      onImage: (id, bitmap) => live.setImage(id, bitmap),
      onRecognized: (id, text) => { activityRef.current.stt++; if (isReadableTranscript(text)) live.pushText(id, text); },
      onNodeBusy: (id, b) => live.setBusy(id, b),
      onQueue: (id, processing, queued) => live.setQueue(id, processing, queued),
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

  const PORT_COLOR: Record<PortType, string> = { segment: "#dd6b20", transcript: "#2b6cb0", image: "#319795", control: "#d69e2e" };
  // Color edges by their source port type; animate while running (data in motion).
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const src = nodes.find((n) => n.id === e.source);
        const t = src
          ? NODE_SPECS[(src.data as any).voiceType as NodeType].outputs.find((o) => o.id === (e.sourceHandle ?? "out"))?.type
          : undefined;
        const stroke = t ? PORT_COLOR[t] : "#b0b6c0";
        const rate = edgeRates[e.id]; // cross-device bytes/sec on this edge
        return {
          ...e,
          animated: running,
          interactionWidth: 24, // wider invisible hit area so edges are easy to click
          style: e.selected
            ? { stroke: "#1a202c", strokeWidth: 4 }
            : { stroke, strokeWidth: 2 },
          label: rate ? formatRate(rate) : undefined,
          labelStyle: { fontSize: 10, fill: "#2d3748" },
          labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
          labelBgPadding: [3, 1] as [number, number],
        };
      }),
    [edges, nodes, running, edgeRates],
  );

  // Per-node record counts from the uncapped export buffer (sink transcripts AND
  // raw audio collected at audio-out). Recomputed on tick so memoized nodes that
  // read getRecords() (e.g. audio-out's download label) re-render as records land.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [nodeId, recs] of recordsByNodeRef.current) c[nodeId] = recs.length;
    return c;
  }, [tick, sinkRecs]);

  const currentGraph = useMemo(() => fromRF(nodes, edges, versionRef.current), [nodes, edges]);

  const openNodeMenu = useCallback((nodeId: string, x: number, y: number) => setNodeMenu({ nodeId, x, y }), []);

  const trackerState = useMemo(
    () => ({ active, pending, approve: approveTracker, revoke: revokeTracker }),
    [active, pending, approveTracker, revokeTracker],
  );
  const ctx = useMemo(
    () => ({ devices, onAssign, onConfig, onDelete, getRecords, setFile, counts, live: liveRef.current, openNodeMenu, trackerState }),
    [devices, onAssign, onConfig, onDelete, getRecords, setFile, counts, openNodeMenu, trackerState],
  );

  if (!joined) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "60px auto", padding: 16 }}>
        <h1>otoji · voice graph</h1>
        <p style={{ color: "#666", fontSize: 13 }}>
          Join a room (pairing code), then build a node graph. Open on multiple devices to assign nodes per device.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="room code" value={room} onChange={(e) => setRoom(e.target.value)} style={{ width: 150 }} />
          <input
            placeholder="your name"
            value={name}
            onChange={(e) => { setName(e.target.value); setDeviceName(e.target.value); }}
            style={{ width: 120 }}
          />
          <button onClick={() => { const n = generateDeviceName(); setName(n); setDeviceName(n); }} title="random name">🎲</button>
          <select value={role} onChange={(e) => { setRoleState(e.target.value as DeviceRole); setRole(e.target.value as DeviceRole); }} title="this device's role">
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button onClick={() => setRoom(generateRoomCode())}>new room</button>
          <button onClick={join} disabled={!room.trim()}>Join</button>
        </div>
        {isRoomCode(room.trim()) && (
          <p style={{ fontSize: 12, color: "#718096", marginTop: 10 }}>
            Shareable link: <code>{shareUrl()}</code>
            <br />
            <span style={{ fontSize: 11, color: "#a0aec0" }}>
              Discoverable on {active.length} signaling server{active.length === 1 ? "" : "s"}:{" "}
              {active.map((t) => t.replace(/^https?:\/\//, "")).join(", ")}
            </span>
          </p>
        )}
      </div>
    );
  }

  return (
    <GraphContext.Provider value={ctx}>
      <div style={{ position: "relative", height: "100vh", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
        {/* full-bleed graph canvas — the whole background */}
        <div style={{ position: "absolute", inset: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            onNodeContextMenu={(e, n) => { e.preventDefault(); setNodeMenu({ nodeId: n.id, x: e.clientX, y: e.clientY }); }}
            onNodeDragStop={() => broadcast(nodesRef.current, edgesRef.current)}
            onNodesDelete={afterDelete}
            onEdgesDelete={afterDelete}
            deleteKeyCode={["Delete"]}
            selectionOnDrag
            panOnDrag={[1, 2]}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) { addFileNodeAt(f, e.clientX, e.clientY); return; }
              const tplId = e.dataTransfer.getData("application/otoji-template");
              if (tplId) {
                const tpl = allTemplates.find((x) => x.id === tplId);
                if (tpl) addTemplate(tpl, { x: e.clientX, y: e.clientY });
                return;
              }
              const t = e.dataTransfer.getData("application/otoji-node") as NodeType;
              if (t && NODE_SPECS[t]) addNode(t, { x: e.clientX, y: e.clientY });
            }}
            fitView
          >
            <Background />
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        {/* floating title / toolbar card (draggable) */}
        <DraggableCard pkey="toolbar" defaultPos={{ x: 12, y: 12 }} zIndex={11}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "2px 12px 8px", maxWidth: "calc(100vw - 48px)" }}>
          <strong>otoji</strong>
          <span style={{ fontSize: 12, color: "#718096" }}>
            {local ? "local · this device only" : `room ${room} · ${status} · ${role} · ${devices.length} device(s)`}
          </span>
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

        {/* floating node palette — drag a folded node onto the canvas (or click). The
            panel itself is draggable by its grip. */}
        {view === "graph" && (
          <DraggableCard pkey="palette" width={188} maxHeight="calc(100vh - 120px)" defaultPos={{ x: 12, y: Math.max(64, (typeof window !== "undefined" ? window.innerHeight : 800) - 420) }}>
            <div style={{ padding: "0 10px 8px" }}>
            <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 6 }}>drag onto canvas — or click to add</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {NODE_CATEGORIES.map((cat) => (
                <div key={cat.id}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#a0aec0", margin: "0 0 3px 1px" }}>{cat.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {cat.types.map((t) => {
                      const spec = NODE_SPECS[t];
                      const dot = (spec.outputs[0]?.type ?? spec.inputs[0]?.type ?? "transcript") as PortType;
                      return (
                        <div
                          key={t}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/otoji-node", t);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => addNode(t)}
                          title={`drag onto canvas or click to add — ${spec.label}`}
                          style={{ cursor: "grab", border: "1px solid #cbd5e0", borderRadius: 6, background: "#fff", padding: "4px 8px", fontSize: 11, display: "flex", gap: 6, alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: 4, background: PORT_COLOR[dot], flex: "none" }} />
                          {spec.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            </div>
          </DraggableCard>
        )}

        {/* floating templates card — drag a template onto the canvas to drop a
            ready-made subgraph (auto-selected). */}
        {view === "graph" && (
          <DraggableCard pkey="templates" width={196} maxHeight="calc(100vh - 120px)" defaultPos={{ x: 220, y: Math.max(64, (typeof window !== "undefined" ? window.innerHeight : 800) - 360) }}>
            <div style={{ padding: "0 10px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#a0aec0" }}>drag a template onto canvas</span>
                <button className="nodrag" onClick={saveSelectionAsTemplate} title="Save the selected nodes as a template" style={{ fontSize: 10 }}>+ save sel</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {allTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="nodrag"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/otoji-template", tpl.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addTemplate(tpl)}
                    title={tpl.desc || tpl.name}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 7px", cursor: "grab", background: "#fff" }}
                  >
                    <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tpl.builtin ? "◫" : "★"} {tpl.name}
                    </span>
                    {!tpl.builtin && (
                      <button
                        className="nodrag"
                        onClick={(e) => { e.stopPropagation(); setUserTemplates(deleteUserTemplate(tpl.id)); }}
                        title="delete template"
                        style={{ fontSize: 10, border: "none", background: "transparent", cursor: "pointer", color: "#a0aec0" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </DraggableCard>
        )}

        {/* floating sink output card (draggable) */}
        {view === "graph" && (
          <DraggableCard pkey="sink" width={320} maxHeight="calc(100vh - 24px)" defaultPos={{ x: Math.max(12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 332), y: 12 }}>
            <div style={{ padding: "0 12px 10px" }}>
            {running && (
              <div style={{ fontSize: 11, color: "#718096", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  mic
                  <span style={{ display: "inline-block", width: 80, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.min(100, micLevelRef.current * 600)}%`, background: "#2f855a" }} />
                  </span>
                </div>
                <div>segments {activityRef.current.segments} · recognized {activityRef.current.stt}</div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Sink output ({sinkRecs.length})</strong>
              {sinkRecs.length > 0 && (
                <button onClick={() => { setSinkRecs([]); recordsByNodeRef.current.clear(); }} style={{ fontSize: 11 }}>Clear</button>
              )}
            </div>
            {sinkRecs.length === 0 ? (
              <p style={{ color: "#a0aec0", fontSize: 12 }}>
                {running ? "Running — speak to produce transcripts." : "Run the graph to produce transcripts."}
              </p>
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
            onPick={(type) => createConnectedNode(type, connectMenu.source, { x: connectMenu.x, y: connectMenu.y })}
            onClose={() => setConnectMenu(null)}
          />
        )}

        {nodeMenu && (
          <NodeMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            onDuplicate={() => { duplicateNode(nodeMenu.nodeId); setNodeMenu(null); }}
            onReplace={(type) => { replaceNode(nodeMenu.nodeId, type); setNodeMenu(null); }}
            onToggleVis={() => { togglePreviewShown(nodeMenu.nodeId); setNodeMenu(null); }}
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
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  options: { type: NodeType; label: string }[];
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
        placeholder="connect to…"
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

// A floating card the user can reposition by its grip. Position persists per key.
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
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem("otoji.panel." + pkey);
      if (s) return JSON.parse(s);
    } catch {
      /* ignore */
    }
    return defaultPos;
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos({ x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) });
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    try { localStorage.setItem("otoji.panel." + pkey, JSON.stringify(pos)); } catch { /* ignore */ }
  };
  return (
    <div style={{ ...CARD, position: "fixed", left: pos.x, top: pos.y, width, maxHeight, overflow: maxHeight ? "auto" : undefined, zIndex }}>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        title="drag to move this panel"
        style={{ cursor: "grab", textAlign: "center", color: "#cbd5e0", fontSize: 11, lineHeight: "11px", padding: "3px 0 5px", userSelect: "none", touchAction: "none" }}
      >
        ⠿⠿⠿
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
  return (
    <ReactFlowProvider>
      <Editor initialRoom={initialRoom} local={local} />
    </ReactFlowProvider>
  );
}

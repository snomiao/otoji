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
import { SignalingClient, type Peer } from "../net/signaling";
import { PeerMesh } from "../net/peers";
import { VoiceNode, type DeviceOpt } from "./VoiceNode";
import { GraphContext } from "./graph-context";
import { GraphRuntime, nodeOwner, type TranscriptMsg } from "../graph/runtime";
import { LiveStore } from "../graph/live-store";
import { fileStore, fileKindForName } from "../graph/file-store";
import { PeerMeshTransport } from "../graph/mesh-transport";
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
  canConnect,
  edgeId,
  emptyGraph,
  type NodeType,
  type VoiceGraph,
} from "../graph/model";

const nodeTypes = { voice: VoiceNode };

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

function Editor({ initialRoom }: { initialRoom?: string }) {
  const [room, setRoom] = useState(initialRoom ?? "");
  const [name, setName] = useState(getDeviceName());
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const myDeviceId = useMemo(() => getDeviceId(), []);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [present, setPresent] = useState<Record<string, { peerId: string; name: string; role: string; hasMic: boolean }>>({});
  const [status, setStatus] = useState("not connected");
  const [paused, setPaused] = useState(false);
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

  const sigRef = useRef<SignalingClient | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const transportRef = useRef<PeerMeshTransport | null>(null);
  const runtimeRef = useRef<GraphRuntime | null>(null);
  const recCounter = useRef(0);
  const versionRef = useRef(0);
  const activityRef = useRef({ segments: 0, stt: 0 });
  const micLevelRef = useRef(0);
  const liveRef = useRef(new LiveStore());
  const recordsByNodeRef = useRef(new Map<string, Recording[]>()); // uncapped, for file export
  const fileSeqRef = useRef(0);
  const nameCacheRef = useRef<Record<string, string>>({});
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

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
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [joined]);

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

  function join() {
    if (joined || !room.trim()) return;
    const dn = name.trim() || "device";
    setDeviceName(dn);
    const sig = new SignalingClient(room.trim(), dn, myDeviceId, role, caps.hasMic);
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
        onData: (_peer, _label, data) => transportRef.current?.handleData(data),
        onPeerState: (id, st) => setPeerStates((s) => ({ ...s, [id]: st })),
      });
      meshRef.current = mesh;
      if (!transportRef.current) transportRef.current = new PeerMeshTransport(mesh);
      else transportRef.current.setMesh(mesh);
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
    sig.connect();
    setJoined(true);
    // Reflect the room in the address bar so it's a shareable join URL.
    if (isRoomCode(room.trim())) history.replaceState(null, "", `/${room.trim()}`);
  }

  function share() {
    const url = joinUrl(room.trim(), location.origin);
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
      const next = [...nodesRef.current, n];
      nodesRef.current = next; // keep ref synchronous across batched calls
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [myDeviceId, setNodes, broadcast, rf],
  );

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

  // Records collected at a sink/output node (oldest first) for file export — from
  // the uncapped per-node buffer (sinkRecs is capped for the live panel only).
  const getRecords = useCallback((nodeId: string) => recordsByNodeRef.current.get(nodeId) ?? [], []);

  // Associate a local file with a file-source node, then bump config (with a
  // monotonic seq so re-picking the SAME filename still restarts the runtime).
  const setFile = useCallback(
    (nodeId: string, file: File) => {
      const kind = fileKindForName(file.name) ?? "audio";
      fileStore.set(nodeId, { kind, name: file.name, file });
      onConfig(nodeId, { file: file.name, fileSeq: ++fileSeqRef.current });
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
    if (!transport) return;
    const mine = Object.values(graph.nodes).some((n) => nodeOwner(n, onlineRef.current) === myDeviceId);
    if (!mine) {
      setRunStatus(Object.keys(graph.nodes).length ? "no nodes assigned here" : "");
      return;
    }
    activityRef.current = { segments: 0, stt: 0 };
    liveRef.current.reset();
    recordsByNodeRef.current.clear();
    const live = liveRef.current;
    const rt = new GraphRuntime(graph, {
      self: { myId: myDeviceId, deviceIds: onlineRef.current, transport },
      onStatus: (s) => setRunStatus(s),
      onError: (e) => setRunStatus(`error: ${e.message}`),
      onLevel: (id, l) => { micLevelRef.current = l.rms; live.pushLevel(id, l); },
      onSegment: () => { activityRef.current.segments++; },
      onRecognized: (id, text) => { activityRef.current.stt++; if (isReadableTranscript(text)) live.pushText(id, text); },
      onNodeBusy: (id, b) => live.setBusy(id, b),
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

  const PORT_COLOR: Record<PortType, string> = { segment: "#dd6b20", transcript: "#2b6cb0" };
  // Color edges by their source port type; animate while running (data in motion).
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const src = nodes.find((n) => n.id === e.source);
        const t = src
          ? NODE_SPECS[(src.data as any).voiceType as NodeType].outputs.find((o) => o.id === (e.sourceHandle ?? "out"))?.type
          : undefined;
        const stroke = t ? PORT_COLOR[t] : "#b0b6c0";
        return {
          ...e,
          animated: running,
          interactionWidth: 24, // wider invisible hit area so edges are easy to click
          style: e.selected
            ? { stroke: "#1a202c", strokeWidth: 4 }
            : { stroke, strokeWidth: 2 },
        };
      }),
    [edges, nodes, running],
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

  const ctx = useMemo(
    () => ({ devices, onAssign, onConfig, onDelete, getRecords, setFile, counts, live: liveRef.current }),
    [devices, onAssign, onConfig, onDelete, getRecords, setFile, counts],
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
            Shareable link: <code>{joinUrl(room.trim(), location.origin)}</code>
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
            onNodeDragStop={() => broadcast(nodesRef.current, edgesRef.current)}
            onNodesDelete={afterDelete}
            onEdgesDelete={afterDelete}
            deleteKeyCode={null}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) { addFileNodeAt(f, e.clientX, e.clientY); return; }
              const t = e.dataTransfer.getData("application/otoji-node") as NodeType;
              if (t && NODE_SPECS[t]) addNode(t, { x: e.clientX, y: e.clientY });
            }}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* floating title / toolbar card */}
        <div style={{ ...CARD, position: "absolute", top: 12, left: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", maxWidth: "calc(100% - 24px)", zIndex: 10 }}>
          <strong>otoji</strong>
          <span style={{ fontSize: 12, color: "#718096" }}>room {room} · {status} · {role} · {devices.length} device(s)</span>
          <button onClick={share} style={{ fontSize: 12 }}>{copied ? "✓ link copied" : "Share link"}</button>
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
            {runStatus && <span style={{ fontSize: 12, color: "#718096" }}>{runStatus}</span>}
            <span style={{ fontSize: 12, color: running ? "#2f855a" : "#a0aec0" }}>{running ? "● live" : paused ? "paused" : "idle"}</span>
            <button onClick={() => setPaused((v) => !v)} style={{ fontSize: 12 }}>{paused ? "Resume" : "Pause"}</button>
          </span>
        </div>

        {/* floating node palette — drag a folded node onto the canvas (or click) */}
        {view === "graph" && (
          <div style={{ ...CARD, position: "absolute", left: 12, bottom: 12, padding: "8px 10px", width: 188, zIndex: 10 }}>
            <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 6 }}>drag onto canvas — or click to add</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(Object.keys(NODE_SPECS) as NodeType[]).map((t) => {
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
                    style={{
                      cursor: "grab",
                      border: "1px solid #cbd5e0",
                      borderRadius: 6,
                      background: "#fff",
                      padding: "4px 8px",
                      fontSize: 11,
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: PORT_COLOR[dot], flex: "none" }} />
                    {spec.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* floating sink output card */}
        {view === "graph" && (
          <div style={{ ...CARD, position: "absolute", top: 12, right: 12, width: 320, maxHeight: "calc(100% - 24px)", overflow: "auto", padding: "8px 12px", zIndex: 10 }}>
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

export function GraphEditor({ initialRoom }: { initialRoom?: string }) {
  return (
    <ReactFlowProvider>
      <Editor initialRoom={initialRoom} />
    </ReactFlowProvider>
  );
}

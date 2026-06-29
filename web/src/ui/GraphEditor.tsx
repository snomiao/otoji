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
  const [, setTick] = useState(0); // periodic refresh for live counters
  const [view, setView] = useState<"graph" | "network" | "timeline">("graph");

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

  const addNode = useCallback(
    (type: NodeType) => {
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      const n: Node = {
        id,
        type: "voice",
        position: { x: 80 + Math.random() * 120, y: 80 + Math.random() * 160 },
        data: { voiceType: type, device: myDeviceId, config: {} },
      };
      const next = [...nodesRef.current, n];
      nodesRef.current = next; // keep ref synchronous across batched calls
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [myDeviceId, setNodes, broadcast],
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

  const rf = useReactFlow();

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
        };
        const arr = recordsByNodeRef.current.get(sinkId) ?? [];
        arr.push(rec);
        recordsByNodeRef.current.set(sinkId, arr);
        setSinkRecs((prev) => [rec, ...prev].slice(0, 100));
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of sinkRecs) if (r.nodeId) c[r.nodeId] = (c[r.nodeId] ?? 0) + 1;
    return c;
  }, [sinkRecs]);

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
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
          <strong>otoji graph</strong>
          <span style={{ fontSize: 12, color: "#718096" }}>room {room} · {status} · {role} · {devices.length} device(s)</span>
          <button onClick={share} style={{ fontSize: 12 }}>{copied ? "✓ link copied" : "Share link"}</button>
          <span style={{ display: "flex", gap: 4, marginLeft: 12 }}>
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
            <>
              <button onClick={addPipeline} style={{ fontSize: 12, fontWeight: 700 }}>+ Pipeline</button>
              <span style={{ marginLeft: 6, fontSize: 12, color: "#a0aec0" }}>add:</span>
              {(Object.keys(NODE_SPECS) as NodeType[]).map((t) => (
                <button key={t} onClick={() => addNode(t)} style={{ fontSize: 12 }}>+ {NODE_SPECS[t].label}</button>
              ))}
            </>
          )}
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {runStatus && <span style={{ fontSize: 12, color: "#718096" }}>{runStatus}</span>}
            <span style={{ fontSize: 12, color: running ? "#2f855a" : "#a0aec0" }}>{running ? "● live" : paused ? "paused" : "idle"}</span>
            <button onClick={() => setPaused((v) => !v)} style={{ fontSize: 12 }}>{paused ? "Resume" : "Pause"}</button>
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {view === "graph" && (
            <>
              <div style={{ flex: 1 }}>
                <ReactFlow
                  nodes={nodes}
                  edges={styledEdges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  isValidConnection={isValidConnection}
                  onNodeDragStop={() => broadcast(nodesRef.current, edgesRef.current)}
                  onNodesDelete={afterDelete}
                  onEdgesDelete={afterDelete}
                  deleteKeyCode={null}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) addFileNodeAt(f, e.clientX, e.clientY);
                  }}
                  fitView
                >
                  <Background />
                  <Controls />
                </ReactFlow>
              </div>
              <div style={{ width: 340, borderLeft: "1px solid #e2e8f0", overflow: "auto", padding: "8px 12px" }}>
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
            </>
          )}
          {view === "network" && (
            <NetworkView myId={myDeviceId} devices={devices} peerStates={peerStates} graph={currentGraph} stats={transportRef.current} />
          )}
          {view === "timeline" && <TimelineView recordings={sinkRecs} />}
        </div>
      </div>
    </GraphContext.Provider>
  );
}

export function GraphEditor({ initialRoom }: { initialRoom?: string }) {
  return (
    <ReactFlowProvider>
      <Editor initialRoom={initialRoom} />
    </ReactFlowProvider>
  );
}

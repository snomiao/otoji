import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SignalingClient, type Peer } from "../net/signaling";
import { PeerMesh } from "../net/peers";
import { VoiceNode, type DeviceOpt } from "./VoiceNode";
import { GraphContext } from "./graph-context";
import { GraphRuntime, type TranscriptMsg } from "../graph/runtime";
import { PeerMeshTransport } from "../graph/mesh-transport";
import { RecordingPlayer, type Recording } from "./RecordingPlayer";
import { computePeaks } from "../lib/peaks";
import { isReadableTranscript } from "../lib/text";
import { generateRoomCode, isRoomCode, joinUrl } from "../lib/roomcode";
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
    data: { voiceType: n.type, device: n.device },
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
  const [name, setName] = useState("device");
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceOpt[]>([]);
  const [status, setStatus] = useState("not connected");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [sinkRecs, setSinkRecs] = useState<Recording[]>([]);

  const sigRef = useRef<SignalingClient | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);
  const transportRef = useRef<PeerMeshTransport | null>(null);
  const runtimeRef = useRef<GraphRuntime | null>(null);
  const recCounter = useRef(0);
  const versionRef = useRef(0);
  const devicesRef = useRef<DeviceOpt[]>([]);
  devicesRef.current = devices;
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => () => { meshRef.current?.destroy(); sigRef.current?.close(); }, []);

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
    const sig = new SignalingClient(room.trim(), name.trim() || "device");
    sigRef.current = sig;
    sig.on("open", () => setStatus("connected"));
    sig.on("close", () => setStatus("reconnecting…"));
    sig.on("hello", (m) => {
      setMyId(m.peerId);
      setDevices([{ peerId: m.peerId, name: name.trim() || "device", me: true }, ...m.peers.map(asDev)]);
      applyRemote(m.graph);
      sig.getGraph();
      // (re)establish the WebRTC mesh for cross-device edge transport. Keep a
      // STABLE transport object across reconnects (just swap its mesh) so a
      // running runtime's captured transport keeps delivering frames.
      meshRef.current?.destroy();
      const mesh = new PeerMesh(sig, m.peerId, {
        onData: (_peer, _label, data) => transportRef.current?.handleData(data),
      });
      meshRef.current = mesh;
      if (!transportRef.current) transportRef.current = new PeerMeshTransport(mesh);
      else transportRef.current.setMesh(mesh);
      m.peers.forEach((p: Peer) => mesh.consider(p.peerId));
    });
    sig.on("peer-joined", (m) => {
      setDevices((d) => [...d, asDev(m.peer)]);
      meshRef.current?.consider(m.peer.peerId);
    });
    sig.on("peer-left", (m) => setDevices((d) => d.filter((x) => x.peerId !== m.peerId)));
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

  const asDev = (p: Peer): DeviceOpt => ({ peerId: p.peerId, name: p.name, me: false });

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
        data: { voiceType: type, device: myId },
      };
      const next = [...nodesRef.current, n];
      nodesRef.current = next; // keep ref synchronous across batched calls
      setNodes(next);
      broadcast(next, edgesRef.current);
    },
    [myId, setNodes, broadcast],
  );

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

  const run = useCallback(async () => {
    if (runtimeRef.current) return;
    const graph = fromRF(nodesRef.current, edgesRef.current, versionRef.current);
    const self =
      myId && transportRef.current
        ? { myId, deviceIds: devicesRef.current.map((d) => d.peerId), transport: transportRef.current }
        : undefined;
    const rt = new GraphRuntime(graph, {
      self,
      onStatus: (s) => setRunStatus(s),
      onError: (e) => setRunStatus(`error: ${e.message}`),
      onSink: (_id, tr: TranscriptMsg) => {
        if (!isReadableTranscript(tr.text)) return;
        const rec: Recording = {
          id: `g-${recCounter.current++}`,
          at: Date.now(),
          durationMs: tr.audio.durationMs,
          text: tr.text,
          peaks: computePeaks(tr.audio.samples, 400),
          sampleRate: tr.audio.sampleRate,
          samples: tr.audio.samples,
        };
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
  }, [myId]);

  const stopRun = useCallback(async () => {
    await runtimeRef.current?.stop();
    runtimeRef.current = null;
    setRunning(false);
    setRunStatus("stopped");
  }, []);

  useEffect(() => () => { runtimeRef.current?.stop(); }, []);

  const ctx = useMemo(() => ({ devices, onAssign }), [devices, onAssign]);

  if (!joined) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "60px auto", padding: 16 }}>
        <h1>otoji · voice graph</h1>
        <p style={{ color: "#666", fontSize: 13 }}>
          Join a room (pairing code), then build a node graph. Open on multiple devices to assign nodes per device.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="room code" value={room} onChange={(e) => setRoom(e.target.value)} style={{ width: 150 }} />
          <input placeholder="your name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 120 }} />
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
          <span style={{ fontSize: 12, color: "#718096" }}>room {room} · {status} · {devices.length} device(s)</span>
          <button onClick={share} style={{ fontSize: 12 }}>{copied ? "✓ link copied" : "Share link"}</button>
          <span style={{ marginLeft: 12, fontSize: 12, color: "#a0aec0" }}>add:</span>
          {(Object.keys(NODE_SPECS) as NodeType[]).map((t) => (
            <button key={t} onClick={() => addNode(t)} style={{ fontSize: 12 }}>+ {NODE_SPECS[t].label}</button>
          ))}
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {runStatus && <span style={{ fontSize: 12, color: "#718096" }}>{runStatus}</span>}
            {running ? (
              <button onClick={stopRun} style={{ fontSize: 12 }}>■ Stop</button>
            ) : (
              <button onClick={run} style={{ fontSize: 12 }}>▶ Run</button>
            )}
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeDragStop={() => broadcast(nodesRef.current, edgesRef.current)}
            onNodesDelete={afterDelete}
            onEdgesDelete={afterDelete}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
          </div>
          {(running || sinkRecs.length > 0) && (
            <div style={{ width: 340, borderLeft: "1px solid #e2e8f0", overflow: "auto", padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>Sink output ({sinkRecs.length})</strong>
                {sinkRecs.length > 0 && <button onClick={() => setSinkRecs([])} style={{ fontSize: 11 }}>Clear</button>}
              </div>
              {sinkRecs.length === 0 ? (
                <p style={{ color: "#a0aec0", fontSize: 12 }}>Running — speak to produce transcripts.</p>
              ) : (
                sinkRecs.map((r, i) => <RecordingPlayer key={r.id} rec={r} index={sinkRecs.length - 1 - i} />)
              )}
            </div>
          )}
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

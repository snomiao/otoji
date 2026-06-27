import React, { useEffect, useRef, useState } from "react";
import { SignalingClient, type Peer } from "../net/signaling";
import { PeerMesh } from "../net/peers";

// M1 demo: join a room (pairing code), establish a P2P mesh, and echo messages
// over data channels. Proves signaling + WebRTC transport end-to-end.
// Reachable at otoji.org/?mesh=1
export function MeshPanel() {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("device");
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [text, setText] = useState("hello mesh");

  const sigRef = useRef<SignalingClient | null>(null);
  const meshRef = useRef<PeerMesh | null>(null);

  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 200));

  useEffect(() => () => leave(), []);

  function join() {
    if (joined || !room.trim()) return;
    const sig = new SignalingClient(room.trim(), name.trim() || "device");
    sigRef.current = sig;

    sig.on("open", () => addLog("signaling connected"));
    sig.on("close", () => addLog("signaling closed (will retry)"));
    sig.on("hello", (m) => {
      setMyId(m.peerId);
      setPeers(m.peers);
      addLog(`joined as ${m.peerId.slice(0, 8)} — ${m.peers.length} peer(s) present`);
      // A reconnect yields a fresh peerId + hello; tear down the previous mesh
      // so we don't leak peer connections or stack signaling handlers.
      meshRef.current?.destroy();
      const mesh = new PeerMesh(sig, m.peerId, {
        onPeerState: (id, st) => {
          addLog(`peer ${id.slice(0, 8)}: ${st}`);
          setConnected(meshRef.current?.connectedPeers() ?? []);
        },
        onChannelOpen: (id, label) => addLog(`channel '${label}' open <-> ${id.slice(0, 8)}`),
        onData: (id, label, data) => addLog(`recv from ${id.slice(0, 8)} [${label}]: ${data}`),
      });
      meshRef.current = mesh;
      m.peers.forEach((p: Peer) => mesh.consider(p.peerId));
    });
    sig.on("peer-joined", (m) => {
      setPeers((ps) => [...ps, m.peer]);
      addLog(`peer joined: ${m.peer.name} (${m.peer.peerId.slice(0, 8)})`);
      meshRef.current?.consider(m.peer.peerId);
    });
    sig.on("peer-left", (m) => {
      setPeers((ps) => ps.filter((p) => p.peerId !== m.peerId));
      addLog(`peer left: ${m.peerId.slice(0, 8)}`);
      setConnected(meshRef.current?.connectedPeers() ?? []);
    });

    sig.connect();
    setJoined(true);
  }

  function leave() {
    meshRef.current?.destroy();
    meshRef.current = null;
    sigRef.current?.close();
    sigRef.current = null;
    setJoined(false);
    setMyId(null);
    setPeers([]);
    setConnected([]);
  }

  function broadcast() {
    const n = meshRef.current?.broadcast(text) ?? 0;
    addLog(`sent to ${n} peer(s): ${text}`);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>otoji · mesh demo</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        Open this page in two tabs/devices, join the same pairing code, and broadcast over the P2P mesh.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="pairing code" value={room} onChange={(e) => setRoom(e.target.value)} disabled={joined} />
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} disabled={joined} style={{ width: 120 }} />
        {joined ? <button onClick={leave}>Leave</button> : <button onClick={join} disabled={!room.trim()}>Join</button>}
        <button onClick={() => setRoom(Math.floor(100000 + Math.random() * 900000).toString())} disabled={joined}>
          random code
        </button>
      </div>
      {joined && (
        <p style={{ fontSize: 12, color: "#888" }}>
          me: {myId?.slice(0, 8) ?? "…"} · peers: {peers.length} · connected: {connected.length}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button onClick={broadcast} disabled={!joined}>Broadcast</button>
      </div>
      <h3 style={{ marginBottom: 4 }}>Log</h3>
      <pre style={{ background: "#f7fafc", padding: 8, borderRadius: 6, fontSize: 12, maxHeight: 320, overflow: "auto" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}

import React from "react";
import type { DeviceOpt } from "./VoiceNode";
import { nodeOwner } from "../graph/runtime";
import { NODE_SPECS, type VoiceGraph, type PortType } from "../graph/model";

interface NetworkViewProps {
  myId: string;
  devices: DeviceOpt[];
  peerStates: Record<string, string>;
  graph: VoiceGraph;
  stats: { sent: number; recv: number; dropped: number } | null;
}

const PORT_COLOR: Record<PortType, string> = { segment: "#dd6b20", transcript: "#2b6cb0" };
const KIND_LABEL: Record<PortType, string> = { segment: "voice", transcript: "transcript" };

function outPortType(graph: VoiceGraph, source: string, handle: string): PortType | null {
  const n = graph.nodes[source];
  if (!n) return null;
  return NODE_SPECS[n.type].outputs.find((o) => o.id === handle)?.type ?? null;
}

/** Device-centric + egocentric view: what *I* send/receive and to/from whom. */
export function NetworkView({ myId, devices, peerStates, graph, stats }: NetworkViewProps) {
  const onlineIds = devices.filter((d) => d.online).map((d) => d.deviceId);
  const dev = (id: string) => devices.find((d) => d.deviceId === id);
  const nameOf = (id: string) => dev(id)?.name ?? id.slice(0, 6);
  const me = dev(myId);

  const nodesByDevice = new Map<string, string[]>();
  for (const n of Object.values(graph.nodes)) {
    const owner = nodeOwner(n, onlineIds) ?? "(unassigned)";
    if (!nodesByDevice.has(owner)) nodesByDevice.set(owner, []);
    nodesByDevice.get(owner)!.push(NODE_SPECS[n.type].label);
  }

  // Egocentric flows.
  const sending: { to: string; kind: PortType; help: string }[] = [];
  const receiving: { from: string; kind: PortType }[] = [];
  for (const e of graph.edges) {
    const from = nodeOwner(graph.nodes[e.source], onlineIds);
    const to = nodeOwner(graph.nodes[e.target], onlineIds);
    const kind = outPortType(graph, e.source, e.sourceHandle);
    if (!from || !to || !kind || from === to) continue;
    if (from === myId) sending.push({ to, kind, help: NODE_SPECS[graph.nodes[e.target].type].label });
    if (to === myId) receiving.push({ from, kind });
  }

  const roleLabel = (id: string) => {
    const r = dev(id)?.role;
    return r && r !== "general" ? ` (${r})` : "";
  };

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", fontFamily: "system-ui, sans-serif" }}>
      {/* You / perspective */}
      <div style={{ border: "1px solid #bcd", background: "#f7fbff", borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 13 }}>
          <strong>You</strong>: {me?.name ?? "—"}{roleLabel(myId)} · running:{" "}
          {(nodesByDevice.get(myId) ?? []).join(", ") || <em style={{ color: "#a0aec0" }}>nothing</em>}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          {sending.length === 0 && receiving.length === 0 ? (
            <span style={{ color: "#a0aec0" }}>No cross-device flows — all your edges are local.</span>
          ) : (
            <>
              {sending.map((s, i) => (
                <div key={`s${i}`}>
                  ↗ sending <b style={{ color: PORT_COLOR[s.kind] }}>{KIND_LABEL[s.kind]}</b> → {nameOf(s.to)}
                  {roleLabel(s.to)} <span style={{ color: "#718096" }}>for {s.help}</span>
                </div>
              ))}
              {receiving.map((r, i) => (
                <div key={`r${i}`}>
                  ↘ receiving <b style={{ color: PORT_COLOR[r.kind] }}>{KIND_LABEL[r.kind]}</b> ← {nameOf(r.from)}
                  {roleLabel(r.from)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <h3 style={{ marginTop: 0 }}>Devices</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {devices.map((dv) => {
          const state = dv.me ? "this device" : !dv.online ? "offline" : (dv.peerId && peerStates[dv.peerId]) || "connecting…";
          const ok = dv.me || state === "connected";
          const list = nodesByDevice.get(dv.deviceId) ?? [];
          return (
            <div
              key={dv.deviceId}
              style={{ border: "1px solid #cbd5e0", borderRadius: 10, padding: 12, minWidth: 180, opacity: dv.online || dv.me ? 1 : 0.6 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{dv.name}{dv.me ? " (me)" : ""}</strong>
                <span style={{ fontSize: 11, color: ok ? "#2f855a" : "#c05621" }}>● {state}</span>
              </div>
              <div style={{ fontSize: 11, color: "#a0aec0" }}>
                {dv.role !== "general" ? dv.role : ""}{!dv.hasMic ? " · no mic" : ""}
              </div>
              <div style={{ fontSize: 12, color: "#4a5568", marginTop: 6 }}>
                {list.map((l, i) => <div key={i}>• {l}</div>)}
                {!list.length && <em style={{ color: "#a0aec0" }}>no nodes</em>}
              </div>
            </div>
          );
        })}
      </div>

      {stats && (
        <p style={{ color: "#a0aec0", fontSize: 12, marginTop: 12 }}>
          mesh frames — sent {stats.sent} · recv {stats.recv}{stats.dropped ? ` · dropped ${stats.dropped}` : ""}
        </p>
      )}
    </div>
  );
}

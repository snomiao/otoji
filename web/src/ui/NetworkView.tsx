import React from "react";
import type { DeviceOpt } from "./VoiceNode";
import { nodeOwner } from "../graph/runtime";
import { NODE_SPECS, type VoiceGraph, type PortType } from "../graph/model";

interface NetworkViewProps {
  myId: string | null;
  devices: DeviceOpt[];
  peerStates: Record<string, string>;
  graph: VoiceGraph;
  stats: { sent: number; recv: number; dropped: number } | null;
}

const PORT_COLOR: Record<PortType, string> = { segment: "#dd6b20", transcript: "#2b6cb0" };

function outPortType(graph: VoiceGraph, source: string, handle: string): PortType | null {
  const n = graph.nodes[source];
  if (!n) return null;
  return NODE_SPECS[n.type].outputs.find((o) => o.id === handle)?.type ?? null;
}

/** Device-centric view: each device, its nodes, and the cross-device links. */
export function NetworkView({ myId, devices, peerStates, graph, stats }: NetworkViewProps) {
  const ids = devices.map((d) => d.peerId);

  const nodesByDevice = new Map<string, string[]>();
  for (const n of Object.values(graph.nodes)) {
    const owner = nodeOwner(n, ids) ?? "(unassigned)";
    if (!nodesByDevice.has(owner)) nodesByDevice.set(owner, []);
    nodesByDevice.get(owner)!.push(NODE_SPECS[n.type].label);
  }

  const links: { from: string; to: string; kind: PortType }[] = [];
  for (const e of graph.edges) {
    const from = nodeOwner(graph.nodes[e.source], ids);
    const to = nodeOwner(graph.nodes[e.target], ids);
    const kind = outPortType(graph, e.source, e.sourceHandle);
    if (from && to && from !== to && kind) links.push({ from, to, kind });
  }
  const nameOf = (id: string) => devices.find((d) => d.peerId === id)?.name ?? id.slice(0, 6);

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", fontFamily: "system-ui, sans-serif" }}>
      <h3 style={{ marginTop: 0 }}>Devices</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {devices.map((dv) => {
          const state = dv.me ? "this device" : peerStates[dv.peerId] ?? "connecting…";
          const ok = dv.me || state === "connected";
          return (
            <div key={dv.peerId} style={{ border: "1px solid #cbd5e0", borderRadius: 10, padding: 12, minWidth: 180 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{dv.name}{dv.me ? " (me)" : ""}</strong>
                <span style={{ fontSize: 11, color: ok ? "#2f855a" : "#c05621" }}>● {state}</span>
              </div>
              <div style={{ fontSize: 12, color: "#4a5568", marginTop: 6 }}>
                {(nodesByDevice.get(dv.peerId) ?? []).map((l, i) => <div key={i}>• {l}</div>)}
                {!(nodesByDevice.get(dv.peerId) ?? []).length && <em style={{ color: "#a0aec0" }}>no nodes</em>}
              </div>
            </div>
          );
        })}
      </div>

      <h3>Cross-device links</h3>
      {links.length === 0 ? (
        <p style={{ color: "#a0aec0", fontSize: 13 }}>No edges cross devices — assign nodes to different devices to chain them.</p>
      ) : (
        <div style={{ fontSize: 13 }}>
          {links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0" }}>
              <span>{nameOf(l.from)}</span>
              <span style={{ color: PORT_COLOR[l.kind] }}>──{l.kind}──▶</span>
              <span>{nameOf(l.to)}</span>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <p style={{ color: "#a0aec0", fontSize: 12, marginTop: 12 }}>
          mesh frames — sent {stats.sent} · recv {stats.recv}{stats.dropped ? ` · dropped ${stats.dropped}` : ""}
        </p>
      )}
    </div>
  );
}

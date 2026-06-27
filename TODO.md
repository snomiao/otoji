# otoji — Distributed Voice Graph (WebRTC + node-graph UI)

> Vision: devices join a **room**, each device hosts a **subgraph** of audio/text
> nodes, and nodes are wired into one shared **graph**. Cross-device edges are
> **WebRTC** links carrying Opus voice segments + events. End goal: run the
> recorder and the voice model on *different devices* and chain them in the same
> graph — e.g. **phone captures mic → laptop runs SenseVoice → transcript sink**.

## Decisions (locked 2026-06-27)

| Area | Decision |
|---|---|
| Signaling | **Cloudflare Worker + Durable Object** at **`otoji.org/signal`** (path preferred; **fallback `signal.otoji.org`**). One DO per room. |
| Room join | **Pairing codes** — host creates room, shows a 6-digit code; peers enter it. Device display names. No accounts (MVP). |
| Graph state | **Shared & authoritative in the DO**, broadcast to all peers, persisted in DO storage. Any device edits; others see it live. |
| Topology | **P2P mesh** — each cross-device graph edge = a direct `RTCPeerConnection`. |
| Edge payload | **RTCDataChannel** (reliable/ordered) carrying **Opus segments + typed events** (not live media tracks). |
| NAT traversal | **STUN now** (Cloudflare/Google), **add Cloudflare TURN in phase 2**. |
| Graph UI | **React Flow (`@xyflow/react`)**. |
| Node placement | **Per-device subgraphs** + a network view; links drawn explicitly between devices. |
| v1 node types | **Mic + VAD capture**, **SenseVoice STT**, **Transcript + Recordings sink**. (Polish + TTS deferred.) |
| v1 milestone | **2-device chain**: `phone[Mic+VAD] --opus--> laptop[STT → Transcript/Recordings]`. |

## Architecture

```
                          otoji.org/signal/:room  (Cloudflare Worker)
                                     │  WebSocket
                          ┌──────────┴───────────┐
                          │   RoomDurableObject   │  presence + SDP/ICE relay
                          │   - peers[]           │  + authoritative graph JSON
                          │   - graph (JSON)      │  (DO storage, broadcast)
                          └──────────┬───────────┘
            signaling only ─────────┘ (offers/answers/ICE, graph sync)

   device A (phone)                         device B (laptop)
   ┌───────────────────┐   RTCDataChannel   ┌──────────────────────────┐
   │ [Mic+VAD] ──opus──┼═══════════════════>│ [SenseVoice STT] ──text──>│ [Sink]
   └───────────────────┘   (P2P, STUN)      └──────────────────────────┘
   subgraph @A                              subgraph @B
```

- **Nodes** have typed ports: `audio-segment` (Opus + meta), `text` (transcript), `event`.
- An **edge** is valid iff `out.type === in.type`. Same-device edges are in-process;
  cross-device edges are realized as a data channel over a peer connection.
- **Mesh**: one `RTCPeerConnection` per pair of devices that share ≥1 cross-device
  edge; multiplex multiple logical edges over labeled data channels.

## Data model & protocol (draft)

**Graph JSON** (in DO):
```jsonc
{
  "version": 3,
  "devices": { "<peerId>": { "name": "phone", "online": true } },
  "nodes":   { "<nodeId>": { "type": "mic-vad|stt|sink", "device": "<peerId>", "pos": [x,y], "config": {} } },
  "edges":   [ { "from": "<nodeId>:out", "to": "<nodeId>:in" } ]
}
```

**Signaling messages** (WS, JSON):
`join{room,code,name}` → `peers{...}` / `peer-joined` / `peer-left`,
`signal{to,from,sdp|ice}` (relayed), `graph{get|patch|full}` (DO is source of truth).

**Data-channel frames** (between peers): `segment{seq, opus, sampleRate, durationMs, peaks}`,
`text{seq, transcript, final}`, `event{...}`. Reuse existing `lib/opus.ts` codec.

## Milestones

### M0 — Signaling backend (Worker + Durable Object) ✅ DONE
- [x] New Worker (wrangler) in `signal/` exporting `RoomDurableObject`.
- [x] WebSocket endpoint `/{room}` with hibernatable WS; track peers/presence.
- [x] Room = pairing code (room key); first peer implicitly hosts. (Code gen is client-side.)
- [x] Relay `signal` messages between peers; broadcast presence.
- [x] Store + broadcast authoritative graph JSON (LWW patches) in DO storage.
- [x] **Routing**: `otoji.org/signal` + `/signal/*` Workers routes — **verified they
      win over the Pages site** (path approach works; subdomain fallback not needed).
- [x] Deployed via wrangler (SNOLAB); two-peer signaling smoke test passes live.

### M1 — Mesh transport ✅ DONE
- [x] Signaling client (WS) in web: join/leave, presence, reconnect (φ backoff). `net/signaling.ts`
- [x] Peer manager: `RTCPeerConnection` per peer, perfect-negotiation, STUN,
      labeled `RTCDataChannel`s. `net/peers.ts`
- [x] Demo at `?mesh=1` (`ui/MeshPanel.tsx`): join room, presence, broadcast/echo.
- [x] Verified live: bundled signaling client connects to worker; WebRTC
      loopback (ping↔pong over data channel, both pcs `connected`) passes.
- [x] Codex review: destroy stale mesh + unregister handlers on reconnect.

### M2 — Graph editor UI (React Flow) ✅ DONE
- [x] Add `@xyflow/react`; node palette (Mic+VAD, STT, Sink) with typed handles. `graph/model.ts`, `ui/VoiceNode.tsx`
- [x] Create/move/connect/delete; type-checked edges (`canConnect`); assign node → device (per-node selector).
- [x] Bind graph to DO: load on join (hello/graph-get), edit → `patchGraph` → broadcast → re-render. `ui/GraphEditor.tsx` (`?graph=1`)
- [x] Verified live: 3 nodes added + device-assigned, persisted to DO (probe read back version 3, 3 nodes).
- [x] Codex review: committed valid `web/pnpm-workspace.yaml` (allowBuilds) so pnpm build/test don't break.
- [ ] (deferred) dedicated network view of devices + inter-device links (per-device grouping shown via node device labels for now).

### M3 — Node runtime (local execution) ✅ DONE
- [x] Extracted reusable mic+VAD into `lib/mic-vad.ts` (provider now reuses it);
      `sttRecognize()` exported from `sensevoice.ts`.
- [x] `graph/runtime.ts`: `GraphRuntime` wires node runners per edges
      (mic-vad source, stt transform, sink) + testable `buildAdjacency`.
- [x] Run/Stop + sink-output panel in `GraphEditor` (transcripts → recordings,
      readable-filtered).
- [x] Verified live: seeded mic→stt→sink graph, hit Run → real audio produced
      4 sink recordings with waveforms end-to-end (single device, no WebRTC).
- [x] Codex review: abort run if model load fails; STT `stop()` drains its
      chain (stop sources first) so the final utterance isn't lost.

### M4 — Cross-device chaining (**v1 goal**)
- [ ] Realize cross-device edges as data channels; serialize `segment`/`text` frames.
- [ ] phone `[Mic+VAD]` → (opus over RTC) → laptop `[STT]` → `[Sink]`.
- [ ] Handle peer drop/rejoin; backpressure; ordering.
- [ ] Verify on real phone + laptop (different networks → may need TURN, see M5).

### M5 — Future / hardening
- [ ] Cloudflare TURN for symmetric-NAT / cross-network reliability.
- [ ] Polish (LLM) + TTS nodes; Recorder/persist node; audio-monitor node.
- [ ] Reconnection resilience, graph conflict strategy (LWW → maybe CRDT).
- [ ] Optional auth / private rooms; per-room model selection.
- [ ] Mobile/iOS mic + background constraints.

## Open questions / risks
- ~~**Pages + Worker on same host**: confirm `otoji.org/signal/*` route overrides
  Pages.~~ ✅ Resolved — Workers routes win over Pages; `/signal` served by the Worker.
- **DO + WebSocket hibernation** semantics for long-idle rooms.
- **Model location**: only the STT device downloads the 228 MB SenseVoice model.
- **Security**: room/pairing codes are bearer tokens (anyone with the code joins) —
  acceptable for MVP; revisit for shared/public use.
- **Graph conflicts**: start last-write-wins on the DO; revisit if multi-editor.

## Reuse from current codebase
- `web/src/lib/opus.ts` — Opus encode/decode for segment frames on the wire.
- `web/src/providers/stt/sensevoice.ts` — VAD + recognize, to be split into nodes.
- `web/src/lib/backoff.ts` — φ backoff for signaling/peer reconnect.
- `web/src/ui/RecordingPlayer.tsx`, `Waveform.tsx` — sink-node UI.

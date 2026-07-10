import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { MeshPanel } from "./ui/MeshPanel";
import { GraphEditor } from "./ui/GraphEditor";
import { Lobby } from "./ui/Lobby";
import { isRoomCode } from "./lib/roomcode";

const el = document.getElementById("root");
const params = new URLSearchParams(location.search);
const path = location.pathname.replace(/^\/+/, "");

let view: React.ReactNode;
if (params.has("mesh")) {
  view = <MeshPanel />;
} else if (params.has("local")) {
  // Single-device "try it" editor (no room/signaling), preloaded with a demo.
  view = <GraphEditor local federationDemo={params.has("federationDemo")} />;
} else if (params.has("graph")) {
  view = <GraphEditor initialRoom={params.get("room") ?? undefined} federationDemo={params.has("federationDemo")} />;
} else if (isRoomCode(path)) {
  // Shareable join URL: otoji.org/kru-dfmq-atg
  view = <GraphEditor initialRoom={path} />;
} else if (params.has("simple") || params.has("classic")) {
  // Classic single-page transcription app.
  view = <App />;
} else {
  // Landing: the hello-graph lobby (create/join a room).
  view = <Lobby />;
}

if (el) createRoot(el).render(<React.StrictMode>{view}</React.StrictMode>);

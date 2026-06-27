import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { MeshPanel } from "./ui/MeshPanel";
import { GraphEditor } from "./ui/GraphEditor";
import { isRoomCode } from "./lib/roomcode";

const el = document.getElementById("root");
const params = new URLSearchParams(location.search);
const path = location.pathname.replace(/^\/+/, "");

let view: React.ReactNode;
if (params.has("mesh")) {
  view = <MeshPanel />;
} else if (params.has("graph")) {
  view = <GraphEditor initialRoom={params.get("room") ?? undefined} />;
} else if (isRoomCode(path)) {
  // Shareable join URL: otoji.org/kru-dfmq-atg
  view = <GraphEditor initialRoom={path} />;
} else {
  view = <App />;
}

if (el) createRoot(el).render(<React.StrictMode>{view}</React.StrictMode>);

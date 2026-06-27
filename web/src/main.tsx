import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { MeshPanel } from "./ui/MeshPanel";
import { GraphEditor } from "./ui/GraphEditor";

const el = document.getElementById("root");
const params = new URLSearchParams(location.search);
const view = params.has("graph") ? <GraphEditor /> : params.has("mesh") ? <MeshPanel /> : <App />;
if (el) createRoot(el).render(<React.StrictMode>{view}</React.StrictMode>);

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { MeshPanel } from "./ui/MeshPanel";

const el = document.getElementById("root");
const mesh = new URLSearchParams(location.search).has("mesh");
if (el) createRoot(el).render(<React.StrictMode>{mesh ? <MeshPanel /> : <App />}</React.StrictMode>);

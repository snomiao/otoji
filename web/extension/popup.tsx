import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/ui/App";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);

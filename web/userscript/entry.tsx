import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/ui/App";

(function mount() {
  const id = "otoji-userscript-root";
  if (document.getElementById(id)) return;
  const host = document.createElement("div");
  host.id = id;
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:420px;max-height:80vh;overflow:auto;background:#fff;color:#000;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);";
  document.documentElement.appendChild(host);
  createRoot(host).render(<App />);
})();

// A small bottom-sheet nudging MOBILE browser users to install the PWA.
// Never shown when already running as the installed app (standalone), on
// desktop, or within 14 days of a dismissal. Android/Chromium uses the
// captured beforeinstallprompt event; iOS gets a 2-step Add-to-Home guide.
// `?installprompt` forces it for debugging.

import React, { useEffect, useState } from "react";
import {
  INSTALL_DISMISS_KEY,
  installPromptMode,
  type InstallPromptMode,
} from "../lib/install-prompt";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SHOW_DELAY_MS = 4000; // let the app land before nudging

const card: React.CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(22, 27, 34, 0.97)",
  border: "1px solid #30363d",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  color: "#e6edf3",
  fontSize: 13,
  lineHeight: 1.4,
  maxWidth: 480,
  margin: "0 auto",
};

const btn: React.CSSProperties = {
  border: "1px solid #30363d",
  borderRadius: 8,
  background: "transparent",
  color: "#8b949e",
  padding: "7px 12px",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export function InstallPrompt() {
  const [mode, setMode] = useState<InstallPromptMode>("hide");
  const [native, setNative] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let nativeEv: BeforeInstallPromptEvent | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const force = new URLSearchParams(location.search).has("installprompt");

    const decide = () => {
      let dismissedAt: number | null = null;
      try {
        const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
        dismissedAt = raw ? Number(raw) : null;
      } catch {
        /* private mode */
      }
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      setMode(
        installPromptMode({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
          standalone,
          dismissedAt,
          now: Date.now(),
          hasNativePrompt: nativeEv !== null,
          force,
        }),
      );
      if (nativeEv) setNative(nativeEv);
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar away; we present our own
      nativeEv = e as BeforeInstallPromptEvent;
      decide();
    };
    const onInstalled = () => setMode("hide");

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    timer = setTimeout(decide, force ? 0 : SHOW_DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (mode === "hide") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
    setMode("hide");
  };

  const install = async () => {
    if (!native) return;
    await native.prompt();
    const { outcome } = await native.userChoice;
    if (outcome === "accepted") setMode("hide");
    else dismiss();
  };

  return (
    <div style={card} role="dialog" aria-label="Install otoji">
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#f0f6fc" }}>Install otoji</div>
        {mode === "native" ? (
          <div>Works offline, opens full-screen — models stay downloaded.</div>
        ) : (
          <div>
            Open the <b>Share</b> menu and tap <b>“Add to Home Screen”</b> — works offline, opens full-screen.
          </div>
        )}
      </div>
      {mode === "native" && (
        <button style={{ ...btn, background: "#238636", borderColor: "#238636", color: "#fff" }} onClick={() => void install()}>
          Install
        </button>
      )}
      <button style={btn} onClick={dismiss} aria-label="Not now">
        ✕
      </button>
    </div>
  );
}

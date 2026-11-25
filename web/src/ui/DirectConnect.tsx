// Serverless pairing spike UI (?direct): host mints an offer (text / URL /
// QR), guest answers, and a ping over the data channel proves the link — all
// with zero signaling infrastructure. The follow-up (TODO.md offline-mesh
// note) is routing the graph mesh transport over this link.

import React, { useEffect, useRef, useState } from "react";
import { generate } from "lean-qr";
import {
  createDirectGuest,
  createDirectHost,
  directOfferUrl,
  type DirectHost,
  type DirectLink,
} from "../net/manual-signal";

const card: React.CSSProperties = {
  maxWidth: 560,
  margin: "40px auto",
  padding: 20,
  borderRadius: 14,
  background: "rgba(22,27,34,0.97)",
  border: "1px solid #30363d",
  color: "#e6edf3",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
};
const mono: React.CSSProperties = {
  width: "100%",
  minHeight: 64,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  background: "#0d1117",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 8,
  padding: 8,
  boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #30363d",
  background: "#238636",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

function Qr({ text }: { text: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      generate(text).toCanvas(ref.current);
      ref.current.style.width = "180px";
      ref.current.style.imageRendering = "pixelated";
    } catch {
      /* blob too large for a QR — the text/URL paths still work */
    }
  }, [text]);
  return <canvas ref={ref} style={{ background: "#fff", padding: 6, borderRadius: 8 }} />;
}

export function DirectConnect() {
  const [role, setRole] = useState<"pick" | "host" | "guest">(() =>
    location.hash.startsWith("#o=") ? "guest" : "pick",
  );
  const [host, setHost] = useState<DirectHost | null>(null);
  const [answerIn, setAnswerIn] = useState("");
  const [guestAnswer, setGuestAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [rtt, setRtt] = useState<number | null>(null);

  const wire = (l: DirectLink) => {
    setStatus("connected — pinging…");
    const t0 = performance.now();
    l.channel.onmessage = (ev) => {
      if (ev.data === "ping") l.channel.send("pong");
      else if (ev.data === "pong") {
        setRtt(Math.round(performance.now() - t0));
        setStatus("connected ✓ (data channel live, no server involved)");
      }
    };
    l.channel.send("ping");
  };

  const startHost = async () => {
    setStatus("gathering ICE…");
    const h = await createDirectHost();
    setHost(h);
    setStatus("offer ready — hand it to the other device");
    h.link.then(wire).catch((e) => setStatus(String(e)));
  };

  const startGuest = async (offerBlob: string) => {
    try {
      setStatus("answering…");
      const g = await createDirectGuest(offerBlob);
      setGuestAnswer(g.answerBlob);
      setStatus("answer ready — hand it back to the host");
      g.link.then(wire).catch((e) => setStatus(String(e)));
    } catch (e) {
      setStatus(String(e));
    }
  };

  // ?direct&loopback: self-test — host and guest in one page, exchanged
  // programmatically. Proves the whole non-trickle blob path headlessly.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("loopback")) return;
    (async () => {
      setStatus("loopback: hosting…");
      const h = await createDirectHost();
      const g = await createDirectGuest(h.offerBlob);
      await h.accept(g.answerBlob);
      const l = await h.link;
      const gl = await g.link;
      // in the 2-device flow each side runs wire(); here play the far end too
      gl.channel.onmessage = (ev) => {
        if (ev.data === "ping") gl.channel.send("pong");
      };
      wire(l);
    })().catch((e) => setStatus("loopback failed: " + String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "guest" && location.hash.startsWith("#o=")) {
      void startGuest(location.hash.slice(3));
      history.replaceState(null, "", location.pathname + location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>Direct connect (no server)</h2>
      <p style={{ color: "#8b949e" }}>
        Pair two devices over WebRTC with no signaling server — works on a
        hotspot LAN with zero internet. Exchange one offer and one answer by
        copy-paste, link, or QR.
      </p>
      {role === "pick" && (
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn} onClick={() => { setRole("host"); void startHost(); }}>I start (host)</button>
          <button style={{ ...btn, background: "transparent", color: "#e6edf3" }} onClick={() => setRole("guest")}>
            I have an offer (guest)
          </button>
        </div>
      )}
      {role === "host" && host && (
        <>
          <p><b>1.</b> Send this to the other device — link, QR, or the raw blob:</p>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Qr text={directOfferUrl(host.offerBlob)} />
            <textarea style={mono} readOnly value={directOfferUrl(host.offerBlob)} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <p><b>2.</b> Paste their answer blob here:</p>
          <textarea style={mono} value={answerIn} onChange={(e) => setAnswerIn(e.target.value)} placeholder="answer blob…" />
          <div style={{ marginTop: 8 }}>
            <button style={btn} onClick={() => host.accept(answerIn).catch((e) => setStatus(String(e)))}>Connect</button>
          </div>
        </>
      )}
      {role === "guest" && !guestAnswer && (
        <>
          <p>Paste the host's offer blob (or open their link/QR directly):</p>
          <textarea style={mono} onChange={(e) => { const v = e.target.value.trim(); const blob = v.includes("#o=") ? v.split("#o=")[1] : v; if (blob.length > 50) void startGuest(blob); }} placeholder="offer blob or link…" />
        </>
      )}
      {role === "guest" && guestAnswer && (
        <>
          <p>Send this answer back to the host:</p>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Qr text={guestAnswer} />
            <textarea style={mono} readOnly value={guestAnswer} onFocus={(e) => e.currentTarget.select()} />
          </div>
        </>
      )}
      {status && (
        <p style={{ marginTop: 14, color: status.startsWith("connected ✓") ? "#3fb950" : "#e6edf3" }}>
          {status} {rtt !== null && `· RTT ${rtt} ms`}
        </p>
      )}
    </div>
  );
}

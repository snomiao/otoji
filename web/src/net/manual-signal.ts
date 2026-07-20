// Serverless WebRTC pairing (offline-mesh ladder rung 2, TODO.md): two
// browsers exchange ONE offer blob and ONE answer blob by hand — copy/paste,
// a shared URL, or a QR — and connect directly with no signaling server.
// Non-trickle: each side waits for ICE gathering to complete so a single blob
// carries the whole SDP + candidates. On a hotspot LAN the host/mDNS
// candidates suffice, so this works with zero internet.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export interface DirectBlob {
  v: 1;
  type: "offer" | "answer";
  sdp: string;
}

export function encodeDirectBlob(b: DirectBlob): string {
  return compressToEncodedURIComponent(JSON.stringify(b));
}

export function decodeDirectBlob(s: string): DirectBlob | null {
  try {
    const raw = decompressFromEncodedURIComponent(s.trim());
    const parsed = raw ? (JSON.parse(raw) as DirectBlob) : null;
    if (!parsed || parsed.v !== 1 || typeof parsed.sdp !== "string") return null;
    if (parsed.type !== "offer" && parsed.type !== "answer") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A share URL that opens the guest side with the offer pre-loaded. */
export function directOfferUrl(offerBlob: string, origin = location.origin): string {
  return `${origin}/?direct#o=${offerBlob}`;
}

const gatherComplete = (pc: RTCPeerConnection): Promise<void> =>
  pc.iceGatheringState === "complete"
    ? Promise.resolve()
    : new Promise((res) => {
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            res();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        // safety valve: ship whatever gathered after 3s (slow interfaces)
        setTimeout(() => {
          pc.removeEventListener("icegatheringstatechange", check);
          res();
        }, 3000);
      });

export interface DirectLink {
  channel: RTCDataChannel;
  pc: RTCPeerConnection;
}

export interface DirectHost {
  /** encoded offer — show as text/URL/QR for the guest */
  offerBlob: string;
  /** feed the guest's answer blob back in to finish connecting */
  accept(answerBlob: string): Promise<void>;
  /** resolves when the data channel opens */
  link: Promise<DirectLink>;
  close(): void;
}

/** STUN helps across NATs when online; harmless (just slower gathering) offline. */
const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export async function createDirectHost(): Promise<DirectHost> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = pc.createDataChannel("direct", { ordered: true });
  const link = new Promise<DirectLink>((res, rej) => {
    channel.onopen = () => res({ channel, pc });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") rej(new Error("direct connection failed"));
    };
  });
  await pc.setLocalDescription(await pc.createOffer());
  await gatherComplete(pc);
  const offerBlob = encodeDirectBlob({ v: 1, type: "offer", sdp: pc.localDescription!.sdp });
  return {
    offerBlob,
    accept: async (answerBlob: string) => {
      const b = decodeDirectBlob(answerBlob);
      if (!b || b.type !== "answer") throw new Error("that is not an answer blob");
      await pc.setRemoteDescription({ type: "answer", sdp: b.sdp });
    },
    link,
    close: () => pc.close(),
  };
}

export interface DirectGuest {
  /** encoded answer — hand back to the host */
  answerBlob: string;
  link: Promise<DirectLink>;
  close(): void;
}

export async function createDirectGuest(offerBlob: string): Promise<DirectGuest> {
  const b = decodeDirectBlob(offerBlob);
  if (!b || b.type !== "offer") throw new Error("that is not an offer blob");
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const link = new Promise<DirectLink>((res, rej) => {
    pc.ondatachannel = (ev) => {
      ev.channel.onopen = () => res({ channel: ev.channel, pc });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") rej(new Error("direct connection failed"));
    };
  });
  await pc.setRemoteDescription({ type: "offer", sdp: b.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gatherComplete(pc);
  const answerBlob = encodeDirectBlob({ v: 1, type: "answer", sdp: pc.localDescription!.sdp });
  return { answerBlob, link, close: () => pc.close() };
}

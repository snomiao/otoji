import { SignalingClient, type Signaling } from "../src/net/signaling";
import { PeerMesh, type MeshCallbacks } from "../src/net/peers";
import { bytesToBase64 } from "../src/lib/base64";

export const MIC_PROTOCOL = "otoji.mic.v1";
export const MAX_SAMPLES = 30 * 16_000;
export const CHUNK_BYTES = 8_192;
export const MAX_PENDING = 2;
const MAX_WIRE = 16_000;

export interface RecognitionResult {
  text: string;
}
export interface RecognitionCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: Error) => void;
}
export interface RemoteRecognizer {
  recognize(samples: Float32Array): Promise<RecognitionResult>;
  close(): void;
}
export interface PeerOptions {
  signalingUrl: string;
  room: string;
  peerId: string;
  tabId?: string;
}
export interface MicMesh {
  consider(peerId: string): void;
  send(peerId: string, data: string): boolean;
  bufferedAmount(peerId: string): number;
  destroy(): void;
}
export interface PeerDependencies {
  createSignaling?: (options: PeerOptions, localId: string) => Signaling;
  createMesh?: (signaling: Signaling, localId: string, callbacks: MeshCallbacks) => MicMesh;
  timeoutMs?: number;
}
export interface MicMessage {
  v: typeof MIC_PROTOCOL;
  t: string;
  id: string;
  samples?: number;
  parts?: number;
  index?: number;
  pcm?: string;
  text?: string;
  error?: string;
}
export function parseMicMessage(raw: unknown): MicMessage | undefined {
  if (
    typeof raw !== "string" ||
    raw.length > MAX_WIRE ||
    new TextEncoder().encode(raw).length > MAX_WIRE
  )
    return;
  try {
    const m = JSON.parse(raw);
    if (
      m?.v === MIC_PROTOCOL &&
      typeof m.t === "string" &&
      typeof m.id === "string" &&
      m.id.length > 0 &&
      m.id.length <= 100
    )
      return m;
  } catch {
    /* Ignore unrelated mesh traffic. */
  }
}
export function validSamples(samples: Float32Array): void {
  if (!samples.length || samples.length > MAX_SAMPLES)
    throw new Error("Audio must contain at most 30 seconds at 16 kHz");
  for (const value of samples) if (!Number.isFinite(value)) throw new Error("Invalid audio sample");
}
export function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return bytes;
}

/** Signaling carries only SDP/ICE; every protocol message uses the reliable mesh channel. */
export function peerLink(
  options: PeerOptions,
  localId: string,
  callbacks: {
    onData(peerId: string, message: MicMessage): void;
    onOpen?(peerId: string): void;
    onDown?(peerId?: string): void;
  },
  deps: PeerDependencies = {},
) {
  if (!options.room || !localId || !options.peerId)
    throw new Error("A room and peer identity are required");
  const signaling =
    deps.createSignaling?.(options, localId) ??
    new SignalingClient(
      options.room,
      "otoji mic",
      "",
      "general",
      false,
      options.signalingUrl,
      localId,
    );
  let mesh: MicMesh | undefined;
  let closed = false;
  let epoch = 0;
  const offs = [
    signaling.on("hello", ({ peers = [] }) => {
      if (closed) return;
      const current = ++epoch;
      if (mesh) {
        mesh.destroy();
        callbacks.onDown?.();
      }
      const cb: MeshCallbacks = {
        onData: (id, label, raw) => {
          if (closed || current !== epoch || label !== "mesh") return;
          const message = parseMicMessage(raw);
          if (message) callbacks.onData(id, message);
        },
        onChannelOpen: (id, label) => {
          if (!closed && current === epoch && label === "mesh") callbacks.onOpen?.(id);
        },
        onPeerState: (id, state) => {
          if (!closed && current === epoch && ["disconnected", "failed", "closed"].includes(state))
            callbacks.onDown?.(id);
        },
      };
      mesh = deps.createMesh?.(signaling, localId, cb) ?? new PeerMesh(signaling, localId, cb);
      for (const peer of peers) if (typeof peer.peerId === "string") mesh.consider(peer.peerId);
    }),
    signaling.on("peer-joined", ({ peer }) => {
      if (!closed && peer?.peerId) mesh?.consider(peer.peerId);
    }),
    signaling.on("peer-left", ({ peerId }) => callbacks.onDown?.(peerId)),
    signaling.on("close", () => {
      epoch++;
      mesh?.destroy();
      mesh = undefined;
      callbacks.onDown?.();
    }),
  ];
  return {
    connect: () => signaling.connect(),
    send(id: string, message: Omit<MicMessage, "v">) {
      if (closed || !mesh || mesh.bufferedAmount(id) > 2_000_000) return false;
      try {
        const raw = JSON.stringify({ ...message, v: MIC_PROTOCOL });
        return (
          raw.length <= MAX_WIRE &&
          new TextEncoder().encode(raw).length <= MAX_WIRE &&
          mesh.send(id, raw)
        );
      } catch {
        return false;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      epoch++;
      offs.forEach((off) => off());
      mesh?.destroy();
      mesh = undefined;
      signaling.close();
    },
  };
}

export function connectPeerRecognizer(
  options: PeerOptions,
  callbacks: RecognitionCallbacks = {},
  deps: PeerDependencies = {},
): RemoteRecognizer {
  let closed = false;
  let next = 0;
  const sessionId = crypto.randomUUID();
  let open = false;
  type Pending = {
    samples: Float32Array;
    sent: boolean;
    resolve: (r: RecognitionResult) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<string, Pending>();
  const finish = (id: string, text?: string, error?: Error) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    p.samples = new Float32Array();
    if (error) {
      if (p.sent) link.send(options.peerId, { t: "cancel", id });
      p.reject(error);
      callbacks.onError?.(error);
    } else {
      p.resolve({ text: text! });
      callbacks.onFinal?.(text!);
    }
  };
  const request = (id: string, p: Pending) => {
    if (p.sent || !open) return;
    p.sent = true;
    if (
      !link.send(options.peerId, {
        t: "request",
        id,
        samples: p.samples.length,
        parts: Math.ceil((p.samples.length * 2) / CHUNK_BYTES),
      })
    )
      finish(id, undefined, new Error("Peer unavailable"));
  };
  const link = peerLink(
    options,
    options.tabId ?? crypto.randomUUID(),
    {
      onOpen(id) {
        if (id !== options.peerId) return;
        open = true;
        for (const [key, p] of pending) request(key, p);
      },
      onDown(id) {
        if (id && id !== options.peerId) return;
        open = false;
        for (const key of pending.keys()) finish(key, undefined, new Error("Peer disconnected"));
      },
      onData(sender, m) {
        if (sender !== options.peerId) return;
        const p = pending.get(m.id);
        if (!p || !p.sent) return;
        if (m.t === "grant") {
          if (!p.samples.length) return;
          const bytes = pcm16(p.samples);
          p.samples = new Float32Array();
          for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
            if (
              !link.send(sender, {
                t: "chunk",
                id: m.id,
                index,
                pcm: bytesToBase64(bytes.subarray(offset, offset + CHUNK_BYTES)),
              })
            ) {
              finish(m.id, undefined, new Error("Peer send failed"));
              return;
            }
          }
          if (!link.send(sender, { t: "end", id: m.id }))
            finish(m.id, undefined, new Error("Peer send failed"));
        } else if (m.t === "partial" && typeof m.text === "string") callbacks.onPartial?.(m.text);
        else if (m.t === "final" && typeof m.text === "string") finish(m.id, m.text);
        else if (m.t === "error")
          finish(
            m.id,
            undefined,
            new Error(typeof m.error === "string" ? m.error : "Peer recognition failed"),
          );
      },
    },
    deps,
  );
  link.connect();
  return {
    recognize(samples) {
      try {
        validSamples(samples);
      } catch (error) {
        return Promise.reject(error);
      }
      if (closed) return Promise.reject(new Error("Recognizer closed"));
      if (pending.size >= MAX_PENDING)
        return Promise.reject(new Error("Too many pending utterances"));
      const id = `${sessionId}:${++next}`;
      return new Promise((resolve, reject) => {
        const p: Pending = {
          samples: samples.slice(),
          sent: false,
          resolve,
          reject,
          timer: setTimeout(() => {
            finish(id, undefined, new Error("Peer recognition timed out"));
          }, deps.timeoutMs ?? 45_000),
        };
        pending.set(id, p);
        request(id, p);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      for (const id of pending.keys()) finish(id, undefined, new Error("Recognizer closed"));
      link.close();
    },
  };
}

export interface MicSocket {
  readyState: number;
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string | Uint8Array): void;
  close(): void;
}
export interface ServerOptions {
  serverUrl: string;
  voiceprint?: boolean;
  voiceprintDevice?: string;
}
export interface ServerDependencies {
  createSocket?: (url: string) => MicSocket;
  timeoutMs?: number;
}

/** Lianki STT protocol: ready, begin, tag-1 PCM16 frames, end, partial/final. */
export function connectServerRecognizer(
  options: ServerOptions,
  callbacks: RecognitionCallbacks = {},
  deps: ServerDependencies = {},
): RemoteRecognizer {
  const url = new URL(options.serverUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    !(url.protocol === "wss:" || (url.protocol === "ws:" && local))
  )
    throw new Error("Use a secure STT WebSocket URL");
  // One socket per utterance prevents ambiguous binary-frame ownership when requests overlap.
  const active = new Set<() => void>();
  let closed = false;
  return {
    recognize(samples) {
      try {
        validSamples(samples);
      } catch (error) {
        return Promise.reject(error);
      }
      if (closed) return Promise.reject(new Error("Recognizer closed"));
      if (active.size >= MAX_PENDING)
        return Promise.reject(new Error("Too many pending utterances"));
      return new Promise((resolve, reject) => {
        let socket: MicSocket;
        try {
          socket =
            deps.createSocket?.(url.href) ?? (new WebSocket(url.href) as unknown as MicSocket);
        } catch (error) {
          reject(error);
          return;
        }
        let finished = false;
        let sent = false;
        const finish = (error?: Error, text?: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          active.delete(cancel);
          socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
          socket.close();
          if (error) {
            reject(error);
            callbacks.onError?.(error);
          } else {
            resolve({ text: text! });
            callbacks.onFinal?.(text!);
          }
        };
        const cancel = () => finish(new Error("Recognizer closed"));
        const timer = setTimeout(
          () => finish(new Error("Server recognition timed out")),
          deps.timeoutMs ?? 45_000,
        );
        active.add(cancel);
        socket.binaryType = "arraybuffer";
        socket.onopen = () => {};
        socket.onerror = () => finish(new Error("STT server connection failed"));
        socket.onclose = () => finish(new Error("STT server disconnected"));
        socket.onmessage = ({ data }) => {
          if (typeof data !== "string" || data.length > MAX_WIRE) return;
          let m: { t?: string; id?: number; text?: string; error?: string };
          try {
            m = JSON.parse(data);
          } catch {
            return;
          }
          if (!m || typeof m !== "object") return;
          if (m.t === "ready" && !sent) {
            sent = true;
            try {
              if (options.voiceprint && options.voiceprintDevice)
                socket.send(JSON.stringify({ t: "hello", device: options.voiceprintDevice }));
              if (options.voiceprint !== undefined)
                socket.send(JSON.stringify({ t: "filter", on: options.voiceprint }));
              socket.send(JSON.stringify({ t: "begin", id: 1 }));
              const bytes = pcm16(samples);
              for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
                const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
                const frame = new Uint8Array(chunk.length + 1);
                frame[0] = 1;
                frame.set(chunk, 1);
                socket.send(frame);
              }
              socket.send(JSON.stringify({ t: "end", id: 1 }));
            } catch {
              finish(new Error("STT server send failed"));
            }
          } else if (sent && m.id === 1 && m.t === "partial" && typeof m.text === "string")
            callbacks.onPartial?.(m.text);
          else if (sent && m.id === 1 && m.t === "final" && typeof m.text === "string")
            finish(undefined, m.text);
          else if (m.t === "error")
            finish(new Error(typeof m.error === "string" ? m.error : "STT server error"));
        };
      });
    },
    close() {
      closed = true;
      for (const cancel of [...active]) cancel();
    },
  };
}

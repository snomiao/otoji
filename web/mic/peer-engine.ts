import { base64ToBytes } from "../src/lib/base64";
import {
  CHUNK_BYTES,
  MAX_PENDING,
  MAX_SAMPLES,
  peerLink,
  type PeerDependencies,
  type PeerOptions,
  type RecognitionResult,
} from "./remote";

export interface PeerEngineOptions extends PeerOptions {
  recognize(samples: Float32Array): Promise<RecognitionResult>;
  onPeerRequest?: (peerId: string) => Promise<boolean>;
  approvedPeers?: ReadonlySet<string>;
  onStatus?: (status: string) => void;
}

/** No PCM is accepted until this host explicitly approves the requesting peer. */
export function startPeerEngine(options: PeerEngineOptions, deps: PeerDependencies = {}) {
  let closed = false;
  let running = 0;
  type Utterance = {
    peer: string;
    id: string;
    samples: number;
    parts: number;
    chunks: Map<number, Uint8Array>;
    granted: boolean;
    running: boolean;
    timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<string, Utterance>();
  const seen = new Set<string>();
  const keyOf = (peer: string, id: string) => JSON.stringify([peer, id]);
  const forget = (key: string) => {
    const p = pending.get(key);
    if (p) {
      clearTimeout(p.timer);
      p.chunks.clear();
      pending.delete(key);
    }
  };
  const fail = (key: string, peer: string, id: string, error: string) => {
    forget(key);
    link.send(peer, { t: "error", id, error });
  };
  const link = peerLink(
    options,
    options.peerId,
    {
      onDown(peer) {
        for (const [key, p] of pending) if (!peer || p.peer === peer) forget(key);
        options.onStatus?.("Peer disconnected");
      },
      onData(peer, m) {
        const key = keyOf(peer, m.id);
        if (m.t === "request") {
          if (seen.has(key) || pending.has(key)) return;
          if (
            !Number.isInteger(m.samples) ||
            m.samples! < 1 ||
            m.samples! > MAX_SAMPLES ||
            m.parts !== Math.ceil((m.samples! * 2) / CHUNK_BYTES)
          ) {
            link.send(peer, { t: "error", id: m.id, error: "Invalid utterance size" });
            return;
          }
          if (pending.size >= MAX_PENDING || running >= MAX_PENDING) {
            link.send(peer, { t: "error", id: m.id, error: "Engine busy" });
            return;
          }
          seen.add(key);
          if (seen.size > 128) seen.delete(seen.values().next().value!);
          const p: Utterance = {
            peer,
            id: m.id,
            samples: m.samples!,
            parts: m.parts!,
            chunks: new Map(),
            granted: false,
            running: false,
            timer: setTimeout(
              () => fail(key, peer, m.id, "Recognition timed out"),
              deps.timeoutMs ?? 45_000,
            ),
          };
          pending.set(key, p);
          // Only metadata is retained while the permission dialog is open.
          void Promise.resolve()
            .then(() => options.approvedPeers?.has(peer) || options.onPeerRequest?.(peer) || false)
            .then((approved) => {
              if (closed || pending.get(key) !== p) return;
              if (approved !== true) {
                fail(key, peer, m.id, "Host did not approve this peer");
                return;
              }
              p.granted = true;
              if (!link.send(peer, { t: "grant", id: m.id })) forget(key);
            })
            .catch(() => {
              if (!closed && pending.get(key) === p) fail(key, peer, m.id, "Host approval failed");
            });
          return;
        }
        const p = pending.get(key);
        if (!p) return;
        if (m.t === "cancel") {
          forget(key);
          return;
        }
        if (!p.granted) {
          fail(key, peer, m.id, "Audio arrived before host approval");
          return;
        }
        if (p.running) return;
        if (m.t === "chunk") {
          if (
            !Number.isInteger(m.index) ||
            m.index! < 0 ||
            m.index! >= p.parts ||
            p.chunks.has(m.index!) ||
            typeof m.pcm !== "string" ||
            m.pcm.length > Math.ceil(CHUNK_BYTES / 3) * 4 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(m.pcm)
          ) {
            fail(key, peer, m.id, "Invalid or duplicate audio chunk");
            return;
          }
          try {
            const bytes = base64ToBytes(m.pcm);
            const expected = Math.min(CHUNK_BYTES, p.samples * 2 - m.index! * CHUNK_BYTES);
            if (bytes.length !== expected) throw new Error("Invalid PCM size");
            p.chunks.set(m.index!, bytes);
          } catch {
            fail(key, peer, m.id, "Invalid PCM data");
          }
        } else if (m.t === "end") {
          if (p.chunks.size !== p.parts) {
            fail(key, peer, m.id, "Incomplete utterance");
            return;
          }
          p.running = true;
          running++;
          const samples = new Float32Array(p.samples);
          for (let index = 0; index < p.parts; index++) {
            const bytes = p.chunks.get(index)!;
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            for (let j = 0; j < bytes.length / 2; j++)
              samples[(index * CHUNK_BYTES) / 2 + j] = view.getInt16(j * 2, true) / 32768;
          }
          p.chunks.clear();
          options.onStatus?.("Recognizing approved peer audio");
          void Promise.resolve()
            .then(() => options.recognize(samples))
            .then((result) => {
              if (closed || pending.get(key) !== p) return;
              if (typeof result?.text !== "string" || result.text.length > 12_000) {
                fail(key, peer, m.id, "Invalid recognition result");
                return;
              }
              forget(key);
              if (!link.send(peer, { t: "final", id: m.id, text: result.text }))
                link.send(peer, {
                  t: "error",
                  id: m.id,
                  error: "Recognition result too large or peer unavailable",
                });
              options.onStatus?.("Ready");
            })
            .catch(() => {
              if (!closed && pending.get(key) === p) fail(key, peer, m.id, "Recognition failed");
            })
            .finally(() => {
              running--;
            });
        }
      },
    },
    deps,
  );
  link.connect();
  options.onStatus?.("Waiting for peer requests");
  return {
    close() {
      if (closed) return;
      closed = true;
      for (const key of pending.keys()) forget(key);
      seen.clear();
      link.close();
      options.onStatus?.("Stopped");
    },
  };
}

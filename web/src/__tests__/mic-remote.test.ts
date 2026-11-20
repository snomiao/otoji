import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectPeerRecognizer,
  connectServerRecognizer,
  MIC_PROTOCOL,
  MAX_SAMPLES,
  type MicMesh,
  type MicSocket,
  type PeerDependencies,
} from "../../mic/remote";
import { startPeerEngine } from "../../mic/peer-engine";
import type { MeshCallbacks } from "../net/peers";
import type { Signaling } from "../net/signaling";

function network() {
  const meshes = new Map<string, { cb: MeshCallbacks; mesh: MicMesh }>();
  const messages: { from: string; to: string; raw: string }[] = [];
  const signals: Signaling[] = [];
  const emitters = new Map<string, (type: string, message: unknown) => void>();
  const deps: PeerDependencies = {
    timeoutMs: 1000,
    createSignaling(_options, id) {
      const handlers = new Map<string, Set<(message: any) => void>>();
      emitters.set(id, (type, message) => {
        for (const fn of handlers.get(type) ?? []) fn(message);
      });
      const s: Signaling = {
        peerId: id,
        on(type, fn) {
          if (!handlers.has(type)) handlers.set(type, new Set());
          handlers.get(type)!.add(fn);
          return () => {
            handlers.get(type)?.delete(fn);
          };
        },
        connect() {
          for (const fn of handlers.get("hello") ?? []) fn({ peerId: id, peers: [] });
        },
        close: vi.fn(),
        signal: vi.fn(),
        patchGraph: vi.fn(),
        publishFederatedGraph: vi.fn(),
        getGraph: vi.fn(),
        pipe: vi.fn(),
      };
      signals.push(s);
      return s;
    },
    createMesh(_signaling, id, cb) {
      const mesh: MicMesh = {
        consider: vi.fn(),
        bufferedAmount: () => 0,
        send(to, raw) {
          messages.push({ from: id, to, raw });
          const target = meshes.get(to);
          target?.cb.onData?.(id, "mesh", raw);
          return true;
        },
        destroy() {
          meshes.delete(id);
        },
      };
      meshes.set(id, { cb, mesh });
      queueMicrotask(() => {
        for (const [other, peer] of meshes)
          if (other !== id) {
            peer.cb.onChannelOpen?.(id, "mesh");
            cb.onChannelOpen?.(other, "mesh");
          }
      });
      return mesh;
    },
  };
  const deliver = (from: string, message: object) =>
    meshes.get("host")!.cb.onData!(from, "mesh", JSON.stringify({ v: MIC_PROTOCOL, ...message }));
  return {
    deps,
    meshes,
    messages,
    signals,
    deliver,
    emit: (id: string, type: string, message: unknown) => emitters.get(id)!(type, message),
  };
}
const options = {
  signalingUrl: "https://otoji.org/signal",
  room: "test-private-room",
  peerId: "host",
  tabId: "tab",
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe("peer mic transport", () => {
  it("waits for host approval, chunks PCM below 16KB, and returns only sender text", async () => {
    const net = network();
    let approve!: (ok: boolean) => void;
    const recognize = vi.fn(async (samples: Float32Array) => {
      expect(samples.length).toBe(10_000);
      expect(samples[0]).toBeCloseTo(-0.5);
      return { text: "hello" };
    });
    const host = startPeerEngine(
      {
        ...options,
        recognize,
        onPeerRequest: () =>
          new Promise((resolve) => {
            approve = resolve;
          }),
      },
      net.deps,
    );
    const final = vi.fn();
    const client = connectPeerRecognizer(options, { onFinal: final }, net.deps);
    await flush();
    const answer = client.recognize(new Float32Array(10_000).fill(-0.5));
    await flush();
    expect(net.messages.map((m) => JSON.parse(m.raw).t)).toEqual(["request"]);
    expect(recognize).not.toHaveBeenCalled();
    approve(true);
    await expect(answer).resolves.toEqual({ text: "hello" });
    expect(final).toHaveBeenCalledWith("hello");
    expect(net.messages.every((m) => m.raw.length < 16_384)).toBe(true);
    expect(net.messages.filter((m) => JSON.parse(m.raw).t === "final").map((m) => m.to)).toEqual([
      "tab",
    ]);
    expect(net.signals.every((s) => vi.mocked(s.signal).mock.calls.length === 0)).toBe(true);
    client.close();
    host.close();
    expect(net.meshes.size).toBe(0);
  });

  it("denies unknown peers without inference and rejects premature PCM", async () => {
    const net = network();
    const recognize = vi.fn();
    const host = startPeerEngine({ ...options, recognize }, net.deps);
    const client = connectPeerRecognizer(options, {}, net.deps);
    await flush();
    await expect(client.recognize(new Float32Array(10))).rejects.toThrow("approve");
    net.deliver("intruder", { t: "request", id: "bad", samples: 1, parts: 1 });
    net.deliver("intruder", { t: "chunk", id: "bad", index: 0, pcm: "AAA=" });
    await flush();
    expect(recognize).not.toHaveBeenCalled();
    expect(
      net.messages.some((m) => JSON.parse(m.raw).error === "Audio arrived before host approval"),
    ).toBe(true);
    client.close();
    host.close();
  });

  it("rejects duplicate, excess and incomplete chunks without inference", async () => {
    const net = network();
    const recognize = vi.fn();
    const host = startPeerEngine(
      { ...options, recognize, approvedPeers: new Set(["intruder"]) },
      net.deps,
    );
    for (const id of ["duplicate", "excess", "missing"]) {
      net.deliver("intruder", { t: "request", id, samples: 1, parts: 1 });
      await flush();
      if (id !== "missing") net.deliver("intruder", { t: "chunk", id, index: 0, pcm: "AAA=" });
      if (id === "duplicate") net.deliver("intruder", { t: "chunk", id, index: 0, pcm: "AAA=" });
      if (id === "excess") net.deliver("intruder", { t: "chunk", id, index: 1, pcm: "AAA=" });
      net.deliver("intruder", { t: "end", id });
    }
    expect(recognize).not.toHaveBeenCalled();
    expect(net.messages.filter((m) => JSON.parse(m.raw).t === "error")).toHaveLength(3);
    host.close();
  });

  it("caps pending work and duration, times out unanswered requests, and clears resources", async () => {
    vi.useFakeTimers();
    const net = network();
    const client = connectPeerRecognizer(options, {}, net.deps);
    const first = client.recognize(new Float32Array(1));
    const second = client.recognize(new Float32Array(1));
    await expect(client.recognize(new Float32Array(1))).rejects.toThrow("pending");
    await expect(client.recognize(new Float32Array(MAX_SAMPLES + 1))).rejects.toThrow("30 seconds");
    const checks = [
      expect(first).rejects.toThrow("timed out"),
      expect(second).rejects.toThrow("timed out"),
    ];
    await vi.advanceTimersByTimeAsync(1001);
    await Promise.all(checks);
    client.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(net.meshes.size).toBe(0);
  });

  it("rejects disconnected requests and ignores final text from a different peer", async () => {
    const net = network();
    const host = startPeerEngine(
      { ...options, recognize: vi.fn(), onPeerRequest: () => new Promise(() => {}) },
      net.deps,
    );
    const client = connectPeerRecognizer(options, {}, net.deps);
    await flush();
    const answer = client.recognize(new Float32Array(1));
    net.meshes.get("tab")!.cb.onData!(
      "spoof",
      "mesh",
      JSON.stringify({ v: MIC_PROTOCOL, t: "final", id: "1", text: "wrong" }),
    );
    const check = expect(answer).rejects.toThrow("disconnected");
    net.meshes.get("tab")!.cb.onPeerState!("host", "disconnected");
    await check;
    client.close();
    host.close();
  });

  it("expires host approval and ignores late approval", async () => {
    vi.useFakeTimers();
    const net = network();
    let approve!: (ok: boolean) => void;
    const host = startPeerEngine(
      {
        ...options,
        recognize: vi.fn(),
        onPeerRequest: () =>
          new Promise((r) => {
            approve = r;
          }),
      },
      net.deps,
    );
    net.deliver("visitor", { t: "request", id: "old", samples: 1, parts: 1 });
    await flush();
    await vi.advanceTimersByTimeAsync(1001);
    approve(true);
    await flush();
    expect(net.messages.some((m) => JSON.parse(m.raw).t === "grant")).toBe(false);
    host.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores callbacks from an old mesh after signaling reconnects", async () => {
    const net = network();
    const host = startPeerEngine(
      { ...options, recognize: async () => ({ text: "hello" }), onPeerRequest: async () => true },
      net.deps,
    );
    const client = connectPeerRecognizer(options, {}, net.deps);
    await flush();
    const oldCallbacks = net.meshes.get("tab")!.cb;
    net.emit("tab", "close", {});
    net.emit("tab", "hello", { peerId: "tab", peers: [] });
    await flush();
    const answer = client.recognize(new Float32Array(1));
    oldCallbacks.onPeerState!("host", "closed");
    oldCallbacks.onData!(
      "host",
      "mesh",
      JSON.stringify({ v: MIC_PROTOCOL, t: "final", id: "1", text: "stale result" }),
    );
    await expect(answer).resolves.toEqual({ text: "hello" });
    client.close();
    host.close();
  });

  it("recognizes after recreating a client with the same stable tab identity", async () => {
    const net = network();
    const host = startPeerEngine(
      { ...options, recognize: async () => ({ text: "hello" }), approvedPeers: new Set(["tab"]) },
      net.deps,
    );
    const first = connectPeerRecognizer(options, {}, net.deps);
    await flush();
    await expect(first.recognize(new Float32Array(1))).resolves.toEqual({ text: "hello" });
    first.close();
    const second = connectPeerRecognizer(options, {}, net.deps);
    await flush();
    await expect(second.recognize(new Float32Array(1))).resolves.toEqual({ text: "hello" });
    second.close();
    host.close();
  });
});

class FakeSocket implements MicSocket {
  readyState = 1;
  binaryType = "";
  onopen: MicSocket["onopen"] = null;
  onmessage: MicSocket["onmessage"] = null;
  onerror: MicSocket["onerror"] = null;
  onclose: MicSocket["onclose"] = null;
  sent: (string | Uint8Array)[] = [];
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close = vi.fn();
  message(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("STT WebSocket transport", () => {
  it("selects the explicitly configured enrolled voice profile before sending audio", async () => {
    const socket = new FakeSocket();
    const client = connectServerRecognizer(
      { serverUrl: "wss://speech.example/stt", voiceprint: true, voiceprintDevice: "test-device" },
      {},
      { createSocket: () => socket },
    );
    const result = client.recognize(new Float32Array(512));
    socket.message({ t: "ready" });
    expect(JSON.parse(socket.sent[0] as string)).toEqual({ t: "hello", device: "test-device" });
    expect(JSON.parse(socket.sent[1] as string)).toEqual({ t: "filter", on: true });
    socket.message({ t: "final", id: 1, text: "", filtered: { reason: "voice" } });
    await expect(result).resolves.toEqual({ text: "" });
    client.close();
  });
  it("waits for ready then sends tagged PCM, begin/end, partial/final with optional filter", async () => {
    const socket = new FakeSocket();
    const partial = vi.fn();
    const createSocket = vi.fn(() => socket);
    const client = connectServerRecognizer(
      { serverUrl: "https://speech.example/stt", voiceprint: true },
      { onPartial: partial },
      { createSocket },
    );
    const answer = client.recognize(new Float32Array([0, -1, 1]));
    expect(socket.sent).toEqual([]);
    socket.message({ t: "ready" });
    expect(createSocket).toHaveBeenCalledWith("wss://speech.example/stt");
    expect(JSON.parse(socket.sent[0] as string)).toEqual({ t: "filter", on: true });
    expect(JSON.parse(socket.sent[1] as string)).toEqual({ t: "begin", id: 1 });
    expect([...(socket.sent[2] as Uint8Array)]).toEqual([1, 0, 0, 0, 128, 255, 127]);
    expect(JSON.parse(socket.sent[3] as string)).toEqual({ t: "end", id: 1 });
    socket.message({ t: "partial", id: 1, text: "hel" });
    expect(partial).toHaveBeenCalledWith("hel");
    socket.message({ t: "final", id: 1, text: "hello" });
    await expect(answer).resolves.toEqual({ text: "hello" });
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.onmessage).toBeNull();
    client.close();
  });

  it("rejects failed connections and close clears deadlines/listeners", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = connectServerRecognizer(
      { serverUrl: "ws://localhost:8765" },
      {},
      {
        createSocket: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
        timeoutMs: 100,
      },
    );
    const first = client.recognize(new Float32Array(1));
    const failure = expect(first).rejects.toThrow("connection failed");
    sockets[0].onerror!();
    await failure;
    const second = client.recognize(new Float32Array(1));
    const cancelled = expect(second).rejects.toThrow("closed");
    client.close();
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
    expect(sockets.every((s) => s.onmessage === null && s.onclose === null)).toBe(true);
    expect(() => connectServerRecognizer({ serverUrl: "ws://speech.example" })).toThrow("secure");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSherpaNativeStream } from "../providers/stt/sherpa_native";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  binaryType = "";
  readyState = FakeWebSocket.CONNECTING;
  sent: ArrayBuffer[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(buf: ArrayBuffer) {
    this.sent.push(buf);
  }

  close() {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  error() {
    this.onerror?.();
  }
}

const RealWebSocket = globalThis.WebSocket;

afterEach(() => {
  globalThis.WebSocket = RealWebSocket;
  FakeWebSocket.instances = [];
  vi.restoreAllMocks();
});

describe("createSherpaNativeStream", () => {
  it("buffers pre-open samples and flushes them as streaming-sized PCM frames", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const stream = createSherpaNativeStream("ws://test", () => {}, () => {});

    stream.accept(new Float32Array(1280).fill(0.25));
    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toHaveLength(0);

    ws.open();
    expect(ws.sent).toHaveLength(2);
    expect(ws.sent[0].byteLength).toBe(640 * 2);
    expect(ws.sent[1].byteLength).toBe(640 * 2);
  });

  it("does not flush buffered audio after free is called before open", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const stream = createSherpaNativeStream("ws://test", () => {}, () => {});

    stream.accept(new Float32Array(640).fill(0.25));
    stream.free();
    const ws = FakeWebSocket.instances[0];

    expect(ws.closed).toBe(true);
    ws.open();
    expect(ws.sent).toHaveLength(0);
  });

  it("drops future samples after a pre-open connection error", () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const onError = vi.fn();
    const stream = createSherpaNativeStream("ws://test", () => {}, () => {}, onError);

    stream.accept(new Float32Array(640).fill(0.25));
    const ws = FakeWebSocket.instances[0];
    ws.error();
    stream.accept(new Float32Array(640).fill(0.25));
    ws.open();

    expect(onError).toHaveBeenCalledOnce();
    expect(ws.sent).toHaveLength(0);
  });
});

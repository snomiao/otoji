import { afterEach, describe, it, expect, vi } from "vitest";
import { PeerMesh, shouldInitiate } from "../net/peers";
import { peerConnKind } from "../ui/PeerBadge";

afterEach(() => vi.unstubAllGlobals());

describe("shouldInitiate (perfect-negotiation tie-break)", () => {
  it("exactly one side of a pair initiates", () => {
    const a = "aaaa";
    const b = "bbbb";
    expect(shouldInitiate(a, b)).toBe(false);
    expect(shouldInitiate(b, a)).toBe(true);
    // symmetric: never both, never neither
    expect(shouldInitiate(a, b) !== shouldInitiate(b, a)).toBe(true);
  });

  it("never initiates to self", () => {
    expect(shouldInitiate("x", "x")).toBe(false);
  });
});

describe("PeerMesh ICE ordering", () => {
  it("queues candidates received before the remote description", async () => {
    const calls: string[] = [];
    class FakePeerConnection {
      remoteDescription: RTCSessionDescriptionInit | null = null;
      localDescription: RTCSessionDescriptionInit | null = null;
      signalingState: RTCSignalingState = "stable";
      connectionState: RTCPeerConnectionState = "new";
      onicecandidate = null;
      onnegotiationneeded = null;
      onconnectionstatechange = null;
      ondatachannel = null;
      createDataChannel() { return { label: "mesh", readyState: "connecting" }; }
      async setRemoteDescription(description: RTCSessionDescriptionInit) { calls.push("description"); this.remoteDescription = description; }
      async setLocalDescription() { this.localDescription = { type: "answer", sdp: "answer" }; }
      async addIceCandidate() { calls.push("candidate"); }
      close() {}
    }
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const handlers = new Map<string, (message: any) => void>();
    const signaling = {
      peerId: "self",
      on: (type: string, fn: (message: any) => void) => { handlers.set(type, fn); return () => handlers.delete(type); },
      signal: vi.fn(), patchGraph: vi.fn(), publishFederatedGraph: vi.fn(), getGraph: vi.fn(), pipe: vi.fn(), connect: vi.fn(), close: vi.fn(),
    };
    const mesh = new PeerMesh(signaling, "self");
    await handlers.get("signal")?.({ from: "remote", data: { candidate: { candidate: "ice" } } });
    expect(calls).toEqual([]);
    await handlers.get("signal")?.({ from: "remote", data: { description: { type: "offer", sdp: "offer" } } });
    expect(calls).toEqual(["description", "candidate"]);
    mesh.destroy();
  });
});

describe("peer connection badge", () => {
  it("distinguishes a native model host from a browser tab", () => {
    expect(peerConnKind("native", "wan")).toBe("native");
    expect(peerConnKind("browser")).toBe("browser");
  });
});

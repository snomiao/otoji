import { describe, it, expect, vi } from "vitest";
import { PreviewSync, type PreviewSender, type PreviewMessage } from "../graph/preview-sync";
import { LiveStore } from "../graph/live-store";

// Wire two PreviewSync instances (an owner + a subscriber) through fake senders
// that deliver straight into the other side's handleMessage, so we exercise the
// full pv-sub → pv loop without a real mesh.
function pair() {
  const ownerLive = new LiveStore();
  const subLive = new LiveStore();
  const owner = new PreviewSync(ownerLive);
  const sub = new PreviewSync(subLive);
  const ownerSender: PreviewSender = {
    send: (_peer, s) => (sub.handleMessage(JSON.parse(s) as PreviewMessage, "owner"), true),
    broadcast: (s) => (sub.handleMessage(JSON.parse(s) as PreviewMessage, "owner"), 1),
  };
  const subSender: PreviewSender = {
    send: (_peer, s) => (owner.handleMessage(JSON.parse(s) as PreviewMessage, "sub"), true),
    broadcast: (s) => (owner.handleMessage(JSON.parse(s) as PreviewMessage, "sub"), 1),
  };
  owner.setSender(ownerSender);
  sub.setSender(subSender);
  return { owner, sub, ownerLive, subLive };
}

describe("PreviewSync", () => {
  it("does not emit until a peer subscribes", () => {
    const { owner, subLive } = pair();
    owner.onLocalPreview("n1", "txt", "hi");
    expect(owner.hasSubscriber("n1")).toBe(false);
    expect(subLive.getTexts("n1")).toEqual([]);
  });

  it("streams text/busy/queue to a subscriber and stops after it leaves", () => {
    const { owner, sub, subLive } = pair();
    sub.setSubscriptions(["n1"]); // → broadcasts pv-sub → owner records "sub"
    expect(owner.hasSubscriber("n1")).toBe(true);

    owner.onLocalPreview("n1", "txt", "hello");
    owner.onLocalPreview("n1", "busy", true);
    owner.onLocalPreview("n1", "queue", { processing: "job", queued: ["a", "b"] });
    expect(subLive.getTexts("n1")).toEqual(["hello"]);
    expect(subLive.getBusy("n1")).toBe(true);
    expect(subLive.getQueue("n1")).toEqual({ processing: "job", queued: ["a", "b"] });

    owner.dropPeer("sub"); // peer left
    expect(owner.hasSubscriber("n1")).toBe(false);
    owner.onLocalPreview("n1", "txt", "after-leave");
    expect(subLive.getTexts("n1")).toEqual(["hello"]); // unchanged
  });

  it("ignores pv for nodes the receiver did not subscribe to", () => {
    const { owner, sub, subLive } = pair();
    sub.setSubscriptions(["n1"]);
    // Owner is (incorrectly) asked to emit for an un-subscribed node — force it by
    // registering a subscriber for n2, then delivering; receiver must drop it.
    owner.handleMessage({ k: "pv-sub", nodes: ["n1", "n2"] }, "sub");
    owner.onLocalPreview("n2", "txt", "leak");
    expect(subLive.getTexts("n2")).toEqual([]); // sub only wants n1
  });

  it("batches waveform levels and flushes them on a timer", () => {
    vi.useFakeTimers();
    try {
      const { owner, sub, subLive } = pair();
      sub.setSubscriptions(["mic"]);
      owner.onLocalPreview("mic", "lvl", { rms: 0.1, active: true });
      owner.onLocalPreview("mic", "lvl", { rms: 0.2, active: true });
      expect(subLive.getLevels("mic")).toEqual([]); // buffered, not yet flushed
      vi.advanceTimersByTime(100);
      expect(subLive.getLevels("mic")).toEqual([
        { rms: 0.1, active: true },
        { rms: 0.2, active: true },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a peer's subscription list against a misbehaving peer", () => {
    const live = new LiveStore();
    const ps = new PreviewSync(live);
    ps.setSender({ send: () => true, broadcast: () => 1 });
    const many = Array.from({ length: 500 }, (_, i) => `n${i}`);
    ps.handleMessage({ k: "pv-sub", nodes: [...many, "x".repeat(999)] }, "peer");
    // capped at 256, and the absurdly long id is ignored
    const kept = many.filter((id) => ps.hasSubscriber(id)).length;
    expect(kept).toBe(256);
    expect(ps.hasSubscriber("x".repeat(999))).toBe(false);
  });

  it("setSubscriptions only re-broadcasts when the set actually changes", () => {
    const live = new LiveStore();
    const ps = new PreviewSync(live);
    const broadcast = vi.fn((_s: string) => 1);
    ps.setSender({ send: () => true, broadcast });
    ps.setSubscriptions(["a", "b"]);
    ps.setSubscriptions(["b", "a"]); // same set, different order
    expect(broadcast).toHaveBeenCalledTimes(1);
    ps.setSubscriptions(["a"]); // changed
    expect(broadcast).toHaveBeenCalledTimes(2);
  });
});

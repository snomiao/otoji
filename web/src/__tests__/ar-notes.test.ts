import { describe, expect, it } from "vitest";
import { NOTE_COLORS, PinchTracker, pinchRatio, placeNote, type HandLandmark } from "../providers/vision/ar-notes";

// 21-landmark hand with controllable thumb-tip(4)/index-tip(8) distance.
// Hand span (wrist 0 → middle MCP 9) is fixed at 0.2 normalized units.
function hand(tipGap: number): HandLandmark[] {
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.8 };
  lm[9] = { x: 0.5, y: 0.6 };
  lm[4] = { x: 0.5 - tipGap / 2, y: 0.4 };
  lm[8] = { x: 0.5 + tipGap / 2, y: 0.4 };
  return lm;
}

describe("pinchRatio", () => {
  it("normalizes tip distance by hand span", () => {
    expect(pinchRatio(hand(0.05))).toBeCloseTo(0.25);
    expect(pinchRatio(hand(0.2))).toBeCloseTo(1);
  });

  it("returns null without the required landmarks", () => {
    expect(pinchRatio(undefined)).toBeNull();
    expect(pinchRatio([])).toBeNull();
    expect(pinchRatio(hand(0.1).slice(0, 5))).toBeNull();
  });
});

describe("PinchTracker", () => {
  it("fires start only on an open→pinched transition", () => {
    const p = new PinchTracker();
    expect(p.update(hand(0.2))).toBe("idle"); // open
    expect(p.update(hand(0.02))).toBe("start");
    expect(p.update(hand(0.02))).toBe("hold");
    expect(p.update(hand(0.2))).toBe("end");
    expect(p.update(hand(0.02))).toBe("start");
  });

  it("does not fire start when tracking begins mid-pinch", () => {
    const p = new PinchTracker();
    expect(p.update(hand(0.02))).toBe("hold"); // unknown → pinched, no start
    expect(p.update(hand(0.02))).toBe("hold");
    expect(p.update(hand(0.2))).toBe("end");
    expect(p.update(hand(0.02))).toBe("start"); // real transition after release
  });

  it("holds through the hysteresis band and hand loss ends a pinch", () => {
    const p = new PinchTracker();
    p.update(hand(0.2));
    expect(p.update(hand(0.02))).toBe("start");
    expect(p.update(hand(0.08))).toBe("hold"); // ratio 0.4: between ON and OFF
    expect(p.update(undefined)).toBe("end");
    expect(p.update(hand(0.02))).toBe("hold"); // unknown again: no spurious start
  });
});

describe("placeNote", () => {
  it("appends immutably and cycles colors", () => {
    let notes = placeNote([], "a", { x: 0.1, y: 0.2, z: 0.7 }, 1000);
    const first = notes;
    for (let i = 1; i < NOTE_COLORS.length + 1; i++) notes = placeNote(notes, `n${i}`, { x: 0, y: 0, z: 1 }, 1000 + i);
    expect(first).toHaveLength(1);
    expect(notes).toHaveLength(NOTE_COLORS.length + 1);
    expect(notes[0].color).toBe(NOTE_COLORS[0]);
    expect(notes[NOTE_COLORS.length].color).toBe(NOTE_COLORS[0]); // cycled
    expect(notes[0].pos).toEqual({ x: 0.1, y: 0.2, z: 0.7 });
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });
});

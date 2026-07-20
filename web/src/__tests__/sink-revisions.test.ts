import { describe, expect, it } from "vitest";
import { applySinkRevision } from "../graph/sink-revisions";

const provisional = (segmentId: number, revision: number, sourceId = "asr1") =>
  ({ segmentId, revision, sourceId, status: "provisional" as const });
const final = (segmentId: number, revision: number, sourceId = "asr1") =>
  ({ segmentId, revision, sourceId, status: "final" as const, replacesRevision: revision - 1 });

describe("sink revision reconciliation", () => {
  it("finals replace their provisional row", () => {
    const rows = [{ segmentId: 1, sourceId: "asr1", revision: 3, provisional: true }];
    expect(applySinkRevision(rows, final(1, 4))).toEqual({ type: "replace", index: 0 });
  });

  it("identity is (sourceId, segmentId): another recognizer's ids never collide", () => {
    const rows = [{ segmentId: 1, sourceId: "asr1", revision: 3, provisional: true }];
    expect(applySinkRevision(rows, final(1, 4, "asr2"))).toEqual({ type: "append" });
  });

  it("a straggling provisional cannot resurrect a settled row", () => {
    // final arrived first (cross-device reordering), provisional straggles in
    const rows = [{ segmentId: 7, sourceId: "asr1", revision: 5, provisional: false }];
    expect(applySinkRevision(rows, provisional(7, 4))).toEqual({ type: "drop" });
  });

  it("an out-of-order final appends, then wins over the late provisional", () => {
    const rows: { segmentId?: number; sourceId?: string; revision?: number; provisional?: boolean }[] = [];
    expect(applySinkRevision(rows, final(2, 9))).toEqual({ type: "append" });
    rows.push({ segmentId: 2, sourceId: "asr1", revision: 9, provisional: false });
    expect(applySinkRevision(rows, provisional(2, 8))).toEqual({ type: "drop" });
  });

  it("a duplicated final is dropped, a newer final replaces", () => {
    const rows = [{ segmentId: 3, sourceId: "asr1", revision: 6, provisional: false }];
    expect(applySinkRevision(rows, final(3, 6))).toEqual({ type: "drop" });
    expect(applySinkRevision(rows, final(3, 7))).toEqual({ type: "replace", index: 0 });
  });

  it("a growing provisional updates the previous provisional", () => {
    const rows = [{ segmentId: 4, sourceId: "asr1", revision: 1, provisional: true }];
    expect(applySinkRevision(rows, provisional(4, 2))).toEqual({ type: "replace", index: 0 });
  });

  it("pre-revision traffic always appends", () => {
    expect(applySinkRevision([{ segmentId: 1, revision: 1, provisional: true }], { status: "final" })).toEqual({ type: "append" });
  });
});

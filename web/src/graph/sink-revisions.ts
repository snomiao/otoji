// Sink-side revision reconciliation (M6.0/M6.3). A recognizer emits
// provisional rows that a later pass-2 final supersedes; rows are identified
// by (sourceId, segmentId) so two recognizers — or a restarted stream — can
// never replace each other's entries, and arrival order is not trusted: a
// final that beats its provisional across the mesh must win when the
// provisional straggles in afterwards.

export interface SinkRevisionRow {
  segmentId?: number;
  sourceId?: string;
  revision?: number;
  provisional?: boolean;
}

export interface SinkRevisionMsg {
  segmentId?: number;
  sourceId?: string;
  revision?: number;
  status?: "partial" | "provisional" | "final";
  replacesRevision?: number;
}

export type SinkRevisionAction =
  | { type: "append" }
  | { type: "replace"; index: number }
  | { type: "drop" };

const sameIdentity = (row: SinkRevisionRow, msg: SinkRevisionMsg): boolean =>
  row.segmentId !== undefined &&
  row.segmentId === msg.segmentId &&
  (row.sourceId ?? "") === (msg.sourceId ?? "");

/**
 * Decide what an incoming provisional/final transcript does to the sink list.
 * `rows` is oldest-first; the returned index refers into it.
 */
export function applySinkRevision(rows: readonly SinkRevisionRow[], msg: SinkRevisionMsg): SinkRevisionAction {
  if (msg.segmentId === undefined) return { type: "append" }; // pre-revision traffic
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!sameIdentity(row, msg)) continue;
    const rowRev = row.revision ?? 0;
    const msgRev = msg.revision ?? 0;
    if (msg.status === "provisional") {
      // a straggling provisional must never resurrect or duplicate a row its
      // final already settled
      return msgRev > rowRev && row.provisional ? { type: "replace", index: i } : { type: "drop" };
    }
    // finals: replace the row when they advance it (covers the normal
    // provisional→final upgrade AND a re-emitted/duplicated final)
    return msgRev > rowRev ? { type: "replace", index: i } : { type: "drop" };
  }
  return { type: "append" };
}

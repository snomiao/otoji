// Line-based text diff for the Text-diff node. Compares the previous input
// against the current one and renders only what changed, in a chosen style.
//
// The first input (prev === null) renders as all-additions, so a fresh stream
// starts with the whole text marked `+`. Styles are pluggable — "gitdiff" is the
// default; "jsonl" emits one JSON object per changed line (handy to pipe into a
// CLI / log). Future styles (word-level, structured patch) slot in here.

export type DiffStyle = "gitdiff" | "jsonl";
export const DIFF_STYLES: { id: DiffStyle; name: string }[] = [
  { id: "gitdiff", name: "git diff (+/-)" },
  { id: "jsonl", name: "JSONL changes" },
];
export const DEFAULT_DIFF_STYLE: DiffStyle = "gitdiff";

export interface DiffOp {
  type: "add" | "del" | "same";
  line: string;
}

function splitLines(s: string): string[] {
  return s.length ? s.split("\n") : [];
}

/** Classic LCS line diff: ops in source order, ties prefer deletions first. */
export function lineDiff(prev: string, next: string): DiffOp[] {
  const a = splitLines(prev);
  const b = splitLines(next);
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++] });
  while (j < m) ops.push({ type: "add", line: b[j++] });
  return ops;
}

/**
 * Render the change from `prev` (null = first input → all additions) to `next`
 * in the given style. Returns "" when nothing changed (the node emits nothing).
 */
export function diffText(prev: string | null, next: string, style: DiffStyle = DEFAULT_DIFF_STYLE): string {
  const ops = lineDiff(prev ?? "", next);
  const changes = ops.filter((o) => o.type !== "same");
  if (changes.length === 0) return "";
  if (style === "jsonl") {
    return changes
      .map((o) => JSON.stringify({ op: o.type === "add" ? "+" : "-", line: o.line }))
      .join("\n");
  }
  // gitdiff: changed lines only, +/- prefixed (no surrounding context).
  return changes.map((o) => (o.type === "add" ? "+" : "-") + o.line).join("\n");
}

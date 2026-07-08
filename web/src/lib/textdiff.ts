// Line-based text diff for the Text-diff node. Compares the previous input
// against the current one and renders only what changed, in a chosen style.
//
// The first input (prev === null) renders as all-additions, so a fresh stream
// starts with the whole text marked `+`. Styles are pluggable — "gitdiff" is the
// default; "jsonl" emits one JSON object per changed line (handy to pipe into a
// CLI / log); "inline" marks the changed words WITHIN a line in git
// --word-diff form (`[-old-]{+new+}`), so a one-word edit doesn't re-emit the
// whole line as -/+ pairs.

export type DiffStyle = "gitdiff" | "jsonl" | "inline";
export const DIFF_STYLES: { id: DiffStyle; name: string }[] = [
  { id: "gitdiff", name: "git diff (+/-)" },
  { id: "inline", name: "inline word diff" },
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

/** Classic LCS diff over any token array: ops in source order, deletions first on ties. */
function lcsOps(a: string[], b: string[]): { type: "add" | "del" | "same"; tok: string }[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: { type: "add" | "del" | "same"; tok: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", tok: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", tok: a[i] });
      i++;
    } else {
      ops.push({ type: "add", tok: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", tok: a[i++] });
  while (j < m) ops.push({ type: "add", tok: b[j++] });
  return ops;
}

/** Classic LCS line diff: ops in source order, ties prefer deletions first. */
export function lineDiff(prev: string, next: string): DiffOp[] {
  return lcsOps(splitLines(prev), splitLines(next)).map((o) => ({ type: o.type, line: o.tok }));
}

/**
 * One line's change in git --word-diff form: unchanged words as-is, removed
 * word runs as `[-...-]`, inserted runs as `{+...+}` (adjacent changed words
 * merge into one marker). Diffs whitespace-insensitively and rejoins with
 * single spaces — fine for transcripts, where spacing carries no meaning.
 */
export function wordDiffLine(prev: string, next: string): string {
  const words = (s: string) => (s.trim().length ? s.trim().split(/\s+/) : []);
  const ops = lcsOps(words(prev), words(next));
  let out = "";
  let i = 0;
  let prevType: "add" | "del" | "same" | null = null;
  while (i < ops.length) {
    const t = ops[i].type;
    const run: string[] = [];
    while (i < ops.length && ops[i].type === t) run.push(ops[i++].tok);
    const joined = run.join(" ");
    const seg = t === "same" ? joined : t === "del" ? `[-${joined}-]` : `{+${joined}+}`;
    // a replacement reads as one unit: `[-old-]{+new+}` with no gap (git style)
    out += (out && !(prevType === "del" && t === "add") ? " " : "") + seg;
    prevType = t;
  }
  return out;
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
  if (style === "inline") {
    // Pair each run of deletions with the additions that follow it (a replaced
    // block) and word-diff line k against line k; leftovers render whole-line.
    const out: string[] = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === "same") {
        i++;
        continue;
      }
      const dels: string[] = [];
      const adds: string[] = [];
      while (i < ops.length && ops[i].type === "del") dels.push(ops[i++].line);
      while (i < ops.length && ops[i].type === "add") adds.push(ops[i++].line);
      const k = Math.min(dels.length, adds.length);
      for (let p = 0; p < k; p++) out.push(wordDiffLine(dels[p], adds[p]));
      for (let p = k; p < dels.length; p++) out.push(`[-${dels[p]}-]`);
      for (let p = k; p < adds.length; p++) out.push(`{+${adds[p]}+}`);
    }
    return out.join("\n");
  }
  // gitdiff: changed lines only, +/- prefixed (no surrounding context).
  return changes.map((o) => (o.type === "add" ? "+" : "-") + o.line).join("\n");
}

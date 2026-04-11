#!/usr/bin/env bash
# Multi-seed driver for otoji listen QA. Runs the matrix over several seeds
# and aggregates the per-config means into one report.
#
# Usage: scripts/otoji-listen-qa-multi.sh [--plays N] [--seeds "1 2 3"]

set -euo pipefail

PLAYS=6
SEEDS="1 3 7 11"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plays) PLAYS="$2"; shift 2 ;;
    --seeds) SEEDS="$2"; shift 2 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

OUT="target/otoji-listen-qa/multi-$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$OUT"
echo "multi-seed run: plays=$PLAYS seeds=$SEEDS" | tee "$OUT/info.txt"

SESSIONS=()
for seed in $SEEDS; do
  echo
  echo "================ seed=$seed ================"
  bun scripts/otoji-listen-qa.ts --plays "$PLAYS" --seed "$seed" --matrix \
    --out-dir "$OUT/seed_$seed" 2>&1 | tee "$OUT/seed_$seed.log"
  SESSIONS+=("$OUT/seed_$seed")
done

echo
echo "================ aggregate ================"
bun -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[process.argv.length - 1];
const byConfig = {};
function walk(p) {
  for (const e of fs.readdirSync(p)) {
    const f = path.join(p, e);
    const st = fs.statSync(f);
    if (st.isDirectory()) walk(f);
    else if (e === "matrix.json") {
      const rows = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const r of rows) (byConfig[r.config.name] ||= []).push(r);
    }
  }
}
walk(root);
const fmtPct = (x) => (x * 100).toFixed(1) + "%";
const fmtMs = (x) => Math.round(x).toString().padStart(5) + "ms";
console.log("");
console.log("config                       | runs | capture | acc    | ttfb_mean | ttfb_p95 | rtf");
console.log("-----------------------------+------+---------+--------+-----------+----------+-----");
for (const [k, rs] of Object.entries(byConfig)) {
  const mean = (sel) => rs.reduce((a, r) => a + sel(r), 0) / rs.length;
  console.log(
    k.padEnd(28) + " | " +
    String(rs.length).padStart(4) + " | " +
    fmtPct(mean(r => r.captureRate)).padStart(7) + " | " +
    fmtPct(mean(r => r.meanAccuracy)).padStart(6) + " | " +
    fmtMs(mean(r => r.meanTtfbMs)).padStart(9) + " | " +
    fmtMs(mean(r => r.p95TtfbMs)).padStart(8) + " | " +
    mean(r => r.rtf).toFixed(2) + "x"
  );
}
' "$OUT" | tee "$OUT/aggregate.txt"

echo
echo "results: $OUT/aggregate.txt"

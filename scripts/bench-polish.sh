#!/usr/bin/env bash
# Benchmark polish-model TTFB across multiple providers.
#
# Reads API keys from ./env.local (OTOJI manifest dir) so no secrets on
# the command line. Prints a Markdown table to stdout — pipe into
# docs/09-polish-benchmarks.md or paste into PRs.
#
# Usage: scripts/bench-polish.sh [runs]   (default 5 runs per model)

set -u

RUNS="${1:-5}"
PROMPT='Tidy to one polished sentence, no preamble, no quotes: how are you doing today'

# Load .env.local if present.
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

# Collect timings into an associative array via temp files.
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

measure() {
  local label=$1 url=$2 body=$3 auth=$4 # auth is just "Bearer ...", may be empty
  echo "  [$label] warming up..." >&2
  local hdr_args=(-H "Content-Type: application/json")
  if [ -n "$auth" ]; then
    hdr_args+=(-H "Authorization: $auth")
  fi
  # Warmup (cache prompt / routes).
  curl -sS -o /dev/null -X POST "$url" "${hdr_args[@]}" -d "$body" >/dev/null 2>&1 || true
  sleep 1
  local times=""
  for _ in $(seq 1 $RUNS); do
    local t
    t=$(curl -sS -o /dev/null -w "%{time_total}\n" -X POST "$url" "${hdr_args[@]}" -d "$body" 2>/dev/null | head -1)
    local ms
    ms=$(python3 -c "import sys; print(int(float(sys.argv[1]) * 1000))" "$t" 2>/dev/null || echo "0")
    times="$times $ms"
    sleep 1
  done
  # Median.
  local sorted
  sorted=$(echo $times | tr ' ' '\n' | sort -n)
  local n mid
  n=$(echo "$sorted" | wc -l | tr -d ' ')
  mid=$(( n / 2 + 1 ))
  local median
  median=$(echo "$sorted" | sed -n "${mid}p")
  echo "$label|$median|$times" >> "$TMP/results"
}

# ── Gemini 2.5-flash-lite (thinkingBudget=0) ──────────────────────────
if [ -n "${GEMINI_API_KEY:-}" ]; then
  URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=$GEMINI_API_KEY"
  BODY=$(python3 -c '
import json, sys
print(json.dumps({"contents":[{"parts":[{"text": sys.argv[1]}]}],"generationConfig":{"thinkingConfig":{"thinkingBudget":0}}}))' "$PROMPT")
  measure "Gemini 2.5-flash-lite (think=0)" "$URL" "$BODY" ""
fi

# ── OpenAI gpt-4.1-nano ────────────────────────────────────────────────
if [ -n "${OPENAI_API_KEY:-}" ]; then
  URL="https://api.openai.com/v1/chat/completions"
  BODY=$(python3 -c '
import json, sys
print(json.dumps({"model":"gpt-4.1-nano","messages":[{"role":"user","content":sys.argv[1]}],"max_tokens":40}))' "$PROMPT")
  measure "OpenAI gpt-4.1-nano" "$URL" "$BODY" "Bearer $OPENAI_API_KEY"
fi

# ── Cloudflare llama-3.1-8b-instruct-fast ─────────────────────────────
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  URL="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/v1/chat/completions"
  BODY=$(python3 -c '
import json, sys
print(json.dumps({"model":"@cf/meta/llama-3.1-8b-instruct-fast","messages":[{"role":"user","content":sys.argv[1]}],"max_tokens":40}))' "$PROMPT")
  measure "Cloudflare llama-3.1-8b-fast" "$URL" "$BODY" "Bearer $CLOUDFLARE_API_TOKEN"
fi

# ── Print Markdown table ──────────────────────────────────────────────
echo
echo "| Model | Median TTFB | All runs (ms) |"
echo "|-------|-------------|---------------|"
if [ -f "$TMP/results" ]; then
  sort -t'|' -k2,2 -n "$TMP/results" | while IFS='|' read -r label median times; do
    echo "| $label | ${median}ms | $times |"
  done
fi
echo
echo "_Benchmarked with scripts/bench-polish.sh ($RUNS runs each)._"

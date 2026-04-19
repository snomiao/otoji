#!/usr/bin/env bash
# Mux otoji .wav + .srt sidecars into a .webm with embedded WebVTT subs.
# Originals are kept; existing .webm outputs are skipped.
set -euo pipefail

DIR="${1:-$HOME/Library/Application Support/otoji}"
cd "$DIR"

shopt -s nullglob
for wav in *.wav; do
  stem="${wav%.wav}"
  srt="$stem.srt"
  out="$stem.webm"
  [[ -f "$out" ]] && continue
  [[ -f "$srt" ]] || { echo "skip $stem (no .srt)"; continue; }
  ffmpeg -loglevel error -i "$wav" -i "$srt" \
    -c:a libopus -b:a 24k -c:s webvtt \
    "$out" && echo "wrote $out"
done

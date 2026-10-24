#!/bin/bash
# Fetch a reference recording's audio into the local cache (never into the repo):
#   refs/fetch.sh <youtube id or url> [start-seconds] [length-seconds]
# → ~/.cache/otoji/refs/<id>.wav (mono 22.05 kHz; the whole piece, or the given excerpt)
# Search first:  uvx yt-dlp --flat-playlist --print "%(id)s %(duration)s %(channel)s | %(title)s" "ytsearch15:<query>"
set -euo pipefail
src="$1"; id="${src##*v=}"; id="${id##*/}"
out="$HOME/.cache/otoji/refs"; mkdir -p "$out"
ff="$(uvx --from imageio-ffmpeg python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
[ -f "$out/$id.full.m4a" ] || uvx yt-dlp -q --no-playlist --js-runtimes bun -f "bestaudio[ext=m4a]/bestaudio" -o "$out/$id.full.%(ext)s" --remux-video m4a --ffmpeg-location "$ff" "https://www.youtube.com/watch?v=$id" >/dev/null
in="$(ls "$out/$id".full.* | head -1)"
args=(); [ -n "${2:-}" ] && args+=(-ss "$2"); [ -n "${3:-}" ] && args+=(-t "$3")
"$ff" -loglevel error -y ${args[@]+"${args[@]}"} -i "$in" -ac 1 -ar 22050 "$out/$id.wav"
echo "$out/$id.wav"

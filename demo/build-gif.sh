#!/usr/bin/env bash
# A short loop for the README and the Marketplace listing.
#
# The Marketplace strips <video> and GitHub will not play a repo-relative .mp4
# inline, so a GIF is the only thing that moves in either place. Two passes: one
# to build a palette from the actual frames, one to apply it — a shared 256
# colour palette is what keeps text legible at this size.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/out/walkthrough.mp4"
out="$here/out/walkthrough.gif"
palette="$(mktemp -t mhe-palette).png"
start="${GIF_START:-0}"
length="${GIF_LENGTH:-34}"

[ -f "$src" ] || { echo "no walkthrough.mp4; run pnpm demo:record && pnpm demo:video first" >&2; exit 1; }

filters="fps=12,scale=900:-1:flags=lanczos"
ffmpeg -y -loglevel error -ss "$start" -t "$length" -i "$src" \
  -vf "$filters,palettegen=stats_mode=diff" "$palette"
ffmpeg -y -loglevel error -ss "$start" -t "$length" -i "$src" -i "$palette" \
  -lavfi "$filters[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$out"
rm -f "$palette"
ls -la "$out"

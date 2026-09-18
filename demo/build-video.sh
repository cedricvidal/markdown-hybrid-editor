#!/usr/bin/env bash
# Turn the screencast frames from record.mjs into demo/out/walkthrough.mp4.
# Frames are activity-driven (no frame while nothing changes), so each one is held
# for the time until the next frame; the last one is held for 1.5 s.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
frames="$here/frames"
out="$here/out/walkthrough.mp4"
[ -f "$frames/frames.json" ] || { echo "no frames; run pnpm demo:record first" >&2; exit 1; }
list="$frames/list.txt"
node "$here/lib/concat-list.mjs" "$frames"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" \
  -vf "fps=30,scale=1440:-2:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset medium -movflags +faststart \
  "$out"
ls -la "$out"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out" | sed 's/^/duration: /'

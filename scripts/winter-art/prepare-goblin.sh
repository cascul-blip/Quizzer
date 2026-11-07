#!/usr/bin/env bash
# Convert the user-provided magenta-screen animation into transparent game assets.
set -euo pipefail
source_clip="${1:?Usage: bash scripts/winter-art/prepare-goblin.sh /path/to/goblin.mp4}"
asset_dir="src/client/shared/winter"
key_filter='hflip,format=yuva444p,chromakey=0xe6008b:0.18:0.06,despill=type=blue:mix=0.15'
# Use six complete seconds; skip the source's final partial interval.
ffmpeg -y -loglevel error -i "$source_clip" -map 0:v:0 -an -t 6 \
  -vf "$key_filter" -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -crf 25 -b:v 0 \
  "$asset_dir/goblin-loop.webm"
# Universal alpha support and explicit pause/frame control, including reduced motion.
# 72 frames, 8 columns × 9 rows; dimensions stay below common GPU texture limits.
ffmpeg -y -loglevel error -i "$source_clip" -map 0:v:0 -an -t 6 \
  -vf "$key_filter,fps=12,scale=348:516:flags=lanczos,tile=8x9:nb_frames=72" \
  -frames:v 1 -c:v libwebp -quality 88 "$asset_dir/goblin-sheet.webp"

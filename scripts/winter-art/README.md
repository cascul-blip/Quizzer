# Sled Squad art and audio

The submarine game is presented as a Christmas dog-sled chase. The existing server protocol, game rules, scoring, and custom-music IDs remain compatible. The final runtime art is composed in `src/client/shared/winter-art.tsx` and `winter-art.css`; all assets live under `src/client/shared/winter/`.

## Preview and verification

The generated Christmas trail-challenge pictures, source sheets, prompts, and phone preview instructions are documented in [symbol-sources/README.md](symbol-sources/README.md). Run `bun scripts/winter-art/serve.ts --symbols` to review the actual instructor and player screens.

Run `bun scripts/winter-art/serve.ts`, then open http://127.0.0.1:8097. Review controls cover every host phase, boosts, and goblin distance. `?live=1` continuously closes the gap, `?subject=goblin` isolates the supplied goblin animation, and `?subject=dogs` isolates the sled team.

With Playwright and Chromium installed:

- `node scripts/winter-art/check-loop.mjs` checks at least two full animation wraps during an 18-second moving chase, then verifies boost, capture pause, and resume.
- `node scripts/winter-art/record.mjs` checks screen phases and ornament drops, then records review clips and stills into the ignored `captures/` directory.
- Optional `QUIZZER_PLAYWRIGHT_MODULE` and `QUIZZER_CHROMIUM` variables select an existing installation.
- `music-preview.ts` exposes an OfflineAudioContext renderer for checking the actual sampled soundtrack and exporting listening previews.

## Supplied foreground assets

The user supplied `quizzer-sled-chase-video-sprites/video-sprites/dogs/dogs-pair-loop.webm`, preserved in `sources/`. The runtime uses its matching `dogs-pair-sheet.webp`: 36 transparent frames, 6 × 6 cells, 525 × 173 per cell, 12 fps, three seconds. Boosts accelerate the dogs; countdown, trail challenges, and captures pause them. Reduced-motion users see a still pose.

The painted sled, tree, and ornaments come from the accompanying `quizzer-sled-chase/sled-chase/sleigh` bundle. Avatars sit between rear and front sled layers. Ornament hooks follow the reclining tree while strings hang vertically. A bauble falls every 2.4 seconds, bounces, and trails offscreen; ornaments replenish in a repeating loop.

The goblin is a claymation clip supplied by the user, preserved as `sources/goblin-v2-raw.mp4` (736 × 416, 24 fps, magenta screen ≈ RGB 251,6,192). He already faces the sled, so the clip is not flipped. Rebuild with:

```
uv run --with numpy,opencv-python-headless,scipy,pillow \
  python scripts/winter-art/prepare-goblin.py scripts/winter-art/sources/goblin-v2-raw.mp4
```

The script builds a soft matte from magenta excess, despills, rebuilds fringe colours from the nearest solid interior pixel, and drops stray key residue. It also removes the clip's sideways drift (keeping the vertical bob), picks the loop whose end best matches its start (raw frames 19–89), and blends the last three frames into the first. Outputs:

- `goblin-sheet.webp`: 36 transparent frames, 8 × 5 cells, 295 × 375 per cell, 12 fps. The runtime uses this for consistent transparency and explicit pause control. If the layout changes, update `GOBLIN_FRAMES`/`GOBLIN_COLS`/`GOBLIN_ROWS` in `winter-art.tsx` and the aspect ratio and background size in `winter-art.css`.
- `goblin-loop.webm`: the 71-frame loop as 24 fps transparent VP9 (not used at runtime).

As the gap closes he leans slightly toward the sled and speeds up; capture freezes him. The animation clock reads playback rate through a ref so continuous gap updates cannot restart its timer.

## Snowy path and repeatable fence

`snow-floor.webp` and `wooden-fence.webp` come from the supplied bundle's `background/snow-floor.webp` and `props/fence-a.webp`. Painted snow feathers into the countryside, with a lighter packed path and subtle runner grooves. Snow-capped rails and posts overlap the transition behind the actors. Snow, path, and fence use the same chase-driven scroll distance.

The live fence uses `wooden-fence-tile.svg`, a self-contained composition of the original WebP. A crisp 254-pixel interior bay starts at source x=260, excluding blurred end crossfades. Matching full posts cover both boundaries, joining through contiguous pixels of the same post without blur or crossfade.

## Generated countryside

The built-in image-generation tool produced the countryside. Final asset: `src/client/shared/winter/countryside.webp`, converted from the generated PNG. Final prompt:

> Use case: illustration-story. Asset type: wide scrolling game countryside background, 3:1 panorama. Snowy rural Christmas field in the style of a beautifully lithographed vintage 1950s Christmas cookie tin, hand painted gouache, subtle aged paper grain, muted spruce teal, ivory snow, cranberry red. Low rolling snowy fields in foreground (bottom 35% empty snow for game characters), scattered evergreen trees, occasional red barns and cozy country houses with warm golden windows and colored Christmas lights across middle distance. Pale winter evening teal sky upper half with tiny snowflakes. Side-on landscape, no perspective road, no characters, no sled, no animals, no lettering or border. Keep left and right edges snowy evergreen countryside of similar tone so it can repeat. Warm nostalgic and whimsical with detailed brushwork.

## Music

All four `submarine-*` cues now use original Jingle Bells arrangements with CC0 instrument samples. The intro uses flute and glockenspiel, the adaptive chase builds from 120 to 150 BPM with brass and percussion, the trail challenge stays quiet, and the score screen uses a festive band. Melody and instrument provenance are in `src/client/shared/music/samples/CREDITS.md`.

# Santa's Sleigh Run: final art (for `scripts/sleigh-art/`)

Photoreal dusk restyle matching the approved round-4 town (`town-dark.jpg` / `town-lit.jpg`). Built Nov 3, 2026.
The town image replaces brief sections A (ground, snow-tile), B (all roofs) and D (pines, lamp, pond, snowman, sled), so those files are not made.

## Layout
- Root: every brief file with the brief's name and size. Cut-outs are **true-transparent PNGs** (brief rule 3 allows that); `magenta/` holds the same 25 cut-outs flattened on #FF00FF. Effects are opaque RGB on pure black.
- `town-dark.jpg`, `town-lit.jpg`, `houses.json`, `houses-overlay.png`: the round-4 town, unchanged (2560×1440; see houses.json `note`).
- `clips/`: the five clips, each with a 12-frame `-strip.png`; the gallop clips also have a `-track.csv`.
- `alternates/`: rejected tries (oblique sleigh, side-view reindeer ×2, the oblique fireplace chimney) and the take-1 clips that were re-rolled.
- `previews/`: `contact-sheet.jpg`, `game-scale-town-lit.jpg` and `game-scale-mixed.jpg` (town-dark with 9 houses revealed from town-lit through houses.json polygons), each with a 1:1 crop. Review only, not for the repo.
- `phone/`: 33 half-size copies of every root image (`phone-bg.jpg` is phone-only, so it stays full size in the root).
- Build scripts and raw model outputs: `../src/` (`build_team.py`, `build_props.py`, `build_pad.py`, `build_misc.py`, `previews.py`, `video/analyse.py`, `video/build_clips.py`, `raw/`, `video/raw/`, `video/metrics/`).

## Generation counts
- **GenerateImage: 17.** sleigh try (rejected, oblique) · reindeer sheet try (rejected, side view) · gifts+wreaths sheet · sleigh+2 chimneys edit · 2×2 gallop edit (rejected, side view) · gallop frames 2, 3, 4 (one edit each from frame 1) · walls sheet · launch pad · sparkle-burst · effects sheet (snow-puff, smoke, magic-dust) · takeoff · celebration · candy-canes · wheel · phone-bg.
- **GenerateVideo: 7.** One take each for reindeer-gallop, rudolph-gallop and fireworks; two takes each for takeoff and sparkle.
- Made in code, no generation: `sleigh-red` (recolour of sleigh), `gift-key` (recolour of gift-red), `rudolph-1..4` (nose painted on reindeer-1..4), reindeer frame 1 (the approved round-2 top-down reindeer, re-cut), the wall seam, launch-pad pole fix, wheel centring, upscales (OpenCV EDSR ×2 for the screens and the effects sheet).

## Files
| File | Pixels | KB | Mode |
|---|---|---|---|
| `candy-canes.png` | 1024×1024 | 730 | RGBA |
| `celebration.jpg` | 1920×1080 | 695 | RGB |
| `chimney-done.png` | 512×512 | 141 | RGBA |
| `chimney-smoke.png` | 512×512 | 123 | RGB |
| `chimney-waiting.png` | 512×512 | 161 | RGBA |
| `gift-blue.png` | 512×512 | 249 | RGBA |
| `gift-gold.png` | 512×512 | 235 | RGBA |
| `gift-green.png` | 512×512 | 244 | RGBA |
| `gift-key.png` | 512×512 | 223 | RGBA |
| `gift-purple.png` | 512×512 | 255 | RGBA |
| `gift-red.png` | 512×512 | 244 | RGBA |
| `houses-overlay.png` | 2560×1440 | 5759 | RGB |
| `houses.json` |  | 32 |  |
| `launch-pad.png` | 1024×1024 | 1293 | RGBA |
| `magic-dust.png` | 1024×256 | 152 | RGB |
| `phone-bg.jpg` | 1080×1920 | 436 | RGB |
| `reindeer-1.png` | 1024×512 | 175 | RGBA |
| `reindeer-2.png` | 1024×512 | 281 | RGBA |
| `reindeer-3.png` | 1024×512 | 287 | RGBA |
| `reindeer-4.png` | 1024×512 | 285 | RGBA |
| `rudolph-1.png` | 1024×512 | 175 | RGBA |
| `rudolph-2.png` | 1024×512 | 281 | RGBA |
| `rudolph-3.png` | 1024×512 | 287 | RGBA |
| `rudolph-4.png` | 1024×512 | 285 | RGBA |
| `sleigh-red.png` | 1024×512 | 536 | RGBA |
| `sleigh.png` | 1024×512 | 544 | RGBA |
| `snow-puff.png` | 1024×1024 | 642 | RGB |
| `sparkle-burst.png` | 1024×1024 | 974 | RGB |
| `takeoff.jpg` | 1920×1080 | 429 | RGB |
| `town-dark.jpg` | 2560×1440 | 1081 | RGB |
| `town-lit.jpg` | 2560×1440 | 1045 | RGB |
| `wall-corner.png` | 512×512 | 218 | RGBA |
| `wall-straight.png` | 2048×160 | 228 | RGBA |
| `wall-wreath.png` | 256×256 | 71 | RGBA |
| `wheel.png` | 1024×1024 | 1068 | RGBA |
| `wreath.png` | 512×512 | 238 | RGBA |

### Clips
| File | Pixels | KB | Mode |
|---|---|---|---|
| `clips/clip-fireworks-strip.png` | 1280×540 | 355 | RGB |
| `clips/clip-fireworks.mp4` | 1280×720, 73 fr | 2039 | h264 |
| `clips/clip-reindeer-gallop-strip.png` | 1280×540 | 413 | RGB |
| `clips/clip-reindeer-gallop-track.csv` |  | 1 |  |
| `clips/clip-reindeer-gallop.mp4` | 1280×720, 49 fr | 727 | h264 |
| `clips/clip-rudolph-gallop-strip.png` | 1280×540 | 412 | RGB |
| `clips/clip-rudolph-gallop-track.csv` |  | 1 |  |
| `clips/clip-rudolph-gallop.mp4` | 1280×720, 49 fr | 690 | h264 |
| `clips/clip-sparkle-strip.png` | 1280×540 | 295 | RGB |
| `clips/clip-sparkle.mp4` | 1280×720, 25 fr | 1103 | h264 |
| `clips/clip-takeoff-strip.png` | 1280×540 | 1146 | RGB |
| `clips/clip-takeoff.mp4` | 1280×720, 73 fr | 2455 | h264 |

### Previews
| File | Pixels | KB | Mode |
|---|---|---|---|
| `previews/contact-sheet.jpg` | 1800×1650 | 414 | RGB |
| `previews/game-scale-mixed-crop-1to1.jpg` | 800×450 | 93 | RGB |
| `previews/game-scale-mixed.jpg` | 2560×1440 | 909 | RGB |
| `previews/game-scale-town-lit-crop-1to1.jpg` | 800×450 | 91 | RGB |
| `previews/game-scale-town-lit.jpg` | 2560×1440 | 883 | RGB |

### Alternates
| File | Pixels | KB | Mode |
|---|---|---|---|
| `alternates/chimney-waiting-oblique-fireplace.png` | 512×512 | 163 | RGBA |
| `alternates/clips/clip-sparkle-take1-strip.png` | 1280×540 | 279 | RGB |
| `alternates/clips/clip-sparkle-take1.mp4` | 1280×720, 25 fr | 709 | h264 |
| `alternates/clips/clip-takeoff-take1-strip.png` | 1280×540 | 1207 | RGB |
| `alternates/clips/clip-takeoff-take1.mp4` | 1280×720, 73 fr | 2305 | h264 |
| `alternates/reindeer-cycle-try1-sideview.jpg` | 1280×720 | 153 | RGB |
| `alternates/reindeer-try1-sideview.jpg` | 1280×720 | 174 | RGB |
| `alternates/sleigh-try1-oblique.jpg` | 1280×720 | 181 | RGB |

## Code notes (per asset)
- **Scale (PR #104):** the town is 2560×1440 for the 1600×900-unit field = **1.6 px/unit**. Sleigh and reindeer canvases are 30 units (1024 px = 3 m) = 48 px on the town. Chimney 14 units ≈ 22 px, which matches the chimney stacks in the town image (≈20–28 px), so `chimney-*` sits straight on the `houses.json` chimney points. Gift 24 units ≈ 38 px.
- **sleigh.png / sleigh-red.png:** 1024×512, nose right, sleigh 85% wide. Body is key cyan, hue exactly 193° (it came back 195.7°). `sleigh-red` is the same pixels with only the cyan body recoloured, so the two swap in place. 346 px outside the body still read bluish (glossy rim highlights); fine for a hue-range swap of 180–205°. No reins; mittens rest on the front rail.
- **reindeer-1..4 / rudolph-1..4:** 1024×512, same scale as the sleigh (reindeer 60% wide = 1.8 m). Frames 2–4 were registered onto frame 1 by ECC on the body, head and antlers (legs masked out): head/antler tip within 5 px across frames, torso centroid within 8 px (part of that is the legs). Cycle order 1 stretched → 2 gathering → 3 hind legs back/front tucked → 4 reaching. `rudolph-N` = `reindeer-N` with the nose painted glossy red (nose centre ≈ (805,265), r ≈ 18 px), so Rudolph frames swap pixel-for-pixel with reindeer frames. The game adds the nose glow.
- **chimney-waiting / chimney-done:** 512×512, 60% fill, top-down onto the flue (the front brick strip the model drew was cropped off). Same chimney, only the flue light changes.
- **gift-red/green/blue/purple/gold, gift-key:** 512×512, 75% fill, square tops (the thin front face was cropped off). `gift-key` = gift-red with the paper turned to key cyan (hue 193°) and the gold ribbon turned white, so it is exactly the same shape as gift-red. 70 px of dark red remain in creases.
- **wreath (512) / wall-wreath (256):** 80% fill. Two different wreaths from the same sheet.
- **wall-straight.png:** 2048×160, wall band 120 px tall (snow cap + stone face) centred with 20 px clear above and below. Seamless: 2 periods per 2048 with a 140 px crossfade; the left/right edge columns differ as much as any two neighbouring columns (3.8 vs 3.9 levels).
- **wall-corner.png:** 512×512, corner pillar top-right, arms run left along the top and down the right side. **Its arms are about 1.6–2× thicker than wall-straight's band (152–193 px vs 98 px opaque), so draw it at about 0.55× to match**, or let the corner overhang. It was cut from the model's L-shaped wall and rotated 180°, so its light comes from the bottom-right, the opposite of the straight wall.
- **launch-pad.png:** 1024×1024, the circle fills the canvas, transparent outside. The model drew the pole side-on with a long cast shadow; both were removed by inpainting and the gold ball put back as a disc at the exact centre. **The blank band is the clear ice ring outside the candy-cane rim, not inside it** (the model put the striped ring inset). Write "NORTH POLE" on the radius ~0.86–0.97 band. The inner ice is slightly smoother where the shadow was.
- **candy-canes.png:** 1024×1024, 85% fill, front view.
- **wheel.png:** 1024×1024, centred on the hub (the hub's cyan disc is at the exact centre; the hub came back 0.99 round), 94% fill. Key cyan at the 12 o'clock rim segment (with a gold star) and the hub disc, both hue 193°, no other blue. **It has 8 spokes and 8 handles, not the brief's 6.**
- **Effects (sparkle-burst 1024², snow-puff 1024², chimney-smoke 512², magic-dust 1024×256):** opaque RGB on true black. The black floor was crushed (levels −10), so border pixels are 0. Use them additively/screen or key by brightness. magic-dust is bright on the right and fades to the left, so its right end goes at the sleigh.
- **Screens:** `takeoff.jpg` and `celebration.jpg` are 1920×1080 and `phone-bg.jpg` is 1080×1920, all upscaled ×2 (EDSR) from the model's 1280×720 / 720×1280 and then fitted. takeoff: team on the hilltop at lower left facing right, big moon right. The reindeer heads reach into the left edge of the middle third, but the middle band is otherwise sky and horizon. celebration: fireworks and moon along the top, calm town centre. phone-bg: empty sky in the middle.

## Clips (`clips/`)
All clips are H.264 at CRF 16, yuv420p, 1280×720, 24 fps, video only (audio removed), re-encoded from the raw model output. Strips are 12 evenly spaced frames, last frame included.

| Clip | Frames / s | Take | Checks | Verdict |
|---|---|---|---|---|
| `clip-reindeer-gallop.mp4` | 49 / 2.04 | 1 of 1 | Start and end on `reindeer-1`; loops (last vs first frame mean diff 2.8 levels). Magenta key: background mean (254.6, 1.7, 253.4), 2.3 off #FF00FF, noise σ ≤ 2.6, flicker ≤ 1.1 levels per frame, no shadows. Camera locked (flat backdrop, size steady). Torso drift: mean 3.7, max 8.6 px. Stays top-down. | **Usable.** Treadmill gallop in place. Per-frame torso offset is in `-track.csv` (clip px plus offset in sprite px, = clip × 0.8). Clip frame = sprite ×1.25 with 40 px magenta above and below. |
| `clip-rudolph-gallop.mp4` | 49 / 2.04 | 1 of 1 | Same checks: background 2.3 off, flicker ≤ 1.3, torso drift mean 4.6 / max 8.9 px, loops (2.8). Nose stays red. | **Usable.** The nose glow pulses only faintly; add the pulse in code. |
| `clip-takeoff.mp4` | 73 / 3.04 | 2 of 2 | Starts on `takeoff.jpg`. The raw camera drifted 4.8 px (take 1: 9.5 px plus a laser-like red beam from Rudolph's nose). Stabilised in post by translating each frame back on the sky/moon: moon shift now ≤ 0.3 px, town ≤ 1.6 px. The ≤ 5 px uncovered edge is mirror-filled. | **Usable.** Team leaps, the sleigh lifts off, snow puffs up, golden trail. **The team climbs only about a third of the way to the moon and is still in frame at 3 s**: it doesn't leave or cross the moon. |
| `clip-sparkle.mp4` | 25 / 1.04 | 2 of 2 | Black → keyframe at 0.35 s (sparkle-burst on black) → black. Median level 0; 87% of pixels exactly 0 on average; last frame all but black (max 19). Burst centred. | **Usable.** Bloom → drift → fade. Take 1 was off-centre and faint. |
| `clip-fireworks.mp4` | 73 / 3.04 | 1 of 1 | Pure black (median ≤ 2, dark pixels ≤ 3.9 levels). Last frame exactly black (pinned). Static. Gold, red, green and white bursts one after another. | **Usable.** Loops (ends on black). Frame 0 already has a small gold burst starting. |

## Didn't come out as asked
1. **Top-down tries:** the first sleigh (oblique) and both reindeer-sheet tries (side view) failed. The delivered sleigh and reindeer are restyled from the approved round-2 top-down sprites. **They read as a glossy high-end 3D render rather than full photoreal**, a little cleaner and brighter than the town.
2. **The gallop poses are not a textbook cycle:** frame 2 shows the legs only on one side, and frame 3 is "hind legs back, front tucked" rather than all four tucked.
3. **Rudolph's nose is painted in code**, not image-to-image, so it is exactly registered. It reads as a red ball at 1:1 and is fine at game size.
4. **wheel:** 8 spokes and handles instead of 6.
5. **launch-pad:** the blank band is outside the striped rim, and the pole and shadow were removed by retouching.
6. **wall-corner:** about 2× the straight wall's thickness, and lit from the opposite side.
7. **takeoff clip:** the team doesn't leave the frame or cross the moon in 3 s. It needed post-stabilisation (raw drift 4.8 px).
8. **takeoff.jpg:** the reindeer heads poke into the middle third.
9. **Clip lighting:** the gallop clips keep the round-2 sprite lighting, as does the still.
10. **Not made (replaced by the town image):** ground, snow-tile, all roofs, pines, lamp, pond, snowman, sled.

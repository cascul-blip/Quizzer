# Showdown art manifest

Made by `scripts/showdown-art.py` from the sources in `scripts/showdown-art/` (prompts in `Showdown Art Brief.md`). Phone copies (`phone/`) are half size. The client reads the numbers from `meta.ts` (generated with this file); `duel-art.tsx` draws everything. Coordinates: canvas px are the 1280×720 source canvas; box px are the duelist box (top-left origin); % is of the file or box width/height.

## Files

| File | Size | Phone copy | KB (projector + phone) |
|---|---|---|---|
| `body-draw.webp` | 521×553 | 260×276 | 35 |
| `body-fire.webp` | 521×553 | 260×276 | 34 |
| `body-idle.webp` | 521×553 | 260×276 | 31 |
| `body-ready.webp` | 521×553 | 260×276 | 36 |
| `body-stagger.webp` | 521×553 | 260×276 | 45 |
| `body-tip.webp` | 521×553 | 260×276 | 34 |
| `body-tip-hand.webp` | 521×553 | 260×276 | 5 |
| `body-walk1.webp` | 521×553 | 260×276 | 34 |
| `body-walk2.webp` | 521×553 | 260×276 | 30 |
| `bullet-streak.webp` | 720×41 | 360×20 | 9 |
| `clip-draw-fire.webp` | 2112×1400 | – | 334 |
| `clip-hat-fly.webp` | 4896×134 | – | 109 |
| `clip-holster-spin.webp` | 2112×1400 | – | 345 |
| `clip-stagger.webp` | 2112×1400 | – | 418 |
| `clip-tumbleweed.webp` | 4588×116 | – | 202 |
| `clip-walk.webp` | 2112×840 | – | 208 |
| `dust-puff.webp` | 560×308 | 280×154 | 151 |
| `gun-smoke.webp` | 400×230 | 200×115 | 49 |
| `hat-black.webp` | 148×79 | 74×40 | 4 |
| `hat-brown.webp` | 148×79 | 74×40 | 5 |
| `hat-sheriff.webp` | 148×79 | 74×40 | 5 |
| `hat-white.webp` | 148×79 | 74×40 | 5 |
| `high-noon.webp` | 1280×720 | 640×360 | 146 |
| `muzzle-flash.webp` | 512×425 | 256×212 | 96 |
| `phone-holster.webp` | – (phone only) | 464×640 | 43 |
| `sheriff-star.webp` | 278×320 | 139×160 | 19 |
| `street-1.webp` | 1280×720 | 640×360 | 189 |
| `street-2.webp` | 1280×720 | 640×360 | 180 |
| `street-3.webp` | 1280×720 | 640×360 | 170 |
| `town-wide.webp` | 1920×1080 | – | 235 |
| `tumbleweed.webp` | 256×241 | 128×120 | 41 |
| `wanted-frame.webp` | 553×625 | 276×312 | 67 |

Total: 3314 KB in 56 files.

## The duelist box

Every `body-*.webp`, `body-tip-hand.webp` and every cell of the four character clip sheets is the same crop of the source canvas: x 389–910, y 96–649 (521×553 px; the clip cells are 260×276, i.e. ×0.5). So poses and clip frames swap in place. The **sole line is the bottom edge** (stills' lowest boot row y 648 on the canvas): draw the box at the height you want with its bottom on the ground.

Faces right. Mirror the whole box (`scaleX(-1)`) to face left; the avatar is counter-flipped so it reads the right way.

**In the client** (`duel-art.tsx`) the Duelist box is the full 1280×720 canvas (16:9) with this crop placed back at (389, 96); the exported DUEL_HEAD / DUEL_MUZZLE / DUEL_FEET_Y are % of that canvas box: head ≈ (46.9%, 24.6%), soles on y = 90.1%. The % values in the tables below are of the trimmed box (as in meta.ts).

### Head per pose (mannequin ball: centroid, half its height)

| Pose | File | Canvas (x, y) r | Box px | % of box (x, y), r % of height | Sole line (canvas y) |
|---|---|---|---|---|---|
| idle | `body-idle.webp` (from `body-idle.jpg`) | (600.3, 177.1) r 32.5 | (211.3, 81.1) | (40.55, 14.67) r 5.88 | 647 |
| ready | `body-ready.webp` (from `body-ready.jpg`) | (599.6, 176.9) r 34.5 | (210.6, 80.9) | (40.42, 14.63) r 6.24 | 647 |
| draw | `body-draw.webp` (from `body-draw.jpg`) | (600.4, 176.7) r 31.0 | (211.4, 80.7) | (40.57, 14.6) r 5.61 | 647 |
| fire | `body-fire.webp` (from `body-fire.jpg`) | (600.6, 177.0) r 28.0 | (211.6, 81.0) | (40.61, 14.66) r 5.06 | 647 |
| stagger | `body-stagger.webp` (from `body-stagger.jpg`) | (600.4, 177.4) r 32.0 | (211.4, 81.4) | (40.58, 14.72) r 5.79 | 648 |
| tip | `body-tip.webp` (from `body-tip.jpg`) | (599.1, 177.1) r 30.0 | (210.1, 81.1) | (40.33, 14.67) r 5.42 | 647 |
| walk1 | `body-walk1.webp` (from `body-walk-1.jpg`) | (600.2, 177.1) r 33.0 | (211.2, 81.1) | (40.55, 14.67) r 5.97 | 648 |
| walk2 | `body-walk2.webp` (from `body-walk-2.jpg`) | (600.0, 177.0) r 28.0 | (211.0, 81.0) | (40.5, 14.64) r 5.06 | 647 |

The delivery said (600, 177) r 32 for every pose; the measurements above agree to a couple of px (the ball is egg-shaped, so r is half its height; it is about 28 px across half-width).

**Avatar**: the avatar's 100×100 box is drawn 29.22% of the box width × 27.53% of its height (1.45× the ball's radius for the avatar's 30-unit head radius), with its point (50, 56) on the head centre. It covers the whole ball.

**Muzzle** (body-fire, facing right): canvas (778, 209) = box (74.66%, 20.49%). Mirror x for a left-facing duelist.

**Hats**: one scale for all four, placed like the brown hat in frame 0 of `clip-hat-fly.mp4` (the clip starts with the hat on the head). Offsets from the head centre:

| Hat | Canvas px (dx, dy, w×h) | % of box (dx, dy, w, h) |
|---|---|---|
| `hat-brown.webp` | (-74, -88, 148×79) | (-14.2, -15.91, 28.41, 14.29) |
| `hat-black.webp` | (-74, -88, 148×79) | (-14.2, -15.91, 28.41, 14.29) |
| `hat-white.webp` | (-74, -88, 148×79) | (-14.2, -15.91, 28.41, 14.29) |
| `hat-sheriff.webp` | (-74, -88, 148×79) | (-14.2, -15.91, 28.41, 14.29) |

## Layer order (back to front)

street (or high-noon) → dust puff → body-<pose> (or the clip sheet frame) → avatar → hat → body-tip-hand (tip pose only) → gun smoke → muzzle flash → bullet streak → flying hat → tumbleweed (in front of the duelists, near the ground).

## Effects

Keyed by brightness on black: alpha = brightness, colour un-premultiplied, so normal blending looks like added light (`mix-blend-mode: screen` is a touch brighter). Anchor in % of the file:

| File | Anchor | What the anchor is | Suggested width on the box |
|---|---|---|---|
| `muzzle-flash.webp` | (21.26%, 49.45%) | the flash core: put it on the muzzle | 40.31% of the box width |
| `gun-smoke.webp` | (21.44%, 49.51%) | where the puff leaves the barrel | 36.47% of the box width |
| `dust-puff.webp` | (50.0%, 99.79%) | bottom centre: on the ground | 69.1% of the box width |
| `bullet-streak.webp` | (98.24%, 48.85%) | the bright tip (right end): leads | from → to |

## Clips (projector only, 12 fps)

Every second frame of the 24 fps clips, keyed. Character sheets: 8 columns, 2 px transparent gutter round each cell; cell i is at x = (i % cols)·(cellW + 2g) + g, y = ⌊i / cols⌋·(cellH + 2g) + g. The head track is the artist's `<clip>-head.csv`, mapped into the box (%).

| Sheet | Pixels | Frames | Cell | Notes |
|---|---|---|---|---|
| `clip-draw-fire.webp` | 2112×1400 | 37 | 260×276 | idle → draw → fire, recoil, holds the fire pose |
| `clip-stagger.webp` | 2112×1400 | 37 | 260×276 | idle → stagger → back to idle |
| `clip-holster-spin.webp` | 2112×1400 | 37 | 260×276 | fire → spin → holstered idle |
| `clip-walk.webp` | 2112×840 | 24 | 260×276 | seamless loop (the source's last frame = first is dropped) |
| `clip-hat-fly.webp` | 4896×134 | 36 | 136×134 | one row; each cell centred on the hat; track + cell size on the duelist box in meta.ts (starts on the head) |
| `clip-tumbleweed.webp` | 4588×116 | 37 | 124×116 | one row; each cell centred on the tumbleweed; roll it across in CSS, no bounce in the source |

Phones never load the clips: they swap poses and animate the still hat and tumbleweed in CSS.

## Not used

`hat-bullet-hole.jpg` and `alternates/body-stagger-lean.jpg` (the clip's stagger matches the delivered pose), `scripts/showdown-art/phone/` (made here from the keyed files instead), `previews/` and the `*-strip.png` review strips.

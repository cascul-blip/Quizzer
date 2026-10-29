# Kingdom Siege art manifest

Style C (tabletop miniatures, from mockup C1). Made by `scripts/siege-art.py` from the sources in `scripts/siege-art/` (prompts at the top of the script). Coordinates are in each file's own pixels, top-left origin; % is of that file's width/height. Projector files are in this folder, phone files in `phone/`.

Every figure is a painted miniature on a round base, facing its direction of travel (defenders right, monsters left), lit from the upper left like the board, with a soft contact shadow baked in down-right of the base. **Anchor** = the centre of the base's footprint: put it on the centre of a lane square. Poses of one figure share one canvas and one anchor, so swapping poses moves nothing.

## Files

| File | Size | Alpha | Anchor (base centre) | Notes |
|---|---|---|---|---|
| `archer-draw.webp` | 180×220 | yes | (82, 188) px = (45.8%, 85.3%) |  |
| `archer-ready.webp` | 180×220 | yes | (82, 188) px = (45.8%, 85.3%) |  |
| `arrow.webp` | 64×16 | yes |  |  |
| `banner-cloth.webp` | 96×160 | yes |  |  |
| `board.webp` | 1344×768 | no |  |  |
| `castle-wall.webp` | 360×768 | yes |  |  |
| `castle-wall-cracked.webp` | 360×768 | yes |  |  |
| `castle-wall-fallen.webp` | 360×768 | yes |  |  |
| `coin.webp` | 64×64 | yes |  |  |
| `dust-puff.webp` | 160×120 | yes |  |  |
| `giant-head.webp` | 420×520 | yes | (226, 440) px = (53.7%, 84.7%) |  |
| `giant-left-arm.webp` | 420×520 | yes | (226, 440) px = (53.7%, 84.7%) |  |
| `giant-legs.webp` | 420×520 | yes | (226, 440) px = (53.7%, 84.7%) |  |
| `giant-right-arm.webp` | 420×520 | yes | (226, 440) px = (53.7%, 84.7%) |  |
| `giant-torso.webp` | 420×520 | yes | (226, 440) px = (53.7%, 84.7%) |  |
| `goblin-attack.webp` | 150×180 | yes | (91, 155) px = (60.9%, 86.2%) |  |
| `goblin-walk.webp` | 150×180 | yes | (91, 155) px = (60.9%, 86.2%) |  |
| `heart.webp` | 64×64 | yes |  |  |
| `knight-body.webp` | 200×240 | yes | (99, 205) px = (49.3%, 85.3%) |  |
| `knight-head.webp` | 200×240 | yes | (99, 205) px = (49.3%, 85.3%) |  |
| `knight-legs.webp` | 200×240 | yes | (99, 205) px = (49.3%, 85.3%) |  |
| `knight-shield-arm.webp` | 200×240 | yes | (99, 205) px = (49.3%, 85.3%) |  |
| `knight-sword-arm.webp` | 200×240 | yes | (99, 205) px = (49.3%, 85.3%) |  |
| `lv2-pennant-archer.webp` | 64×96 | yes |  |  |
| `lv2-pennant-knight.webp` | 64×96 | yes |  |  |
| `lv2-wall-course.webp` | 130×53 | yes |  |  |
| `lv3-trim-archer.webp` | 180×220 | yes |  |  |
| `lv3-trim-knight.webp` | 200×240 | yes |  |  |
| `lv3-trim-wall.webp` | 200×180 | yes |  |  |
| `lv3-wall-spikes.webp` | 110×79 | yes |  |  |
| `phone/archer-icon.webp` | 128×128 | yes |  |  |
| `phone/coin.webp` | 64×64 | yes |  | same 64x64 as the projector copy |
| `phone/heart.webp` | 64×64 | yes |  | same 64x64 as the projector copy |
| `phone/knight-icon.webp` | 128×128 | yes |  |  |
| `phone/stone-wall-icon.webp` | 128×128 | yes |  |  |
| `stone-wall.webp` | 200×180 | yes | (91, 135) px = (45.5%, 74.9%) |  |
| `stone-wall-cracked.webp` | 200×180 | yes | (91, 135) px = (45.5%, 74.9%) |  |
| `troll-smash.webp` | 280×300 | yes | (162, 252) px = (57.8%, 84.2%) |  |
| `troll-walk.webp` | 280×300 | yes | (162, 252) px = (57.8%, 84.2%) |  |
| `wolf-leap.webp` | 220×160 | yes | (113, 123) px = (51.3%, 76.8%) |  |
| `wolf-run.webp` | 220×160 | yes | (113, 123) px = (51.3%, 76.8%) |  |

Base width (px) on each figure canvas, for checking the scale: archer 122, stone-wall 172, goblin 91, wolf 140, troll 182, knight 133, giant 310.

## Board and lane squares

`board.webp` is 1344×768, the empty C1 meadow without the castle. 5 lanes (1 = top) × 8 squares (1 = next to the wall, 8 = the entry square at the right edge). Squares start at x = 248 px, just right of the castle wall's face, and end at the board's right edge (which slants: x = 1262 + 0.291·(y − 64), clipped to 1344). A light/dark checker is painted on the board exactly on these squares. Each rect is [x0, y0, x1, y1) in board px, measured at the lane's middle row (so neighbouring squares tile without gaps); the stone borders sit between the lanes' y ranges.

| Lane | y0–y1 | Sq 1 | Sq 2 | Sq 3 | Sq 4 | Sq 5 | Sq 6 | Sq 7 | Sq 8 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 67–151 | 248–376 (c 312, 109) | 376–505 (c 440, 109) | 505–633 (c 569, 109) | 633–762 (c 698, 109) | 762–890 (c 826, 109) | 890–1018 (c 954, 109) | 1018–1147 (c 1082, 109) | 1147–1275 (c 1211, 109) |
| 2 | 169–261 | 248–380 (c 314, 215) | 380–512 (c 446, 215) | 512–645 (c 578, 215) | 645–777 (c 711, 215) | 777–909 (c 843, 215) | 909–1041 (c 975, 215) | 1041–1174 (c 1108, 215) | 1174–1306 (c 1240, 215) |
| 3 | 279–381 | 248–384 (c 316, 330) | 384–521 (c 452, 330) | 521–657 (c 589, 330) | 657–794 (c 726, 330) | 794–930 (c 862, 330) | 930–1067 (c 998, 330) | 1067–1203 (c 1135, 330) | 1203–1339 (c 1271, 330) |
| 4 | 399–512 | 248–385 (c 316, 456) | 385–522 (c 454, 456) | 522–659 (c 590, 456) | 659–796 (c 728, 456) | 796–933 (c 864, 456) | 933–1070 (c 1002, 456) | 1070–1207 (c 1138, 456) | 1207–1344 (c 1276, 456) |
| 5 | 530–655 | 248–385 (c 316, 592) | 385–522 (c 454, 592) | 522–659 (c 590, 592) | 659–796 (c 728, 592) | 796–933 (c 864, 592) | 933–1070 (c 1002, 592) | 1070–1207 (c 1138, 592) | 1207–1344 (c 1276, 592) |

Same in %: lane y ranges 1: 8.7%–19.7%; 2: 22.0%–34.0%; 3: 36.3%–49.6%; 4: 52.0%–66.7%; 5: 69.0%–85.3%. Square x ranges per lane in % of 1344: lane 1: 18.5%–28.0%, 28.0%–37.6%, 37.6%–47.1%, 47.1%–56.7%, 56.7%–66.2%, 66.2%–75.7%, 75.7%–85.3%, 85.3%–94.9%; lane 2: 18.5%–28.3%, 28.3%–38.1%, 38.1%–48.0%, 48.0%–57.8%, 57.8%–67.6%, 67.6%–77.5%, 77.5%–87.4%, 87.4%–97.2%; lane 3: 18.5%–28.6%, 28.6%–38.8%, 38.8%–48.9%, 48.9%–59.1%, 59.1%–69.2%, 69.2%–79.4%, 79.4%–89.5%, 89.5%–99.6%; lane 4: 18.5%–28.6%, 28.6%–38.8%, 38.8%–49.0%, 49.0%–59.2%, 59.2%–69.4%, 69.4%–79.6%, 79.6%–89.8%, 89.8%–100.0%; lane 5: 18.5%–28.6%, 28.6%–38.8%, 38.8%–49.0%, 49.0%–59.2%, 59.2%–69.4%, 69.4%–79.6%, 79.6%–89.8%, 89.8%–100.0%.

Suggested figure size on the board: draw figures at **scale = lane height / 130** (lane heights 84, 92, 102, 113, 125 px), so a far lane's figures are a little smaller; put the anchor on the square centre, 12% of the lane height lower (as in preview.png). Figures are taller than a lane and overlap the lane above, so draw lanes top to bottom (and, inside a lane, right to left is not needed: draw by y).

## Castle wall

`castle-wall.webp`, `castle-wall-cracked.webp` (5 hearts or fewer) and `castle-wall-fallen.webp` (after the crumble) are 360×768 layers drawn at (0, 0) over the board's left edge, after the board and before the figures. The three line up exactly. The wall's face (the edge toward the lanes) is at x = 242 px (67.2%). The rubble pile fades out over x 300–360.

**Banners are baked in** (since the v2 castle): the three blue banners with gold crosses are painted flat on the wall face of `castle-wall.webp` and (slightly torn) `castle-wall-cracked.webp`; `castle-wall-fallen.webp` has no banners. Draw nothing on the wall: there are no iron arms and no hang points any more. Banner cloth bounding boxes on the layers, if you want to tint or flash them (px, x0 y0 x1 y1):
* `castle-wall.webp`: (193, 201)–(222, 313); (194, 396)–(222, 512); (194, 586)–(224, 698)
* `castle-wall-cracked.webp`: (193, 200)–(222, 317); (194, 396)–(223, 521); (194, 581)–(224, 701)

`banner-cloth.webp` (96×160, hanging point (48, 5) px = (50.0%, 3.4%)) is still shipped unchanged, but it is no longer used by the wall; treat it as an optional spare (e.g. a UI or victory flourish) or ignore it.

The castle layers are cut from the 720×1280 sources at x 4–604 (×0.6), the same crop for all three, so the face and the spire line up between states. The spire tower stands in the same place in all three states (on the fallen wall it stands alone above the rubble).

## Cut-out pieces (knight and giant)

Every piece is on the figure's full canvas (same size, same origin), so at rest you draw them all at the same position, in the order listed (first = back), and they reassemble the figure exactly. To animate, rotate a piece about its pivot (CSS `transform-origin` at the pivot px). The layers underneath are painted in where a piece covers them, so a few degrees of swing (about ±25° for arms, ±10° for the head and body) opens no hole. The legs piece includes the base and the contact shadow. Keep the head and arms on top of the body: when the body leans, rotate the head and arms by the same angle about the body's pivot first.

### knight (200×240, anchor (99, 205) px = (49.3%, 85.3%))

| Layer | File | Pivot | Moves |
|---|---|---|---|
| 1 | `knight-legs.webp` | (99, 205) px = (49.3%, 85.3%) | static (whole-figure bob/lunge/tip-over use the anchor) |
| 2 | `knight-body.webp` | (99, 136) px = (49.3%, 56.5%) | lean |
| 3 | `knight-head.webp` | (107, 83) px = (53.3%, 34.4%) | swing / nod |
| 4 | `knight-sword-arm.webp` | (84, 83) px = (42.2%, 34.6%) | swing / nod |
| 5 | `knight-shield-arm.webp` | (125, 84) px = (62.6%, 34.8%) | swing / nod |

### giant (420×520, anchor (226, 440) px = (53.7%, 84.7%))

| Layer | File | Pivot | Moves |
|---|---|---|---|
| 1 | `giant-legs.webp` | (226, 440) px = (53.7%, 84.7%) | static (whole-figure bob/lunge/tip-over use the anchor) |
| 2 | `giant-torso.webp` | (228, 290) px = (54.2%, 55.7%) | lean |
| 3 | `giant-head.webp` | (226, 119) px = (53.7%, 22.8%) | swing / nod |
| 4 | `giant-right-arm.webp` | (148, 143) px = (35.2%, 27.5%) | swing / nod |
| 5 | `giant-left-arm.webp` | (299, 98) px = (71.2%, 18.8%) | swing / nod |

Seam check (assembled pieces vs the flat figure, alpha difference): knight: 99.9th pct 7, max 72 of 255, giant: 99.9th pct 3, max 67 of 255.

## Level details

Drawn over the figure, at its canvas pixels. The Lv 3 glow is code.

* `lv2-pennant-archer.webp` 64×96: staff foot at (12, 95) px = (18.8%, 99.0%).
* `lv2-pennant-knight.webp` 64×96: staff foot at (10, 95) px = (15.4%, 99.0%).
  * archer: put the staff foot at (151, 92) px = (83.9%, 41.8%) on `archer-ready`, (115, 4) px = (63.9%, 1.8%) on `archer-draw` (the bow's upper tip), drawn over the archer.
  * knight: put the staff foot at (114, 118) px = (57.0%, 49.2%) and draw it just *before* `knight-body` (it rises from behind his back); it turns with the body pivot.
* `lv2-wall-course.webp` 130×53 (pre-tilted 7.8° to the block's top): its bottom-middle (65, 39) px = (50.0%, 73.6%) goes at (96, 52) px = (48.0%, 29.2%) on the wall canvas.
* `lv3-wall-spikes.webp` 110×79 (pre-tilted 7.8° to the block's top): its bottom-middle (55, 62) px = (50.0%, 78.5%) goes at (96, 32) px = (48.0%, 18.1%) on the wall canvas (on top of the Lv 2 course; without the course use the course's point).
* `lv3-trim-archer.webp`, `lv3-trim-knight.webp`, `lv3-trim-wall.webp`: the base rim re-painted gold, on the figure's own canvas (same size): draw at (0, 0) over the figure (over `knight-legs` for the knight). One trim fits both poses because the bases line up.

## Small art

* `arrow.webp` 64×16: points right; the tip is the right edge's middle. Rotate for flight.
* `coin.webp`, `heart.webp` 64×64 (phone copies identical).
* `dust-puff.webp` 160×120: its bottom-middle sits on the ground. Normal blending; fade and grow it in code.

## Phone

`phone/archer-icon`, `phone/knight-icon`, `phone/stone-wall-icon` (128×128, for the defender strip), `phone/coin` and `phone/heart` (64×64). The phone's lane map is drawn in code.

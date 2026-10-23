# Land Grab art manifest

Style A, the painted tabletop diorama from mockups/style-a.png. The user picked it.
- Made by `src/build.py` from the generated sources in `src/` (prompts in `PROMPTS` at the top of the script; Pillow + numpy only).
- `python3 src/build.py` rebuilds everything; `python3 src/build.py keep scene` rebuilds single steps.
- Projector files are in this folder, phone copies in `phone/` at half size (same file names).
- Coordinates are in each file's own pixels, top-left origin; % is of that file's width/height.
- **Masks** (`*-tint.webp`) are greyscale (stored as grey RGB WebP). White = take the team colour, black = leave alone.
- Previews: `preview.png` (contact sheet over a checkerboard) and `preview-scene.png` (12x12, 3 teams, built only from these files and laid out like host.css).

## Palette and shapes (new)

| Team index | Name | Colour | Shape |
|---|---|---|---|
| 0 | Red | `#d81e3a` | circle |
| 1 | Blue | `#1f5ee0` | square |
| 2 | Yellow | `#f5c400` | triangle |
| 3 | Cyan | `#12b5cb` | diamond |
| 4 | Purple | `#7d3cc8` | star |
| 5 | Pink | `#f0559e` | heart |

- Pink replaces Orange; Yellow is now bright, not amber.
- The shape is a second cue for colour-blind students. Show it on the team card, the phone team badge and the podium.

## Files

Projector (phone copy) means the phone file is half size; – = no phone copy.

| File | Size: projector (phone) | Alpha | Blend | Layer | Use |
|---|---|---|---|---|---|
| `background.webp` | 1920×1080 (960×540) | no | normal | 0 (back) | host stage behind everything. Plain felt field, soft vignette; `background-size: cover`, any crop works |
| `felt-tile.webp` | 512×512 (256×256) | no | normal | 0 | seamless felt for tiling (phone `.land-area`, any odd aspect) |
| `tray-wood.webp` | 512×512 (256×256) | no | normal | 1 | seamless walnut for the code-drawn tray (SVG `<pattern>` fill) |
| `grass-1…4.webp` | 444×512 (222×256) | yes, hex-clipped | normal | 3 | unclaimed tile; 4 variants; centres softened |
| `claimed-1…3.webp` | 444×512 (222×256) | yes, translucent | normal | 3b | neutral shading overlay drawn over a team-coloured hexagon (same method as today's `claimed.webp`); 3 variants |
| `state-blocked.webp` | 444×512 (222×256) | yes | normal | 4 | phone: on or next to another team's start. Slate plus hatch |
| `state-guarded.webp` | 444×512 (222×256) | yes | normal | 4 | phone: costs 2. Dashed white inner ring; add `cost-2` on top |
| `cost-2.webp`, `cost-blank.webp` | 160×160 (80×80) | yes | normal | 4b | badge for costs-2 tiles, centred on the tile centre, about 0.27 × tile height across (the disc fills 80% of the file). Blank = draw the number in code |
| `state-selected.webp` | 532×614 (266×307) | yes | normal | 6 | phone: the selected tile. White rim + soft yellow glow. **1.2× the tile canvas**, centred on the tile centre |
| `keep.webp` | 552×801 (276×400) | yes | normal | 5 | start marker with a neutral white flag; tint the flag with `keep-flag-tint` |
| `keep-flag-tint.webp` | 552×801 (276×400) | mask | mask | 5 | white where the flag cloth is |
| `keep-red/blue/yellow/cyan/purple/pink.webp` | 552×801 (276×400) | yes | normal | 5 | the keep pre-tinted per team (easiest: just pick by team index) |
| `keep-out.webp` | 552×801 (276×400) | yes (80% opacity baked in) | normal | 5 | knocked-out start: greyed, untinted flag |
| `place-pop.webp` | 768×768 (384×384) | yes (glow) | normal or `screen` | 7 | just-placed tile: draw at 2.0× the tile width, centred; scale 0.6→1.1, fade out over ~0.5 s |
| `capture-flash.webp` | 577×665 (288×332) | yes (glow) | normal or `screen` | 7 | captured tiles while they flip: 1.3× the tile canvas, centred; peak at the flip midpoint, then fade |
| `team-card.webp` | 800×310 (–) | yes | normal | HUD | team card plaque (9-slice) |
| `team-card-tint.webp` | 800×310 (–) | mask | mask | HUD | the cloth ribbon at x 59–96 (7.4%–12.0%), full height |
| `banner.webp` | 1200×185 (–) | yes | normal | HUD | event banner ribbon (3-slice) |
| `banner-tint.webp` | 1200×185 (–) | mask | mask | HUD | the whole ribbon is cloth; tint green for captures, red for knock-outs, team colour for the conquest |
| `podium-1st/2nd/3rd.webp` | 418×534, 388×434, 380×369 (–) | yes | normal | podium | stone plinths with a neutral light-grey drape |
| `podium-*-tint.webp` | same sizes (–) | mask | mask | podium | the drape |
| `shape-circle/square/triangle/diamond/star/heart.webp` | 256×256 (128×128) | yes | normal | HUD | painted near-white token with a dark outline and soft drop shadow. Use as-is (white on team colour), or tint by multiply |

Phone copies cover the board, states, effects, keeps, shapes, background, felt and tray (32 files). The team card, banner and podium are projector only: the phone result screen has no podium.

## Layer order (board, back to front)

1. Background (felt).
2. Tray: drawn in code (see Code changes).
3. Per tile, in row order top to bottom so lower rows overlap the sides of upper ones:
   - the tile side: hexagon offset down, solid colour, drawn in code;
   - the top face: `grass-N`, or a team-colour hexagon + `claimed-N`;
   - the hex edge stroke, drawn in code.
4. Territory border lines, drawn in code.
5. Start markers (`keep-*`), sorted by row.
6. Phone only: `state-blocked` / `state-guarded` + `cost-2`, then `state-selected`.
7. Effects: `place-pop`, `capture-flash`.

The HUD (top bar, team cards, banner) sits on top.

## Tiles (444×512; shipped 222×256 on phones)

- Pointy-top hexagon filling the canvas: corners at the top and bottom centre, width = height × √3/2.
- Same contract as today's `land/*.webp`: draw with `preserveAspectRatio="none"` at the tile's `TILE_R` and keep the hex clip.
- 444×512 is 2× today's 222×256, so phones zoomed in stay sharp. The phone folder has 222×256 copies if bundle size matters.
- No outlines are baked in; edges are plain.
- Centres are softened so markers, badges and the selection read on top.

## Keep start marker (552×801, phone 276×400)

- **Anchor** (centre of the round base's footprint): (274, 681) px = (49.6%, 85.0%). Put it on the start tile's centre.
- **Width:** 1.24 × the tile's drawn width (`1.24 × TILE_R × √3`). Height follows (×1.451).
- It sticks up about 1.3 tiles above the tile, so draw keeps after all tiles (sorted by row) so they overlap the tiles above them.
- **Tinting yourself:** draw `keep.webp`, then a team-colour rect masked by `keep-flag-tint`, using `mix-blend-mode: multiply` or an SVG `feComposite` arithmetic multiply. The pre-tinted `keep-<team>.webp` files are the same thing baked.
- **Knocked out:** swap to `keep-out.webp` (replaces today's `.start-mark.out` opacity 0.35).

## Team card (800×310, 9-slice)

- `border-image-slice: 40 40 40 112` (top right bottom left) with `fill`. The left slice holds the ribbon, so the ribbon runs the full height whatever the card height.
- Brass studs sit inside the 40 px corners.
- Ribbon centre x = 77 px (9.7%). Put the team's `shape-*` icon on the ribbon near the top (about 34 px on a 413 px wide card).
- Text area: x 112–760, y 40–270 at 800×310. Use light text (#fff4e1) on the walnut.
- Tint: draw the card, then the team colour × `team-card-tint` (multiply). Or pre-tint the 6 cards in code once at load.

## Banner (1200×185, 3-slice)

- **Fixed ends:** x 0–177 and 1038–1200 (the swallowtail and the curl). Stretch the middle x 177–1038 horizontally to fit the text.
- **Text box:** x 192–1018, y 23–153 (16.0%–84.8%, 12.4%–82.7%). Use white text with a dark shadow.
- **Tint:** green `#3d8a34` for "closed the ring", dark red `#8e1330` for knock-outs, the winner's team colour for "rules the whole land".
- Replaces `.monster-banner.land-banner` box styling; keep its position and animation.

## Podium

- Three separate plinths. Bottom-align them in the existing `.place` columns (2nd | 1st | 3rd) in place of the CSS `.place-block`.
- Their heights already step 1st > 2nd > 3rd (534 / 434 / 369 at the same scale), so draw them all at the same scale.
- Tint each drape by its team (multiply with `podium-*-tint`).
- Draw the rank ("1st"…) and the team shape icon on the drape in code; the drapes are blank.
- 4th and lower stay in the `.rest` list.

## Code changes needed

1. **New palette and shapes:**
   - `TEAMS` in `src/shared/protocol.ts` becomes Red `#d81e3a`, Blue `#1f5ee0`, Yellow `#f5c400`, Cyan `#12b5cb`, Purple `#7d3cc8`, Pink `#f0559e` (rename Orange → Pink).
   - Add a `shape` per team (circle, square, triangle, diamond, star, heart).
   - Update `TEAM_COLORS` in `scripts/land-tiles.py` (and any copies) to match.
   - TEAMS is shared by other team modes too, so check their tinted art with the new colours.
2. **Territory border:** draw a line on every owned tile edge whose neighbour has a different owner, or at the board edge.
   - Colour: the team colour mixed 55% toward white. Width about 0.08R on the projector. Draw it about 0.4R/10 above the tile top (on the raised face).
   - Edge k (between corners k and k+1, corners at 60k−90°) faces the neighbour in direction 60k−60°.
   - This replaces the per-tile white `.hex.owned .hex-edge` as the main cue (keep a faint 1 px edge on each tile).
3. **Raised tiles (diorama look):**
   - Before each top face, draw the hexagon offset down as the tile side: grass `#34461e`, owned = team colour × 0.5.
   - Offset 0.4R/10 for grass and 0.8R/10 for owned land; lift owned top faces by 0.3R/10.
   - Draw tiles in row order. The tile pop and flip animations can stay as they are.
4. **Tray drawn in code:**
   - Under the tiles, fill the union of all cells at 1.12R, offset down 0.8R/10, with a `tray-wood` pattern.
   - Add a drop shadow about (1R/10, 1.6R/10), blur 1.4R/10, 75% black.
   - The jagged outline follows the board, so it can't be a fixed image.
5. **Background:** `.land-wrap` gets `background.webp` (cover) instead of the green radial gradient. The phone `.land-area` gets the `felt-tile.webp` repeat instead of `#16311a`.
6. **Start marker:** `StartMark` draws the keep image at the anchor (above) instead of the white badge with an X. Draw markers after all tiles; use `keep-out` when `out`.
7. **Tile states (replacing the amber ring):**
   - `.hex-guard` → `state-guarded` + `cost-2`, centred.
   - `.hex-block` → `state-blocked`.
   - `.hex-select` → `state-selected` at 1.2× the tile, centred. A gentle pulse of its opacity (0.75↔1) can replace the stroke colour animation.
   - Remove the amber `#ffb000`.
8. **Effects:**
   - `.hex.placed` adds `place-pop`.
   - `.hex.flipped` adds `capture-flash`, using the same staggered `animationDelay`.
   - The flash is the peak frame; animate its opacity 0→1→0 over the 0.7 s flip.
9. **Phone default zoom:** start `PanZoom` at s = 1.5, centred on the centroid of the player's own tiles (their start if they have none). Clamp as today. Re-centre when claim mode opens, not on every board update.
10. **Team cards / banner / podium:** use the images as above (9-slice card, 3-slice banner, plinths), with the team shape on the card ribbon and podium drape. Replace the 👑 and 🚩 emoji in these spots with drawn art or keep them as text, Coder's choice.

## Notes / compromises

- **Tile sizes:** tiles are 2× (444×512) on the projector and 1× on phones. If the phone bundle should stay sharp at 4× zoom, ship the projector tiles to phones too (they're 30–200 KB each).
- **Claimed tiles** carry farmland detail (fields, hedges, a cottage roof on variant 3). It's softened in the centre but still busier than grass. Use variants 1–2 only if it's too much.
- **Keep flag vs. own land:** the flag is the team's colour, so on its own land it reads by shape and the stone keep rather than by colour. The base and keep stand out clearly on all six colours.
- **Podium plinths** have a cap slab slightly wider than the body, a plain block shape with no symbols. The drapes were generated magenta and converted to neutral grey, so the masks are clean.
- **Effects** (`place-pop`, `capture-flash`) are light glows; `screen` blending looks best on the dark felt, but normal also works.
- Nothing pagan or occult: crosses aren't used here at all; the shapes are plain geometric/heart tokens.
- **Edge check:** keyed art (keep, card, banner, podium, shapes) was checked over white and magenta at 100% for halos. Edges are decontaminated (`bleed()`), with no dark or white fringes.

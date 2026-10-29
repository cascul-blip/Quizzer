# Land Grab art manifest: style B (storybook parchment map)

Style B, from mockups/style-b.png. The user picked it to replace style A.
- Made by `src/build.py` (helpers in `src/common.py`, copied from the A build) from the sources in `src/` (prompts in `PROMPTS` at the top of build.py; Pillow + numpy only).
- `python3 src/build.py [step …]` rebuilds everything or single steps.
- Projector files are in this folder, phone copies in `phone/` at half size.
- Coordinates are in each file's own pixels, top-left origin; % is of that file's width/height.
- **Masks** (`*-tint.webp`) are greyscale: white = take the team colour (multiply), black = leave alone. This is the same tint method as A.
- Previews: `preview.png` (contact sheet), `preview-scene.png` (12x12, 3 teams, built only from these files, using `map-12`) and `preview-maps.png` (all three maps as boards, plus 1:1 crops of the phone copies). Claimed look (map tinted by team): `preview-scene.png` is the new look, `preview-scene-v1.png` the previous one (claimed-N overlay); `preview-claimed-14x6.png` (6 teams on map-14) and `preview-claimed-phone.png` (1080×1500 window from `phone/map-12` at its native 112 px/R, i.e. a phone zoomed in about 2.5×). Recipe tests: `mockups/claimed-variants.png`, Chrome check: `mockups/claimed-chrome-check.png`. `src/halo-check.png` is the fringe check over white and magenta.

**Drop-in rule.** Every A file name exists here with the **same pixel size, the same phone size, the same anchor and the same slice / text-box numbers**. Replacing `src/client/shared/land/` with these files works without breaking layout.
- New files: `compass-rose.webp`, and the continuous maps `map-10/12/14.webp` (see **Continuous map**).
- Nothing is renamed. Two names are kept for drop-in even though their content changed meaning (marked **≠ content**): `felt-tile`, `tray-wood`.
- The look needs some code changes (see Code changes for B). Without them, B renders but A's raised sides, wood-tray offset and white edge strokes will look wrong on parchment.

## Palette and shapes (unchanged from A)

Red `#d81e3a` circle · Blue `#1f5ee0` square · Yellow `#f5c400` triangle · Cyan `#12b5cb` diamond · Purple `#7d3cc8` star · Pink `#f0559e` heart.

## Files

"Same" = same name, size and phone size as A.

| File | Size: projector (phone) | vs A | Alpha | Use in B |
|---|---|---|---|---|
| `background.webp` | 1920×1080 (960×540) | same | no | aged parchment with darker burnt edges and a plain centre; cover |
| `felt-tile.webp` | 512×512 (256×256) | same, **≠ content** | no | seamless plain parchment (phone `.land-area` repeat) |
| `tray-wood.webp` | 512×512 (256×256) | same, **≠ content** | no | seamless darker tea-stained parchment for the board's edge band, which code draws instead of the wooden tray |
| `compass-rose.webp` | 320×320 (160×160) | **NEW** | yes | optional plain 8-point compass with "N" only; place in a corner of the board area (preview: 150 px, bottom-left) |
| `map-10.webp` | 2725×2322 (2044×1742) | **NEW** | no | continuous map for the 10x10 board (2 teams). Covers the board extent exactly. 2.03 MB (1.25 MB) |
| `map-12.webp` | 3245×2773 (2434×2080) | **NEW** | no | continuous map for 12x12 (3–4 teams). 2.66 MB (1.67 MB) |
| `map-14.webp` | 3771×3229 (2828×2422) | **NEW** | no | continuous map for 14x14 (5–6 teams). 3.87 MB (2.37 MB) |
| `grass-1…4.webp` | 444×512 (222×256) | same | hex-clipped | **fallback only** now (a board size with no map, or the map fails to load): sepia ink trees, tufts and shrubs |
| `claimed-1…3.webp` | 444×512 (222×256) | same | translucent | **Fallback only** (used when the board size has no map or the map fails to load). **watercolour-wash overlay** drawn over a team-coloured hexagon (same method as A). It adds: paper showing through unevenly (a lighter wash), ink drawing darkening, pigment pooled at the hex edge |
| `state-blocked.webp` | 444×512 (222×256) | same | yes | sepia wash plus ink cross-hatch |
| `state-guarded.webp` | 444×512 (222×256) | same | yes | dashed **dark ink** ring on a cream underlay (white would vanish on parchment) |
| `cost-2.webp`, `cost-blank.webp` | 160×160 (80×80) | same | yes | parchment disc, ink ring, serif "2". Same placement as A |
| `state-selected.webp` | 532×614 (266×307) | same | yes | dark ink rim with a thin gold inner line and a soft gold glow; 1.2× the tile canvas, centred |
| `keep-red/blue/yellow/cyan/purple/pink.webp` | 552×801 (276×400) | same | yes | the shield pre-tinted per team. **Code uses these** |
| `keep-out.webp` | 552×801 (276×400) | same | yes (80% opacity baked in) | knocked out: greyed, faded shield |
| `place-pop.webp` | 768×768 (384×384) | same | yes | ring of sepia ink stars and gold flecks. **Normal blend** (screen would erase it on parchment) |
| `capture-flash.webp` | 577×665 (288×332) | same | yes | warm cream core with a gold glow, per flipped tile. **Normal blend** |
| `team-card.webp` / `-tint` | 800×310 (–) | same size, slices and ribbon x | yes / mask | parchment card, hand-inked double border, cloth ribbon at x 59–96 (mask = ribbon) |
| `banner.webp` / `-tint` | 1200×185 (–) | same size, slices and text box | yes / mask | A's cloth ribbon, warmed, with an inked outline drawn inward (the mask is the cloth inside the ink) |
| `podium-1st/2nd/3rd.webp` / `-tint` | 418×534, 388×434, 380×369 (–) | same canvases | yes / mask | ink-and-watercolour stone plinths with drapes. Content is bottom-centred at one common scale; see the podium section |
| `shape-circle…heart.webp` | 256×256 (128×128) | same | yes | cream tokens with an ink outline, ink hatching lower-right and a sepia shadow. Use as-is, or tint by multiply |

46 projector files (10.4 MB, of which the 3 maps are 8.6 MB) and 36 phone files (5.9 MB, maps 5.3 MB). The phone set is A's 32 plus `compass-rose` and the 3 maps. A game loads only the one map for its board size: projector 2.0–3.9 MB, phone 1.25–2.4 MB.

## Layer order (board, back to front)

1. Background (parchment).
2. Edge band: drawn in code.
3. The map `map-<size>`, drawn **once**, clipped to the union of all tiles at 0.95R (fallback: `grass-N` per tile instead).
4. Per tile (flat, any order):
   - unclaimed: nothing (the map shows through); claimed: the same map, tinted (lighten polygon, then team-colour polygon with `mix-blend-mode: multiply`, see code change 11). Fallback without a map: team-colour hexagon + `claimed-N`;
   - the ink hex edge, drawn in code.
5. Territory borders, drawn in code.
6. `keep-*` shields, sorted by row.
7. Phone only: `state-blocked` / `state-guarded` + `cost-2`, then `state-selected`.
8. Effects: `place-pop`, `capture-flash`.
9. Compass (optional, can go anywhere above the background but outside the board).

## Continuous map (map-10, map-12, map-14)

One storybook map per board size, in one dark sepia ink `#2c1a0c` on the style-B paper `rgb(240,226,192)`. Each size has its own composition, laid out for its board so the jagged edge only cuts open meadow, forest edges and the mountain tops. Pick by `board.size`: 10 → `map-10`, 12 → `map-12`, 14 → `map-14`. Any other size uses the `grass-1…4` fallback.

- **10x10:** a short mountain ridge, a river to a small lake (lower right), a village with a chapel (plain cross), a stone bridge, pine forest left, oak woods right, a windmill, farm fields with a barn.
- **12x12:** the layout from the mockup: a mountain range, a long river, a village with a chapel (plain cross), a bridge, a lake (lower right), a windmill, pine forests, farms.
- **14x14:** a long range, a river through a market town with a chapel (plain cross), a hamlet, a big lake (lower left), two bridges, a windmill, an orchard, patchwork fields, several forests.

**Resolution.** Projector files are about **150 px per R** (R = hex corner radius), so one drawn tile (0.95R) is **247×285 px**, against ~77×88 in the mockup (3.2× in each direction). Phone copies are at 0.75 scale: **112 px/R**, a tile is **185×214 px**. That is more than half size on purpose, because phones are where players zoom. Exact values (x, y), projector: 10 → 149.84, 149.81; 12 → 149.88, 149.89; 14 → 150.15, 150.19 px/R.

**How it was made** (`src/map/`): base map per size (1152×864) → cut into 12/16/20 overlapping squares (`sections.py`) → each square redrawn at 1024×1024 by the image model, with the square as the reference ("same layout, crisp ink"), so it adds real line detail rather than an upscale → each section registered back onto the base (scale + shift, correlation 0.98–0.997) and joined along a minimum-difference seam with a 4 px feather (`stitch.py`) → ink pass (`finish.py`): one ink colour, each region's ink density matched to the base map so no section reads heavier, darkened for the projector (gain 1.35, gamma 0.85), light unsharp mask, top 0.5R of empty sky trimmed → `build.py maps` writes the WebPs (q72).

### Hex (col, row) → map pixel

The image covers the whole board extent of `boardExtent(size)` (checked against `src/shared/land-board.ts`): pointy-top hexes, odd rows shifted right by half a hex, the top-left of the extent is pixel (0, 0).

```
k   = imgWidth / (√3·(size + 0.5))  ≈  imgHeight / (1.5·size + 0.5)     // px per R (≈150 projector, ≈112 phone)
row = floor(tile / size),  col = tile % size
cx  = k · √3 · (col + 0.5 + 0.5·(row & 1))                               // = k · hexCenter(size, tile).x
cy  = k · (1.5·row + 1)                                                  // = k · hexCenter(size, tile).y
tile box (0.95R): x cx − 0.8227k … cx + 0.8227k,  y cy − 0.95k … cy + 0.95k   (0.8227 = 0.95·√3/2)
corner i (0…5):   (cx + 0.95k·cos(60°i − 90°),  cy + 0.95k·sin(60°i − 90°))
```

In the SVG (R = 10 units) this is simply: put the image at `x=0 y=0 width=width·R height=height·R` with `preserveAspectRatio="none"`. SVG unit u = pixel u·k/10. The ≤0.03% difference between k along x and y is absorbed by the stretch.

For per-tile `drawImage` on a canvas instead, the source rectangle of a tile is `sx = (c.x − TILE_W/2)·k/R`, `sy = (c.y − TILE_R)·k/R`, `sw = TILE_W·k/R`, `sh = 2·TILE_R·k/R` (with c = hexCenter·R in SVG units), then clip to the hexagon.

### Readability

Claimed tiles show the map tinted by the owner (code change 11). Checked at projector distance: every tile's mean colour after a viewing blur, sorted to the nearest team centre (6 teams + unclaimed) on a test board where every colour lands on forest, meadow, river and village: **0 of 108 claimed tiles misread** with the chosen recipe. The closest pair is blue/purple (ΔE 25.6 between the median tiles, comfortably apart); every colour is at least ΔE 40 from unclaimed tiles (cyan 40, yellow 53, pink 57, red 64, blue 71, purple 76). The ×0.55 territory border and the ink hex edges are unchanged.

## Shield start marker (keep-*, 552×801, phone 276×400)

- **Size and anchor are the same as A**: draw at 1.24 × the tile's drawn width, with the anchor (274, 681) px = (49.6%, 85.0%) on the start tile's centre. A's numbers in code still work.
- The shield sits in box x 84–464, y 272–788 of the canvas. That's 380×516 px, or about 0.85 × the tile width wide.
- It stands on the tile like a planted marker: its bottom tip is at +0.21 tile height below the tile centre, and its middle is about 0.3 tile height above it. A sepia drop shadow is baked in down-right.
- Keep drawing markers after all tiles, sorted by row, so the top of the shield overlaps the tile above.
- `keep-out.webp` replaces it when the team is knocked out.

## Team card, banner

- **Team card:** the 9-slice is unchanged: `border-image-slice: 40 40 40 112` with fill.
  - The ribbon is at x 59–96 (centre 77); put the team shape icon on it near the top.
  - Text area: x 112–760, y 40–270.
  - **Text colour changes to dark ink** `#3a2412` (A used light text on walnut). Secondary text `#64462a`.
  - Tiles count: the team colour × 0.75 (darker), so yellow stays readable on parchment.
- **Banner:** unchanged 3-slice (fixed ends at 0–177 and 1038–1200) and text box (x 192–1018, y 23–153). Same tints as A (green `#3d8a34` / dark red `#8e1330` / winner colour), with white text and a dark shadow.

## Podium

- Each canvas is the same size as A's.
- The plinth art is bottom-aligned and horizontally centred at one shared scale. The art boxes (x0, y0, x1, y1) are:
  - 1st: 13, 10, 405, 534 (392×524)
  - 2nd: 0, 18, 388, 434 (388×416)
  - 3rd: 7, 12, 373, 369 (366×357)
- So the heights step 524 / 416 / 357, against A's 534 / 434 / 369; use A's placement unchanged.
- Tint the drapes with `podium-*-tint`. Draw the rank and the shape on the drape in code, as in A.

## Code changes for B (relative to the merged style A)

1. **Drop the raised tile sides:** don't draw the offset "side" hexagon, and don't lift owned top faces. The map is flat; all tiles sit at the same y.
2. **Parchment edge instead of the wooden tray.** Under the tiles:
   - Fill the union of all cells at **1.17R** with ink `#3a2412` (this becomes the outer ink line).
   - On top, fill the union at **1.12R** with a `tray-wood.webp` pattern (the darker parchment band).
   - **No downward offset.**
   - Optional soft sepia shadow: `rgba(60,35,12,0.35)`, offset (0.06R, 0.08R), blur 0.1R.
   - The darker band also shows in the 0.95R gaps between tiles, so the grid reads as inked lines.
3. **Ink hex edges:** `.hex-edge` stroke `rgba(58,36,18,0.6)` (`#3a2412` at 60%), width ≈ 0.04R (SVG units: 0.4 when R = 10). Use the same stroke for owned tiles; drop A's white `.hex.owned .hex-edge`.
4. **Ink-style territory borders:** colour = the team colour × 0.55 (darker), width ≈ **0.11R** (1.1 SVG units at R = 10). Draw them on the tile edge itself (no upward offset, since tiles are flat). Join round.
5. **Watercolour-wash claimed tint (fallback only, when there is no map; see 11):** the method is unchanged. Fill the hexagon with the team colour, then draw `claimed-N` on top (pick the variant like grass, e.g. `(tile*7 + row*3) % 3`). The wash lightness is baked into the overlay; don't add opacity to the fill.
6. **Backgrounds:**
   - `.land-wrap` background: `background.webp` (cover). Same file name, so nothing changes if A already does this.
   - Phone `.land-area`: `felt-tile.webp` repeat (same name; now parchment).
   - Optional: place `compass-rose.webp` at the bottom-left of the board box, about 0.14 × the box height.
7. **Effects blending:** use **normal** blending for `place-pop` and `capture-flash`. If A's code used `screen` / `lighter`, switch it, because light blends disappear on parchment.
8. **Text colours on parchment:**
   - Team cards: dark ink text (see above).
   - The top bar can stay dark (`rgba(60,38,20,0.92)` reads well) with cream text.
   - Optional: use Georgia/serif for the board UI, matching the storybook look (Quizzer already uses Georgia for Cup of Death).
10. **Continuous map** (`land-art.tsx`, about 25 lines). Draw the map once under the tiles, clipped to the union of every tile at 0.95R; claimed tiles paint over it; unclaimed tiles keep their transparent `hex-fill` (so taps still land on `data-tile`) and their ink edge. If the size has no map or the image fails, it falls back to the per-tile `grass-N`.

```tsx
import map10Img from "./land/map-10.webp";
import map12Img from "./land/map-12.webp";
import map14Img from "./land/map-14.webp";
import phoneMap10Img from "./land/phone/map-10.webp";
import phoneMap12Img from "./land/phone/map-12.webp";
import phoneMap14Img from "./land/phone/map-14.webp";
// in ART:
  "map-10": [map10Img, phoneMap10Img],
  "map-12": [map12Img, phoneMap12Img],
  "map-14": [map14Img, phoneMap14Img],

/** One continuous map per board size, covering boardExtent exactly. Other sizes fall back to grass-1..4. */
const MAPS: Partial<Record<number, LandArtId>> = { 10: "map-10", 12: "map-12", 14: "map-14" };

// in HexBoard, after `centres`:
  const [mapFailed, setMapFailed] = useState<string | null>(null);
  const mapId = MAPS[size];
  const useMap = mapId !== undefined && mapFailed !== mapId;
  const mapClip = `hex-map-clip-${size}`;

// in each tile, the top-face image: skip it for grass when the map is on, and keep the fill tappable:
  <polygon class="hex-fill" points={TILE} style={grass ? (useMap ? { fill: "transparent" } : undefined) : { fill: teamColor(owner) }} />
  {!(grass && useMap) && <image href={landArt(grass ? GRASS[...]! : CLAIMED[...]!)} ...same as now... />}

// in <defs>:
  {useMap && (
    <clipPath id={mapClip}>
      {centres.map((c, tile) => <polygon key={tile} points={hexPoints(TILE_R, c.x, c.y)} />)}
    </clipPath>
  )}

// right after the tray group, before {tiles}:
  {useMap && (
    <image class="hex-map" href={landArt(mapId!)} x="0" y="0" width={(width * R).toFixed(2)} height={(height * R).toFixed(2)}
      preserveAspectRatio="none" clip-path={`url(#${mapClip})`} style={{ pointerEvents: "none" }} onError={() => setMapFailed(mapId!)} />
  )}
```

   - Notes: `useState` is already imported. Keep the `GRASS` / `grass-1…4` entries: they are the fallback. One `<image>` costs far less than 144–196 clipped copies of a 9 MP picture, and nothing animates grass tiles, so one draw is enough. If a grass tile ever needs to move on its own (an animation on `.hex.grass .hex-body`), use the per-tile form instead: inside the tile group, `<image href={map} x={-c.x} y={-c.y} width={width*R} height={height*R} preserveAspectRatio="none" clip-path={`url(#${CLIP_ID})`} />`. The same image is drawn in every tile, offset so the tile's own part lands under it.
   - Preload hint (optional): the map is the largest file, so start it early, e.g. `new Image().src = landArt(MAPS[size])` when the Land Grab round is announced.
11. **Claimed tiles: the map tinted by the team** (`land-art.tsx` ~20 lines + 3 lines CSS). Replaces the team-colour hexagon + `claimed-N` whenever `useMap` is on. Inside the claimed tile's `.hex-body`, back to front:
   1. the map, per tile: `<image href={map}>` offset by the tile centre and clipped to the tile (the per-tile form from 10);
   2. **lighten:** `<polygon points={TILE}>`, fill `#fffaf0`, normal blend, `fill-opacity` per team (table);
   3. **tint:** `<polygon points={TILE}>`, fill = the team colour, `fill-opacity` 1, `mix-blend-mode: multiply`;
   4. then the ink `hex-edge`, the keep and the ×0.55 territory border as now.

   | team | colour | lighten fill-opacity | multiply opacity |
   |---|---|---|---|
   | red | #d81e3a | 0.35 | 1 |
   | blue | #1f5ee0 | 0.40 | 1 |
   | yellow | #f5c400 | 0.45 | 1 |
   | cyan | #12b5cb | 0.35 | 1 |
   | purple | #7d3cc8 | 0.40 | 1 |
   | pink | #f0559e | 0.35 | 1 |
   | (any other colour) | | 0.40 | 1 |

   Per pixel this is `b' = b + L·(#fffaf0 − b)`, then `out = b' · team / 255` (8-bit sRGB, what browsers do). The lighten lifts the ink from near-black to a mid brown, so the multiply leaves the ink visible as a darker shade of the team colour and dense forest tiles still read as their team. Yellow, blue and purple get more lighten: yellow so it stays golden rather than olive in forests, blue and purple so their ink keeps contrast and they stay apart. Verified in headless Chrome (`mockups/claimed/svgtest/`): matches the simulation within about 2/255 (resampling noise).

   **Why the map goes inside the tile (isolation):** `mix-blend-mode` blends with whatever is below *inside the nearest isolated group*. `hex-pop` animates `opacity` and `hex-flip` animates `filter`, and both isolate `.hex-body` while they run. If the multiply polygon sat over the single board map from 10, a placed or flipped tile would flash flat team colour for 0.45–0.7 s. With its own copy of the map inside `.hex-body` (and `isolation: isolate` so it is the same when still and when animating) the tinted map pops and flips as one piece. Checked in Chrome: identical when still, tinted map mid-flip. The board-wide map from 10 stays underneath for grass tiles; it can stay clipped to all tiles.

```tsx
/** Lighten before the multiply tint; yellow/blue/purple get more (see manifest). */
const CLAIM_LIGHTEN: Record<string, number> = { "#d81e3a": 0.35, "#1f5ee0": 0.4, "#f5c400": 0.45, "#12b5cb": 0.35, "#7d3cc8": 0.4, "#f0559e": 0.35 };

// in each tile, inside .hex-body, replacing the claimed fill + claimed image when the map is on:
  const color = teamColor(owner);
  {grass ? (/* as in 10 */) : useMap ? (
    <>
      <polygon class="hex-fill" points={TILE} style={{ fill: "transparent" }} />
      <g class="hex-claim">
        <image href={landArt(mapId!)} x={(-c.x * R).toFixed(2)} y={(-c.y * R).toFixed(2)}
          width={(width * R).toFixed(2)} height={(height * R).toFixed(2)} preserveAspectRatio="none" clip-path={`url(#${CLIP_ID})`} />
        <polygon points={TILE} fill="#fffaf0" fill-opacity={CLAIM_LIGHTEN[color.toLowerCase()] ?? 0.4} />
        <polygon points={TILE} fill={color} style={{ mixBlendMode: "multiply" }} />
      </g>
    </>
  ) : (
    <>{/* fallback, as now: */}
      <polygon class="hex-fill" points={TILE} style={{ fill: color }} />
      <image href={landArt(CLAIMED[...]!)} ... />
    </>
  )}
```

```css
.hex-claim { isolation: isolate; pointer-events: none; }
```
   - `CLIP_ID` is the existing per-tile `<clipPath>` (TILE at the origin), and `c` is the tile's `hexCenter`, as in the per-tile form in 10. Taps still land on the transparent `hex-fill`. All claimed tiles share one decoded map, so the extra `<image>` elements cost draw time, not memory.
   - **`claimed-1…3`:** keep them. They are used only in the fallback (no map for the size, or `onError`), together with `grass-1…4`. If the Coder drops the fallback, they can be deleted from the repo; nothing else uses them.
   - The tint colours are the TEAMS palette as is: no shading, no alpha. Don't put `opacity` on `.hex-claim` or `.hex-body` outside the animations.
12. **No change** to: tile size and clip, keep anchor and size, state and effect placement, the card 9-slice, banner slices and text box, podium placement, the palette and shapes, the 1.5× phone default zoom.

## Notes / compromises

- **Pre-tinted shields:** keep-red…pink are pre-tinted, and code uses only those. The neutral `keep.webp` and its `keep-flag-tint` mask were dropped as unused (#80); they are in git history if a new team colour needs tinting.
- **Shield size:** the shield is smaller in the canvas than A's keep (0.85 tile widths, against the keep's full 1.24) because the canvas and anchor are kept the same. About 45% of the canvas is empty. If code can take a new size, a tighter 400×560 canvas could replace it, but that would break the drop-in.
- **Repeated trees:** solved by the continuous map. grass-1…4 remain only as the fallback.
- **Map file size:** the maps are big for line art: 8.6 MB for all three projector files and 5.3 MB for the phone copies, but a game loads one: projector 2.0 / 2.7 / 3.9 MB, phone 1.25 / 1.7 / 2.4 MB for 10 / 12 / 14. A 1080p projector shows the 12x12 board at only ~50 px/R, so if the size matters more than 4K sharpness, the projector could use the phone copy too (it is 112 px/R, still twice what 1080p needs). Lower WebP quality saves little: q60 is only about 9% smaller than q72 and softens the hatching.
- **Map seams:** the detail pass redraws each section independently. The joins follow minimum-difference seams and the ink density is evened out, so I found no visible seams at 100%. Up close, line weight can differ slightly between neighbouring areas (e.g. heavier pine hatching in one forest than another), like different hands on one old map.
- **Empty sky in the top corners:** the maps are drawn in slightly elevated perspective, with mountains along the top. After trimming 0.5R of sky, the top-left 2–3 hexes of the 12x12 (and a corner or two on 10 and 14) are still mostly plain paper. They read as the map's horizon. If that bothers the user, I can redraw those corner sections with distant hills.
- **Claimed look, dense forest:** on the darkest map areas (pine forest) a claimed tile is a deep shade of its colour (deep blue, dark teal, ochre) rather than a bright one. It still reads as its team at projector distance (0 misreads), but it is darker than the same team's meadow tiles. More lighten would make all tiles more even but greyer and wash out the ink; 0.35–0.45 is the balance I picked (see `mockups/claimed-variants.png`, H = more lighten).
- **Yellow shield on yellow:** the yellow keep shield sits on a yellow-tinted tile and has less contrast than before, but its dark outline and white cross keep it readable (see `preview-scene.png`).
- **Capture flash vs pink:** the red capture flash over red tiles (preview-scene) looks pinkish for its 0.7 s. It is a short animation, but in a 6-team game with pink it is the one moment two colours look alike.
- **Blank sky tiles:** claimed tiles in the empty top corners are near-flat team colour (no ink to show), which is fine.
- **Phone memory:** the phone 14x14 map decodes to ~27 MB (2828×2422 RGBA); fine on current phones.
- **Watercolour colour:** the wash keeps the exact team colour underneath but lightens it, so the 6 colours stay clearly apart on parchment. Yellow becomes a buttery yellow, still distinct from the cream grass because of the darker yellow border.
- **Podium:** the drapes were generated magenta and converted to neutral, as in A, so the masks are clean.
- **Christian-school check:** crosses on the shields and on the map chapels' steeples (plain crosses) only. The compass rose is plain (N only, no symbols). No runes, sigils or creatures; the trees, hills and tufts are ordinary.
- **Halo check:** keyed art (shields, podium, banner, card, shapes, pop, compass, selected) was checked over white and magenta at 100%. Edges are decontaminated (`bleed()` / white un-mixing), with no light or dark fringes.

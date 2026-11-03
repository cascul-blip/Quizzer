# Santa's Sleigh Run: art and animation brief

This is the art for **Santa's Sleigh Run**, a Christmas quiz game for a school classroom. It is shown on a projector (16:9) and on students' phones. The projector shows a snowy town at night, seen **from straight above** like a map. Each student flies their own Santa sleigh over the rooftops and drops presents down chimneys. Up to 30 sleighs and 30 houses can be on screen at once, and the whole town fits on one screen, so **every asset is seen small**. Shapes need to be bold and readable, not fussy.

**The audience is a school classroom.** Keep it cozy, warm, magical and friendly: a picture-book Christmas Eve. Nothing scary, no religious imagery, no brands.

The game is already playable with simple vector drawings. This art replaces them. Positions, colours that change, glows, twinkling, smoke drift and all text are done in code, so the images only need to supply the look.

---

## Global style (add to every prompt)
> Cozy storybook illustration of Christmas Eve, painted digitally like a modern children's picture book. Soft painterly shading with clean, crisp outlines and bold simple shapes that read clearly when small. Night palette: deep navy and indigo shadows, moonlit blue-white snow, warm golden window light, rich Christmas red, pine green and gold accents. Cool moonlight comes from the top-left of the image. No text, no letters, no numbers, no logos, no watermark, no signature.

**Keep one style reference.** Generate `ground.jpg` and `sleigh.png` first. Once they look right, pass them as style or image references to **every** later image, so the whole set matches.

---

## Technical rules (read before generating anything)

1. **Top-down means straight down.** Every in-world asset (sections B to E) is an **orthographic view from directly overhead**, like a map or a satellite photo: no perspective, no tilt, no visible walls on the sides of houses, no horizon. If the model keeps tilting the view, add *"flat top-down orthographic plan view, camera pointing straight down, 90 degrees"*.
2. **Facing right.** Anything with a front (the sleigh and the reindeer) points its nose to the **right edge** of the image. The game rotates it to any direction.
3. **Cut-out sprites go on flat magenta.** Anything that isn't a full background goes on a **flat, evenly lit, pure magenta background (#FF00FF)**. The background has no shadow, gradient, vignette or texture, and there is **no magenta or hot pink anywhere on the subject**. (Magenta is used instead of green screen because the trees and holly are green.) If the service can export a **true transparent PNG**, that is even better: use it instead.
4. **Glows and effects go on pure black (#000000).** Sparkles, snow puffs, smoke and fireworks are keyed by brightness, so the black must be truly black, with no haze or vignette.
5. **No cast shadows on sprites.** The game adds its own soft shadow under every sprite. Light and shade *on* the object (the moonlit side brighter) is good. A shadow falling *onto the background* is not.
6. **Fill the frame as stated.** Each asset says how much of the canvas the subject should fill. Centre it unless told otherwise. Never crop the subject at the canvas edge, except for roofs (which go edge to edge on purpose).
7. **Player-colour areas are painted "key cyan".** A few things change colour to match each student (the body of their sleigh, the present they deliver, a marker on their steering wheel). Paint those areas a **saturated sky cyan (around #00C8FF)**, with normal light and shade, and use **no other blue or cyan anywhere on that object**. The game swaps the cyan for the player's colour.
8. **Sizes.** Generate at the sizes given (or larger, at the same aspect ratio). PNG for sprites, PNG or high-quality JPG for opaque backgrounds.
9. **Variants match their base.** When a file is "the same as X but…", make it **image-to-image or with an inpainting/edit tool from X**, so the shape, size and position stay identical. The game swaps one for the other in place.
10. **No text anywhere.** The game draws all words itself. Leave blank any area that would normally hold a sign or a label.

---

## Asset list

Priority: ★★★ = needed for the new look. ★★ = strongly wanted. ★ = nice extra.

### A. The town ground (opaque backgrounds)

The houses are placed at random every game, so the ground must be **generic snow with no buildings, roads or paths**. The game draws the trodden footpaths and places the trees, lamps, pond and houses on top.

| File | Size | Pri | Prompt (add the global style) |
|---|---|---|---|
| `ground.jpg` | 3200×1800 | ★★★ | "Flat top-down orthographic view straight down onto a wide open field of fresh snow at night, seen from high above. Gentle soft drifts and wind ripples, subtle blue moonlit shading with brighter areas toward the top-left, a few faint sparkles in the snow. Even, calm and low in contrast so objects placed on top stand out. No buildings, no roads, no paths, no trees, no footprints, no objects, no horizon." |
| `snow-tile.jpg` | 1024×1024 | ★★ | Image-to-image from `ground.jpg`: "Seamless tileable square texture of the same moonlit snow, same scale and colour, tiles perfectly on all four edges, no visible seams." (A fallback if the big ground looks blurry on very large screens.) |

### B. Houses (top-down roofs on magenta)

Each house is seen from directly above, so it is **just its roof**: a snowy **hip roof** (four sloping faces meeting at a ridge along the long side; a square house has a pyramid roof meeting at a point). **The roof fills the canvas edge to edge**, with no ground, garden or margin showing, because the game stretches it to the house's footprint. **Leave out the chimney** (it is a separate sprite, placed at a different spot on each house). Snow covers the upper part of each face, and a band of roof shingles shows along the eaves. The face toward the top-left is brightest in the moonlight, and the face toward the bottom-right is darkest.

Houses come in different proportions, so each roof is needed in **five shapes**:

| Shape | Canvas | Ridge |
|---|---|---|
| `sq` | 1024×1024 | pyramid, meets at the centre |
| `wide` | 1024×768 | runs left–right |
| `long` | 1280×768 | runs left–right |
| `tall` | 768×1024 | runs top–bottom |
| `tower` | 768×1280 | runs top–bottom |

Each shape comes in **four roof colours**: `red` (barn red), `blue` (slate blue), `brown` (chocolate brown), `sage` (grey-green). It also comes in **two states**:

- **`-dark`**: still waiting for its present. The roof is moonlit and quiet, and there may be a faint warm edge of window light at the eaves.
- **`-lit`**: the present has been delivered. **The same roof (image-to-image from `-dark`)**, now strung all round the eaves with **multicoloured Christmas lights** (red, gold, green, blue, orange), with a warm golden glow along the edges and a small holly garland along the ridge. It looks festive and celebrating.

File names are `roof-<shape>-<colour>-<state>.png`, for example `roof-wide-red-dark.png` and `roof-wide-red-lit.png`. That makes 40 files. **The minimum is the five `red` shapes in both states (10 files).** The other colours can be made image-to-image from those by recolouring only the shingles.

| Pri | Prompt for `roof-wide-red-dark.png` (add the global style + technical rules) |
|---|---|
| ★★★ | "Flat top-down orthographic view straight down onto the snowy hip roof of a small cottage at night, the roof filling the entire image edge to edge. Four sloping roof faces meet at a straight ridge running left to right across the middle. Deep barn-red shingles show along the eaves, thick soft snow covers the upper part of every face and the ridge. Moonlight from the top-left: the top face is brightest, the bottom face is in deep blue shadow. No chimney, no ground visible, no text." |
| ★★★ | `roof-wide-red-lit.png`: image-to-image or edit from the dark roof: "The same roof, same shape and framing, now decorated for Christmas: a string of glowing multicoloured fairy lights (red, gold, green, blue, orange bulbs) runs all the way round the edge of the eaves, warm golden glow along the edges, a small holly garland along the ridge. Festive and cheerful." |

For the other shapes, change "a straight ridge running left to right" to fit: `sq` "four triangular faces meeting at a single point in the centre (a pyramid roof)"; `tall` and `tower` "a ridge running from top to bottom".

### C. House details (magenta, unless noted)

| File | Size | Fill | Pri | Prompt |
|---|---|---|---|---|
| `chimney-waiting.png` | 512×512 | 60% | ★★★ | "Flat top-down orthographic view straight down onto a small square red-brick chimney with a thick cap of snow round its rim, the open flue glowing warm orange from a fire below, as if waiting for Santa. Flat magenta background, no shadow on background." |
| `chimney-done.png` | 512×512 | 60% | ★★★ | Image-to-image from waiting: "The same chimney, same size and position, the opening now dark with a tiny glow of embers deep inside." |
| `gift-red.png` | 512×512 | 75% | ★★★ | "Flat top-down view straight down onto a single wrapped Christmas present, a square box in shiny red wrapping paper with a gold ribbon crossing over the top and a big gold bow in the middle. Flat magenta background, no shadow on background." Make **`gift-green`, `gift-blue`, `gift-purple` and `gift-gold`** too (gold gets a red ribbon). These bob over the houses still waiting for presents. |
| `gift-key.png` | 512×512 | 75% | ★★★ | Image-to-image from `gift-red`: "Same present, the wrapping paper now flat key cyan (#00C8FF) with natural shading, a white ribbon and bow." (The game turns the cyan into the colour of the sleigh that delivered it.) |
| `wreath.png` | 512×512 | 80% | ★ | "Top-down view of a small round Christmas wreath of pine with red berries and a red bow at the bottom. Flat magenta background." (Hangs by the door of delivered houses.) |

### D. Town props (magenta)

These are placed by the game in the gaps between the houses, so each one is a separate cut-out.

| File | Size | Fill | Pri | Prompt |
|---|---|---|---|---|
| `pine-1.png`, `pine-2.png`, `pine-3.png` | 512×512 | 85% | ★★★ | "Flat top-down orthographic view straight down onto a single snowy fir tree seen from above: a round star-shaped crown of dark green needle boughs radiating from the centre, with snow resting on the boughs, brighter toward the top-left. Flat magenta background, no shadow on background." Make three slightly different trees. |
| `pine-decorated.png` | 512×512 | 85% | ★★ | Image-to-image from `pine-1`: "The same tree from above, decorated as a Christmas tree with coloured baubles and fairy lights, a gold star at the very centre (the top of the tree)." |
| `lamp.png` | 256×256 | 50% | ★★ | "Flat top-down view straight down onto the top of an old-fashioned iron street lamp: a small round dark lantern cap with a warm glowing light, seen from above. Flat magenta background." (The game adds the pool of light on the snow.) |
| `pond.png` | 1024×640 | 95% | ★★ | "Flat top-down view of a small frozen oval pond: smooth pale blue ice with faint skate marks and cracks, a soft rim of snow and a few reeds round the edge. Flat magenta background." |
| `snowman.png` | 512×512 | 70% | ★ | "Flat top-down view straight down onto a snowman seen from above: three round snowballs seen as circles inside each other, a black top hat in the middle, a red scarf, an orange carrot nose pointing right. Flat magenta background." |
| `sled.png` | 512×512 | 70% | ★ | "Flat top-down view of a small wooden children's sled with red runners left in the snow. Flat magenta background." |

### E. The town edge and the North Pole (magenta)

| File | Size | Fill | Pri | Prompt |
|---|---|---|---|---|
| `wall-straight.png` | 2048×160 | full width | ★★★ | "Flat top-down orthographic view straight down onto a long, low old stone wall running left to right, capped with thick snow, filling the full width of the image. Seamless: the left and right ends match so it can repeat. Flat magenta above and below the wall." |
| `wall-corner.png` | 512×512 | – | ★★ | "Top-down view of the corner of the same low snow-capped stone wall, turning from running left (along the top) to running down (along the right side), with a square stone pillar topped with snow at the corner. Flat magenta background." |
| `wall-wreath.png` | 256×256 | 80% | ★ | "Top-down view of a small Christmas wreath with a red bow, lying on snow. Flat magenta background." (Spaced along the wall.) |
| `launch-pad.png` | 1024×1024 | 100% circle | ★★★ | "Flat top-down orthographic view straight down onto a round launch pad at the North Pole: a perfect circle of polished pale-blue ice with a thick red-and-white candy-cane striped rim. A plain, smooth, empty band of ice runs just inside the rim (leave it completely blank, no letters). In the exact centre is the top of a red-and-white striped North Pole topped with a shiny gold ball, seen from directly above as a small round disc. A few sparkles on the ice. Flat magenta outside the circle." (The game writes "NORTH POLE" in the blank band.) |

### F. The sleigh and reindeer (magenta, facing right)

The sleigh team flies in any direction, seen from straight above. The game builds the team from separate pieces: the **sleigh** (with Santa in it) at the back, **two pairs of reindeer**, and **Rudolph** leading. The harness lines are drawn in code. The team swings into turns, and the reindeer gallop.

**Proportions.** The whole team is 8 m long and 3 m wide. The sleigh with Santa is the back third, about 2.7 m long. Each reindeer is about 1.8 m nose to tail, plus antlers. Draw the sleigh and the reindeer at the **same scale** (both use 1024 px = 3 m) so they fit together.

| File | Size | Pri | Prompt (add the global style + technical rules) |
|---|---|---|---|
| `sleigh.png` | 1024×512 | ★★★ | "Flat top-down orthographic view straight down onto Santa Claus in his flying sleigh, the sleigh's front pointing to the right. A classic curved Christmas sleigh with elegant gold scrollwork trim and gold runners curling up at the front. **The sleigh body is painted glossy key cyan (#00C8FF)** with natural highlights. Seen from above: Santa sits in the front of the sleigh, red coat with white fur trim, his red hat with a white bobble flopping back, white beard poking forward, black mittens holding reins that run off the right edge. A brown sack overflowing with wrapped presents (red, gold, white and green only, no blue) sits behind him at the back of the sleigh. The sleigh fills 85% of the image width. Flat magenta background, no shadow on background." |
| `sleigh-red.png` | 1024×512 | ★ | Image-to-image from `sleigh.png`, with the body painted classic red. (Used on the title screens, where there is no player colour.) |
| `reindeer-1.png` … `reindeer-4.png` | 1024×512 | ★★★ | "Flat top-down orthographic view straight down onto a single reindeer galloping through the air, nose pointing to the right, seen from directly above: warm brown back with a lighter stripe, white tail, a red leather collar with a gold bell, branching antlers spread out either side of the head. Legs stretched out in a flying gallop. The reindeer fills 60% of the image width, centred. Flat magenta background, no shadow on background." Four frames of one **gallop cycle**: (1) legs stretched out front and back, (2) legs gathering in, (3) legs tucked under the body, (4) legs reaching out again. Same reindeer, same size, **same body position** in every frame (image-to-image from frame 1): only the legs (and a little head bob) change. |
| `rudolph-1.png` … `rudolph-4.png` | 1024×512 | ★★★ | Image-to-image from each reindeer frame: "The same reindeer and pose, now Rudolph: a bright, shiny, glowing red nose." (The game adds the nose's glow.) |

### G. Effects (pure black background)

| File | Size | Pri | Prompt |
|---|---|---|---|
| `sparkle-burst.png` | 1024×1024 | ★★★ | "A burst of golden magic sparkles and tiny stars exploding outward from the centre, Christmas magic, bright gold and white, on a pure black background." (A present lands down a chimney.) |
| `snow-puff.png` | 1024×1024 | ★★★ | "A soft round puff of powdery white snow bursting outward, seen from above, glittering, on a pure black background." (A sleigh bumps the town wall.) |
| `magic-dust.png` | 1024×256 | ★★ | "A trail of glittering golden stardust streaming from right to left, dense and bright on the right, fading and scattering to the left, on a pure black background." (Behind each flying sleigh.) |
| `chimney-smoke.png` | 512×512 | ★ | "A small soft wisp of pale blue-grey chimney smoke curling upward, on a pure black background." |

### H. Screens (opaque, 16:9 unless noted)

These are not top-down: they are ordinary picture-book scenes.

| File | Size | Pri | Prompt |
|---|---|---|---|
| `takeoff.jpg` | 1920×1080 | ★★ | "Side view of Santa's sleigh with its team of reindeer, Rudolph leading with his glowing red nose, poised on a snowy hilltop at the edge of a cozy little town at night, ready to take off to the right. Huge full moon, starry indigo sky, snow-covered rooftops with warm glowing windows below. Magical, exciting. Keep the middle third of the image calm and uncluttered." (The "Get ready to fly in 3, 2, 1" screen, with big numbers drawn over the middle.) |
| `celebration.jpg` | 1920×1080 | ★ | "High aerial view at night of a whole cozy snowy town where every house is strung with glowing multicoloured Christmas lights, fireworks of gold and red bursting in the sky, Santa's sleigh silhouetted against the full moon. Joyful. Keep the centre calm for a message." (The podium background.) |
| `candy-canes.png` | 1024×1024 | ★★ | Magenta background: "Two crossed red-and-white striped candy canes tied together where they cross with a red bow and sprigs of holly with red berries, front view. Flat magenta background, no shadow on background." |

### I. Phone art

| File | Size | Pri | Prompt |
|---|---|---|---|
| `wheel.png` | 1024×1024 | ★★★ | Magenta background: "Front view, perfectly face-on and perfectly circular, of a magical wooden sleigh steering wheel: a red-lacquered wooden rim between two gold bands with gold studs, six red-and-white candy-cane striped spokes, six turned wooden handles poking out past the rim with gold tips, and a round gold hub decorated with holly and red berries. **A short section of the rim at the very top (12 o'clock) is painted key cyan (#00C8FF)** with a small gold star on it, and **the centre of the hub is a key cyan disc**. Exactly centred, filling 95% of the image, no tilt. Flat magenta background, no shadow on background." (This spins under the student's thumb, so it must be exactly round and centred. The cyan becomes their sleigh's colour.) |
| `phone-bg.jpg` | 1080×1920 (portrait) | ★★ | "Tall portrait night scene looking up at a starry indigo sky over snowy rooftops, gentle falling snow, a tiny silhouette of Santa's sleigh crossing the moon high up. Dark, calm and low in contrast so white text and buttons on top read easily. Nothing important in the middle." |

Phones get half-size copies of the other art automatically, so they need nothing else.

---

## Optional: video clips

These are only useful if the video model can keep the **camera completely locked** (no zoom, no pan, no shake) and the background perfectly flat. The game turns clips into sprite-sheet animations.

Rules for every clip: 1280×720 (or the asset's own aspect ratio), 24 fps, video only, **locked-off static camera**, flat pure magenta (#FF00FF) background with no shadows (or pure black for effects). Use the matching still as the **first frame** so the design matches.

| File | Pri | Starting frame | Prompt |
|---|---|---|---|
| `clip-reindeer-gallop.mp4` | ★★ | `reindeer-1.png` | "Top-down view from directly above, a reindeer gallops through the air in place, nose to the right, like on a treadmill: two full gallop strides, legs reaching and tucking, a gentle head bob, antlers steady. The body stays in the same spot. Ends on the same pose it starts on, so it loops seamlessly. Static camera, flat magenta background." 2 s. |
| `clip-rudolph-gallop.mp4` | ★★ | `rudolph-1.png` | The same, for Rudolph, with his nose glowing and softly pulsing. |
| `clip-takeoff.mp4` | ★ | `takeoff.jpg` | "Santa's reindeer leap from the hilltop and the sleigh lifts off, soaring up and away to the right across the moon, leaving a trail of golden sparkles, snow puffing up from the hill. The camera stays still." Exactly 3 s (it plays during the 3, 2, 1 countdown). |
| `clip-sparkle.mp4` | ★ | – | "A burst of golden Christmas magic sparkles and tiny stars explodes outward from the centre and fades away. Pure black background, static camera." 1 s. |
| `clip-fireworks.mp4` | ★ | – | "Several gold, red, green and white firework bursts blooming one after another across the frame and fading. Pure black background, static camera. Ends on black, so it loops." 3 s. (Played over the town when the last present is delivered.) |

---

## Checklist before handing the art back
- [ ] Every top-down asset is looking **straight down**, with no perspective or tilt.
- [ ] The sleigh and the reindeer point **right**, and are drawn at the **same scale**.
- [ ] The reindeer frames line up: flicking between them, the body doesn't move, only the legs.
- [ ] Each roof fills its canvas edge to edge, with **no chimney**. The ridge direction matches the shape.
- [ ] Every `-lit` roof is the same shape and framing as its `-dark` partner.
- [ ] Magenta backgrounds are flat, with no shadows and no pink or magenta on any subject.
- [ ] Effects are on true black.
- [ ] Player-colour areas (sleigh body, `gift-key`, wheel marker and hub) are key cyan, with no other cyan or blue on those objects.
- [ ] The steering wheel is perfectly round and centred.
- [ ] No text, letters or numbers in any image. The launch pad's band is blank.
- [ ] Files go in `scripts/sleigh-art/` with the names above, and clips in `scripts/sleigh-art/clips/`. Anything rejected or re-rolled goes in `scripts/sleigh-art/alternates/`.
- [ ] Add a short `scripts/sleigh-art/notes.md` listing anything that didn't come out as asked (for example "walls aren't quite seamless" or "portrait roofs were made by rotating").

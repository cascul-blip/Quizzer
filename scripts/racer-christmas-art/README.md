# Neon Noel Racer artwork

## Santa space flyby

`santa-flyby.png` was generated with the built-in ImageGen tool. The game uses
`src/client/shared/racer/christmas/santa-flyby.webp`, a 320 px wide transparent
sprite prepared with nearest-neighbor scaling to retain crisp pixels and alpha:

```sh
magick scripts/racer-christmas-art/santa-flyby.png -trim +repage -filter point -resize 320x -define webp:lossless=true src/client/shared/racer/christmas/santa-flyby.webp
```

Santa overtakes the car from right to left on the Christmas theme only, beginning
three seconds after entering space and every 30 seconds thereafter. Each pass
takes eight seconds. Landing resets the schedule, hidden-tab time does not cause
catch-up passes, and reduced motion hides the flyby. The projector and phones
both use the shared scene.

Final generation prompt:

> Use case: stylized-concept. Asset type: transparent game sprite for a side-scrolling 16-bit arcade Christmas racing game. Create a single cohesive pixel-art sprite: Santa Claus seated in a red sleigh with golden runners, an oversized bulging brown toy sack behind him visibly overflowing with colorful wrapped presents, teddy bear and toys, and four flying reindeer in two readable pairs harnessed ahead of the sleigh. All face LEFT, flying horizontally: reindeer at LEFT, sleigh at RIGHT. Pure side-on orthographic profile, no perspective, every reindeer and sleigh entirely inside frame, generous transparent padding. Santa has unmistakable red hat and suit, white beard, holds reins. Flying gallop poses. Style: authentic low-resolution 16-bit pixel art, crisp square pixel clusters, dark navy outlines, limited palette, bright red, warm gold, brown reindeer, snowy white highlights and subtle purple shadows, matching a small 160px-wide orange/purple retro racer car sprite. Wide composition about 3:1, designed to read when displayed at 320 pixels wide. Actual transparent background, no sky, no ground, no stars, no shadows outside sprite, no lettering, no watermark, no blur or gradients. This is a new sprite, not a reference-image edit.

## Original scene sources

Generated using the built-in ImageGen tool for the approved Neon Noel concept.
These PNGs are source art; the game uses the prepared WebPs in
`src/client/shared/racer/christmas/`.

Run `python3 scripts/racer-christmas-art.py` to regenerate the game sprites.
The pipeline crops transparent padding, removes faint alpha halos, downsamples,
reduces the palette without dithering, and makes alpha binary. The 160 px car
has a matching wrecked variant using the original Racer crash treatment. The
960 × 101 skyline mirrors its two halves so both tile boundaries join exactly.
The 64 px tree replaces the palm without changing parallax or gameplay.

## Generation prompts

Shared prefix for each source:

> Production game asset for Neon Noel, a Christmas retro arcade side-scrolling racer. Genuine crisp low-resolution 16-bit pixel art, square pixel clusters, hard edges, small palette purple indigo cyan magenta amber orange. Transparent background, no text, no watermark, no shadows outside object.

`car.png`:

> One orange classic 1980s Porsche 911 coupe in PERFECT side-on orthographic profile FACING LEFT, nose at left, rear spoiler at right, both wheels visible. A small red white Santa hat sitting on roof, tiny green wreath with red bow on door, sparse snow on roof and hood. Entire car contained with transparent padding, no ground. Horizontal wide sprite. Match sleek elongated body of classic arcade 911.

`tree.png`:

> Exactly one full evergreen Christmas tree sprite, snow-laden layered triangular dark teal branches with chunky cyan-white snow, magenta pink and cyan and golden light bulbs, simple short brown trunk. Full tree from pointed top to base fully visible, symmetrical front view, no ground. Tall narrow sprite.

`skyline.png`:

> A wide horizontal strip of snowy futuristic city skyline, only buildings and Christmas string lights, no sky, no sun, no ground. Buildings on same bottom baseline, indigo purple silhouettes, pink amber glowing rectangular windows, bright cyan white snow caps, some wreaths, festive fairy lights between roofs. Vary heights with clear tall towers and short rectangular blocks. Straight-on side elevation, seamless compatible edges same low height, no perspective. Wide 4 to 1 composition.

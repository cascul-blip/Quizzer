# Neon Noel Racer artwork

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

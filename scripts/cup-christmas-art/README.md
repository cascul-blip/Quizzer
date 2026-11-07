# Cup of Cheer — Toy Factory artwork

Generated with the built-in image_gen tool using the selected [Toy Factory concept](../../output/cup-of-cheer-concepts/2-toy-factory.png) as the style reference. The background and table are separate production assets; avatar heads, mugs, dice and sparkle effects are rendered by the game.

- `workshop.png`: empty workshop backdrop.
- `table.png`: transparent maple table with red trim and a green base; alpha preserved.
- Optimized runtime copies: `src/client/shared/cup/christmas/{workshop,table}.webp`.

The lobby's **Theme → Santa's Workshop / Normal** control defaults to Christmas. The game-mode menu always says **Cup of Cheer**. The normal theme preserves the original saloon and elimination. Theme selection and cup count persist when playing again.

The Christmas elimination uses the existing elimination odds and round rules: supercharged cocoa causes a 650 ms energy shake, followed by a fast upward launch and a gold/cream/mint sparkle trail. All motion finishes within the existing 1800 ms verdict interval. Both projector and phone use the original head and accessory art without bodies. Reduced-motion users get a fade. Launched players can continue practising.

Christmas screens reuse the North Pole Tower Christmas music arrangements and add a synthesized power-up/rocket sound. Classic screens keep their original audio.

To review: `bun scripts/cup-preview/serve.ts`, then open `http://127.0.0.1:8096/` or `/phone`. Controls cover normal/Christmas, scenes, 1–24 players, 1–6 cups, blastoff and successive launches. `scripts/cup-preview/check.mjs` checks production components in Chromium and saves screenshots in `output/cup-of-cheer-review/`.

Rebuild WebPs with `python3 scripts/cup-christmas-art/build.py` (Pillow required).

## Generation prompts

### Workshop

Use case: stylized-concept. Asset type: production background plate for Christmas party game Cup of Cheer. Input reference image is STYLE AND ENVIRONMENT REFERENCE ONLY, the approved Toy Factory direction. Create just the EMPTY ROOM in same tactile soft 3D painted wood art style. Interior Santa's toy factory with green curved timber beams, brass lamps, golden fairy lights, snowy arched windows, red-and-green toy conveyor and brass cogwheels at rear, wooden toy-making benches at far left and right edges with trains, blocks and wrapped gifts. HIGH camera looking steeply DOWN, back wall confined to upper 35 percent; huge clear empty honey oak plank floor occupying lower 65 percent and all central area, intended for game sprites overlaid later. NO central table, NO chairs, NO mugs, NO dice, NO characters or animals, NO bodies, NO text or signs. Wide landscape 16:9 room filling entire canvas. Warm golden light, red, cream, green, brass accents. Do not reproduce foreground table or characters from reference. Need empty spacious room with perimeter decorations only.

### Table

Use case: stylized-concept. Asset type: ONE isolated production table sprite for Cup of Cheer party game. Input image STYLE REFERENCE ONLY, match its soft tactile 3D clay-and-painted-wood TOY FACTORY table. Generate a SINGLE EMPTY round maple table, high three-quarter perspective so top is a wide horizontal ellipse, roughly 2.4 times wider than its depth. Entire circular top visible, no objects. Light warm honey maple tabletop with subtle grain and uncluttered clean center. Thick rounded peppermint RED rim with small brass rivets, small centered holly motif on FRONT edge, short chunky pine green pedestal underneath. Centered isolated asset fully in frame with small transparent margins, transparent background, NO floor, no background, no ground shadow. NO animals, no bodies, NO chairs, no mugs, no dice, no text, no other objects. All table feet visible. Landscape asset. Perspective and broad shapes suitable for compositing avatars around it.

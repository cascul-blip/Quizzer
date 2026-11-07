# Gingerbread Siege artwork

Generated with the built-in image_gen tool, using output/fight-christmas-concepts/1-gingerbread-siege.png as a style reference. Original transparent PNGs are preserved here. Runtime assets live in src/client/shared/fight/christmas/ with half-size phone copies. Run `python3 scripts/fight-christmas-art.py` to regenerate WebPs (Pillow required).

The castle stages share a fixed canvas and baseline. Team gumdrop/doorway stripe tint regions, snow, sugar puffs and crumbs are drawn in SVG. Red and blue tower flags are separate painted sprites based on the approved draft, with snowy cloth, an icing snowflake and gold finial. The colored band around the upper tower is removed. The original sugar texture is retained through a team-color filter clipped to traced candy silhouettes. The catapult base and arm are independent transparent sprites. The arm's peppermint pivot is at approximately 90.8% width, 54% height in the source image; code aligns that pivot with the base axle and mirrors the whole assembly for Blue. Its cup aligns with the existing launch point. `catapultAngle` controls the release and return over 700 ms, synchronized to server shot elapsed time. Reduced motion keeps the arm still and removes snow and light animation.

## Base asset prompts

Shared prefix: Use case: stylized-concept. Production sprite for a side-on 2D Christmas gingerbread castle artillery game. Charming detailed hand-painted baked cookie, piped white icing and glossy candy materials, matching the attached gingerbread siege concept image. No text, labels or watermark.

### castle

Transparent background: true.

One tall cylindrical gingerbread castle tower, front-on side game view, isolated on transparent background. No flag or banner. Tall narrow aspect about 0.4 width to height. Crenellated biscuit battlements, piped icing horizontal trims, golden warm windows, chocolate door, white snowflake decoration, neutral white gumdrops to permit team accents added in code. Whole structure visible with small transparent margins, flat bottom. No scenery or ground.

### catapult-base

Transparent background: true.

ONLY stationary chassis of a small gingerbread catapult, facing right, exact flat side view. Wide low rectangular cookie chassis, two peppermint wheels, central triangular A-frame support with round peppermint pivot axle at its upper tip. White icing trim. No throwing arm, NO spoon, NO cup, NO diagonal lever attached. Empty space above. Isolated transparent cutout with tight margins.

### catapult-arm

Transparent background: true.

ONLY a single detached throwing arm of a gingerbread catapult, isolated transparent cutout. Straight horizontal narrow baked biscuit lever extending leftward from a round peppermint pivot at the far RIGHT end, to an upward-open golden cookie spoon cup at the far LEFT end. Flat side view. Icing trim. Full part visible, tight margins, no base no wheels no support no scene.

### sky

Transparent background: false.

Wide 16:9 seamless-feeling winter village landscape BACKGROUND ONLY. Plum purple twilight sky fills upper 75 percent with subtle snow and warm pink clouds. Tiny distant snowy cozy Christmas village with warm golden windows, decorated evergreen trees and distant lavender mountains fills lower 25 percent. No foreground towers, no catapults, no foreground hill, no characters, no UI. Suitable as subtle non-distracting game background.

### earth

Transparent background: false.

Seamless tileable square texture of golden brown baked gingerbread cookie earth, small crumbs and tiny chocolate flecks. Flat even warm lighting, no perspective, no objects, no snow, no border. Detailed painterly game terrain material.

### icing

Transparent background: false.

Seamless tileable square texture of thick white vanilla icing snowy frosting, subtle rounded swirls and tiny sugar crystals, creamy white with slight lavender shadows. Flat even lighting, no objects no border, painterly game terrain material.

## Damage variants

Each stage uses castle-0.png as its edit target, preserving canvas, position, scale and baseline with a transparent background. Stage 1 adds cracks and chips in the upper-right battlements; stage 2 breaks the right battlements and adds spreading cracks and missing icing; stage 3 removes a larger upper-right section and breaks windows; stage 4 removes most of the upper-right wall, with severe cracks and broken icing, while keeping the left portion standing and the base intact. No fire, smoke, floating debris, ground, scenery, or text.


Ground generation and refinement prompts are recorded in [ground-prompts.md](ground-prompts.md).

## Painted icing terrain

`ground-low.png`, `ground-medium.png` and `ground-high.png` are three distinct transparent ground paintings generated with the built-in image_gen tool. Their polished white icing has rounded drips matching the draft. The runtime swaps the image with the selected hill height. The art converter measures each connected alpha silhouette into `src/shared/fight-ground-profiles.json`, normalizes its peak to the corresponding classic hill height, and keeps the tower/catapult platforms flat. That same profile controls server collisions and client image placement. Christmas hills use these fixed paintings; Random selects among the three heights.

The live terrain clips the fixed original painting. There is no icing stroke along the live surface, so carving removes icing and cookie without regenerating icing in craters. Both host and phone receive the hill choice and the current damaged terrain, so reconnecting preserves the cuts.

Gumdrop regions are traced in the castle source's 793×1983 canvas and clipped directly as SVG paths. A luminance-based team-color filter preserves the sugar grains and original shading; source alpha naturally removes missing candy in damaged stages.

## Flags, candy-cane stripes and grounding

`flag-red.png` and `flag-blue.png` were generated with the built-in image_gen tool using the approved draft as a reference. Exact prompts are in [flag-prompts.md](flag-prompts.md). Host and phone WebPs are produced by the same converter. Blue mirrors the artwork to face inward. The poles mount over the tower battlements.

Doorway trim uses a traced arch clip and a warm-pixel mask, so the cookie-colored candy-cane stripes take the team color while the white icing stripes retain their original color and shading. All damage stages use their own source image. The castle canvas sits four field units lower than the first version, compensating for its transparent bottom padding so its iced base overlaps the ground slightly.

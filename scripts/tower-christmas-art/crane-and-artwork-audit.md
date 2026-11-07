# North Pole Workshop crane and artwork audit

Generated with the built-in image_gen tool, using the approved concept as the style reference. crane.png is a transparent source sprite; not integrated into the game. Full machine is a single layer, so independent jib or hook animation will require additional preparation if desired.

## Final prompts

### Initial generation

Use case: stylized-concept. Asset type: transparent game sprite, a rooftop construction crane replacement for Tallest Tower Christmas North Pole Workshop theme. Reference image is STYLE REFERENCE ONLY, use its soft tactile 3D clay and painted wood aesthetic, snowy pine-green workshop beams, red festive accents, and brass hardware. Create ONE complete ELF WORKSHOP ROOFTOP HOIST, clearly readable as a functional construction crane. Strictly straight-on side elevation, orthographic, no ground plane or perspective, no visible front/back depth of building, no building included. Landscape canvas approximately 3:2. A single vertical pine-green timber mast rises from a small flat brass mounting foot near bottom center-left. Horizontal long pine-green wooden jib across upper third: short counterweight arm extends left of mast and much longer lifting arm extends right. Simple sturdy triangular wooden braces, a few brass rivets and brass pulley at right tip. Small rounded cranberry-red operator cabin with amber window attached to upper mast. Candy-cane red-and-cream striped diagonal bracing or short decorative accent on mast, a narrow snow cap along jib. From right tip one taut clean vertical dark rope descends to one chunky rounded gold/brass lifting hook, clearly visible on transparent space to right of mast. Hook ends around height of lower half of mast, stays above mounting foot. Short left arm has a simple red counterweight box. This is a compact toy workshop machine, not heavy realistic industrial machinery; large simple shapes with minimal decorations that remain legible at small game size. No gifts on hook so gameplay blocks can be drawn separately. All components visibly connected sensibly, no loose floating components. Full crane including rope, hook and mounting foot completely inside canvas with at least 8% transparent padding on all sides. Soft upper-left light, subtle warm gold shine, match reference materials. Genuinely transparent alpha background, no backdrop, no cast shadow or floor, no clouds, no scenery, no characters, no text or logos, no watermark. Single asset only.

### Transparency cleanup

Use case: background-extraction. Edit target: the supplied North Pole workshop crane sprite. Preserve this exact crane design, pose, framing, colors, snow, materials, cabin, bow, counterweight, rope and brass hook. Remove ONLY all background haze, dark/gray gradient, colored glow halos and ambient light outside the physical crane. Deliver a clean cutout on genuinely transparent alpha. All empty space around and inside crane structure must have zero alpha. Solid wood, snow and metal parts must be opaque; preserve smooth antialiased edges. No cast shadows, no backdrop, no floor, no glow outside the silhouette, no new objects or text. Keep full crane uncropped.

## Original tower artwork audit

Reviewed src/client/shared/tower-art.tsx, src/client/host/tower.tsx and src/client/player/tower.tsx.

| Original element | Christmas status |
| --- | --- |
| Four office tiles, lobby, shop | Six source tiles created |
| Rooftop crane | crane.png created: snowy green timber hoist, red cabin, brass fittings and candy-cane accent |
| Monster egg | bell.png created; target-slot outline and glow can be adapted in code |
| Monster | yeti.png created as one pose; original SVG has animated head, jaw, arm and legs |
| Skyline, sky gradient, clouds, stars, street/sidewalk | background.png supplies snowy scenery; existing layers must be replaced/adapted during integration, including phone framing and original height-based sky changes |
| Small foreground trees beside each tower | Separate snowy evergreen sprite not yet created; background trees do not replace these automatically |
| Rooftop team flag on results scene | Festive flag/pole art not yet created; preserve team-color identity |
| Landing dust puff | Snow-puff version not yet created; can adapt existing SVG/CSS effect |
| Completed-floor sparkles | Can reuse existing SVG or adapt to gold sparkles/snowflakes; no separate seasonal sprite created |
| Falling blocks and smash debris | Reuse building tiles; no additional source art needed |
| Floor ledges, height scale, block meter, drop-zone markers, podium and awards | Existing SVG/CSS/text/emoji UI, no separate image assets required; seasonal styling can be handled in integration |

Team-colored variants, host/phone exports and the temporary theme selector remain integration work. Existing normal-theme assets are preserved.

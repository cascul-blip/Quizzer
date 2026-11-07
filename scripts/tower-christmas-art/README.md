# North Pole Workshop tower graphics

Selected Christmas art direction: option 2, North Pole Workshop.

## Files

- office-1.png: warmly lit arched window
- office-2.png: dark window
- office-3.png: warm window with holly and bow
- office-4.png: half-lit window with stocking
- lobby.png: wreath and double entrance doors
- shop.png: toyshop window with striped awning
- yeti.png: transparent white yeti wearing a red knitted scarf
- bell.png: transparent golden jingle bell with red bow, replacing the egg
- background.png: snowy forest with aurora and open central play area
- crane.png: transparent snowy elf-workshop hoist with brass fittings and candy-cane accent

Crane generation prompts and the remaining-art inventory are in [crane-and-artwork-audit.md](crane-and-artwork-audit.md).

The artwork is integrated into the host and phone tower screens. Choose **Theme → North Pole Workshop** or **Normal** in the Tallest Tower lobby. New lobbies default to North Pole; the host's selection is preserved when playing again. To change the application default, edit `DEFAULT_TOWER_THEME` in `src/shared/tower-theme.ts`.

Run `python3 scripts/tower-christmas-art.py` to rebuild the optimized WebPs and team-tint overlays in `src/client/shared/tower/christmas/` (Pillow and numpy required). The six building tiles and crane recolor their painted structural trim; snow, brass, window glass and decorations keep their source colors. Both full-size and phone copies are exported. Normal artwork is separate and preserved.

The Christmas scene deliberately omits the small foreground trees. The existing flags are replaced with team-colored snowflake pennants on candy-striped poles. Landing effects use snow puffs; completed floors show gold sparkles and snowflakes. The bell uses a golden target outline and glow. The yeti uses a whole-body stomp and smash timed to the existing attack/debris animation. These effects are code-native SVG/CSS, so they don't need more generated image files.

For interactive artwork review, run `bun scripts/tower-preview/serve.ts` and visit `http://127.0.0.1:8098/` (projector) or `/phone`. The preview offers both themes, all six colors, game phases, tall-tower queries (`?height=30`), and an attack button.

Generation prompts for the yeti, bell and background are recorded in [extra-assets-prompts.md](extra-assets-prompts.md); the crane prompts and original pre-integration inventory are in [crane-and-artwork-audit.md](crane-and-artwork-audit.md).

Generated using the built-in image_gen tool. Reference: output/tower-christmas-concepts/2-north-pole-workshop.png. Variants use office-1.png as the edit target to preserve the border and material style.

## Generation prompts

### office-1

Use case: stylized-concept. Asset type: ONE square modular building-facade texture tile for Tallest Tower Christmas theme. Input image is STYLE REFERENCE ONLY: the approved North Pole Workshop concept; use the green tower building style. Generate a SINGLE square tile, not a whole building or concept board. Soft tactile 3D clay/painted wood casual game art, strictly orthographic front elevation, absolutely no visible building sides or perspective. The square facade FILLS THE ENTIRE SQUARE CANVAS edge to edge, with NO OUTSIDE BACKGROUND, no margins, no ground or drop shadow. Cream horizontal wooden siding, pine green vertical wooden posts along left/right edges, pine green horizontal beam across top and bottom, small round brass rivets. All four structural edges align exactly with canvas edges so identical tiles can stack into three-column multi-floor towers. A narrow snow cap lies inside the upper 8% of the square, flush with top edge; no pitched roof. ONE large centered round-arched window with honey-colored wooden frame and four panes glowing warm golden amber, central mullions clean and simple. Window occupies central 60% width and 65% height; small wooden sill. Soft upper-left light, restrained material texture, broad readable forms at 64px size. No text, logos, watermark, decorations outside square, doors, characters, trees or second tile. Output square.

### office-2

Use case: precise-object-edit. Edit this SINGLE square North Pole Workshop facade tile into a matching variant. Keep exactly the same square crop, edge-to-edge dimensions, green structural posts/beams, snow cap silhouette, brass bolts, cream horizontal wood siding, straight-on orthographic view, soft clay/painted-wood texture, light direction, and overall composition. This must stack seamlessly in the same game grid. No outside background, margins, perspective, ground, text, logos or extra tiles. Change only the following central facade details: Keep the identical arched four-pane window and frame, but all glass panes are dark deep navy blue with subtle cool blue reflection; lights off. Everything else unchanged.

### office-3

Use case: precise-object-edit. Edit this SINGLE square North Pole Workshop facade tile into a matching variant. Keep exactly the same square crop, edge-to-edge dimensions, green structural posts/beams, snow cap silhouette, brass bolts, cream horizontal wood siding, straight-on orthographic view, soft clay/painted-wood texture, light direction, and overall composition. This must stack seamlessly in the same game grid. No outside background, margins, perspective, ground, text, logos or extra tiles. Change only the following central facade details: Keep the identical arched four-pane window glowing warm gold. Add a small simple green holly garland across the window sill with three red berries and a little central red bow. Decoration stays entirely within the square and doesn't obscure the panes.

### office-4

Use case: precise-object-edit. Edit this SINGLE square North Pole Workshop facade tile into a matching variant. Keep exactly the same square crop, edge-to-edge dimensions, green structural posts/beams, snow cap silhouette, brass bolts, cream horizontal wood siding, straight-on orthographic view, soft clay/painted-wood texture, light direction, and overall composition. This must stack seamlessly in the same game grid. No outside background, margins, perspective, ground, text, logos or extra tiles. Change only the following central facade details: Keep the identical arched four-pane window and frame. The two LEFT panes glow warm golden amber; the two RIGHT panes are dark navy blue. Add a small red knitted Christmas stocking hanging from the lower right corner of the window frame, contained within the tile.

### lobby

Use case: precise-object-edit. Edit this SINGLE square North Pole Workshop facade tile into a matching variant. Keep exactly the same square crop, edge-to-edge dimensions, green structural posts/beams, snow cap silhouette, brass bolts, cream horizontal wood siding, straight-on orthographic view, soft clay/painted-wood texture, light direction, and overall composition. This must stack seamlessly in the same game grid. No outside background, margins, perspective, ground, text, logos or extra tiles. Change only the following central facade details: Replace the central window and sill with one large centered round-arched GREEN WOODEN DOUBLE ENTRANCE DOOR, 65% of tile width and 76% tile height, amber glazed top panels, two round brass door knobs, cream/brown wooden arch frame. A little green wreath with a red bow centered above the doors inside the arch. Door threshold ends against existing bottom green beam. Preserve the identical outside structural border, snow and rivets.

### shop

Use case: precise-object-edit. Edit this SINGLE square North Pole Workshop facade tile into a matching variant. Keep exactly the same square crop, edge-to-edge dimensions, green structural posts/beams, snow cap silhouette, brass bolts, cream horizontal wood siding, straight-on orthographic view, soft clay/painted-wood texture, light direction, and overall composition. This must stack seamlessly in the same game grid. No outside background, margins, perspective, ground, text, logos or extra tiles. Change only the following central facade details: Replace central arched window with a wide rectangular elf toyshop display window, wooden golden frame and warm golden light, with just three large simple wooden toy silhouettes inside (rocking horse, toy train, wrapped gift). Small red-and-cream striped fabric canopy above the window, contained inside the structural border. Preserve identical border, snow cap and rivets; no lettering or signs.

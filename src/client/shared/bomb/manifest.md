# Bomb Squad art manifest

Style A (gritty disposal room). Made by `scripts/bomb-art.py` from the sources in `scripts/bomb-art/` (prompts in the script). Phone copies (`phone/`) are half size unless noted. All coordinates are in the file's own pixels, top-left origin; % is of that file's width/height. The flash and the screen shake are not images (draw them in code); the clock digits are not painted (draw them in code).

## Files

| File | Size | Phone copy | Alpha | Blend | Layer | Use |
|---|---|---|---|---|---|---|
| `bench.webp` | 1344×768 | – | no (opaque) | normal | 0 (back) | the room, empty bench. Phone: no |
| `bench-scorched.webp` | 1344×768 | – | no (opaque) | normal | 0 (back) | swap in for bench after the explosion (same framing) |
| `casing.webp` | 760×486 | 380×243 | yes | normal | 1 | the bomb; blank clock; module bay; contact shadow baked in. Phone copy (Race) |
| `module-wire.webp` | 360×372 | 180×186 | yes | normal | 2 | panel in the bay; wires drawn on top. Phone copy |
| `module-keypad.webp` | 360×372 | 180×186 | yes | normal | 2 | panel in the bay. Phone copy |
| `module-picture.webp` | 360×372 | – | yes | normal | 2 | panel in the bay; the question picture goes in its window. No phone copy |
| `wire / wire-cut.webp` | 81×640, 81×640 | 40×320, 40×320 | yes | normal | 3 | one wire, tinted per colour (see Tinting). Phone copies |
| `wire-tint / wire-cut-tint.webp` | 81×640, 81×640 | 40×320, 40×320 | mask | mask | 3 (under the wire) | white where the insulation is |
| `light-off / light-green / light-red.webp` | 96×96, 96×96, 96×96 | 48×48, 48×48, 48×48 | yes | normal | 3 | LEDs over the panel sockets. Phone copies |
| `sparks.webp` | 512×512 | 256×256 | yes (glow) | normal or screen/lighter | 4 | on a wrong or right cut, at the wire. Phone copy |
| `explosion-smoke.webp` | 1100×923 | – | yes | normal | 5 | behind the fireball, grows and darkens, lingers |
| `explosion-fireball.webp` | 1024×1024 | – | yes (glow) | screen/lighter (normal also OK) | 6 | scale up from the bomb's centre, fade out |
| `explosion-debris.webp` | 1344×768 | – | yes | normal | 7 | full-frame ring of pieces around the centre; scale outward from the centre |
| `confetti.webp` | 1344×768 | 672×384 | yes | normal | 8 (front) | Defused; full frame; drift down. Phone copy |
| `phone/cutters.webp` | – | 320×263 | yes | normal | phone UI | phone only, the Cut button icon |

Layer order, back to front: bench → casing → module panels → wires and LEDs → sparks → (explosion) smoke → fireball → debris → code-drawn white flash → (defused) confetti. During the explosion, swap bench for bench-scorched under the flash and hide the casing and panels.

## Placing the casing on the bench

Suggested: draw `casing.webp` 740 px wide on the 1344×768 bench (scale 0.974), with its base line (y = 445 px = 91.6% of the casing) at bench point (672, 640) px (50.0%, 83.3%), horizontally centred. The shadow under the base is part of the image. That puts the casing's centre, and the explosion centre, near bench (672, 423).

## casing.webp (760×486)

* **Clock face** (blank glass; draw the red digits inside): x 215–423, y 90–185 px (208×95); left 28.3%, top 18.5%, width 27.4%, height 19.5%
* **Module bay** (put the module panels inside, in a row, scaled to the bay height): x 214–698, y 239–365 px (484×126); left 28.2%, top 49.2%, width 63.7%, height 25.9%
* **Base line** (sits on the bench): y = 445 px (91.6%)

The bay is 484×126 px: 3 panels side by side at the bay's height fit with gaps (122 px wide each). For 4 panels, scale them to fit the bay width. For more modules than fit (Together with several squads), the spec doesn't say; suggested: a second row (scale panels down) or one casing per squad.

## Module panels (360×372 each, same canvas, so they swap)

### module-wire.webp
* **LED sockets** (centres, left to right; ring 28 px across; draw `light-*.webp` about 34 px wide centred on each): (82, 38) = (22.8%, 10.2%), (147, 38) = (40.8%, 10.2%), (210, 38) = (58.3%, 10.2%), (270, 38) = (75.0%, 10.2%)
  Use the first N sockets for a module with N wires (2–4); leave the rest off.
* **Wire terminals, top row**: (82, 140) = (22.8%, 37.6%), (143, 140) = (39.7%, 37.6%), (206, 140) = (57.2%, 37.6%), (270, 140) = (75.0%, 37.6%)
* **Wire terminals, bottom row**: (83, 244) = (23.1%, 65.6%), (143, 244) = (39.7%, 65.6%), (207, 244) = (57.5%, 65.6%), (270, 244) = (75.0%, 65.6%)
  Wire i runs from top terminal i to bottom terminal i. With 2 or 3 wires, use terminals 1–2 or 1–3, or the middle ones; the unused brass posts stay empty.

### module-keypad.webp
* **LED sockets** (centres, left to right; ring 29 px across; draw `light-*.webp` about 35 px wide centred on each): (82, 38) = (22.8%, 10.2%), (145, 38) = (40.3%, 10.2%), (208, 38) = (57.8%, 10.2%), (271, 38) = (75.3%, 10.2%)
  Use the first N sockets for a module with N wires (2–4); leave the rest off.
* **Display glass** (blank; the typed answer can be drawn here): x 83–275, y 99–162 px (192×63); left 23.1%, top 26.6%, width 53.3%, height 16.9%
* Keys are lettered 1 2 3 4 / 5 6 7 8 / * 9 0 # (decorative; typing happens on the phones).

### module-picture.webp
* **LED sockets** (centres, left to right; ring 29 px across; draw `light-*.webp` about 35 px wide centred on each): (80, 38) = (22.2%, 10.2%), (143, 38) = (39.7%, 10.2%), (206, 38) = (57.2%, 10.2%), (270, 38) = (75.0%, 10.2%)
  Use the first N sockets for a module with N wires (2–4); leave the rest off.
* **Picture window** (draw the question picture inside, clipped to it): x 68–290, y 89–307 px (222×218); left 18.9%, top 23.9%, width 61.7%, height 58.6%

## Wires (81×640; wire and wire-cut share the canvas)

* Ring-lug hole centres: top y = 28 px (4.4%), bottom y = 610 px (95.3%), both at x = 40 px (50%).
* To hang a wire between two terminals: scale it so the lug-to-lug distance equals the terminal distance, and place the top lug centre on the top terminal. Swap `wire` for `wire-cut` on a cut; nothing moves.
* **Tinting**: fill `wire-tint.webp` (white = insulation) with the wire colour, then draw `wire.webp` on top at the same box. SVG: `<mask><image href=tint/></mask><rect fill=COLOUR mask=…/><image href=wire/>`; CSS: `background: COLOUR; mask-image: url(wire-tint.webp); mask-size: 100% 100%` under an `<img src=wire.webp>`. The copper ends and brass lugs stay their own colour. Same for `wire-cut` with `wire-cut-tint`.

## Effects

* `sparks.webp` 512×512: centre of the burst = image centre. Glow alpha (brightness), so normal blending looks right; `mix-blend-mode: screen` (canvas `lighter`) is a touch brighter.
* `explosion-fireball.webp` 1024×1024: centre = image centre. Glow alpha; best with screen/lighter. Suggested: scale 0.2 → 1.4 over ~0.6 s from the casing centre, fade out by ~1.2 s.
* `explosion-smoke.webp` 1100×923: normal alpha (dark smoke must darken, so not additive). Centre = image centre; start with the fireball, grow slowly, fade over ~3 s.
* `explosion-debris.webp` 1344×768: full frame, normal alpha; the pieces ring the image centre. Scale it up from ~0.3 to ~1.3 around the casing centre while fading, and/or rotate slightly.
* `confetti.webp` 1344×768: full frame, normal alpha. Loop two copies falling at different speeds, or draw in code.

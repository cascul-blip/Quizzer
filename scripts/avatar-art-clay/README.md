# Toybox Clay Christmas avatars

The active Christmas catalogue has **20 characters and 20 accessories**, plus
`none`. Existing Christmas IDs are preserved, and five new IDs are appended to
each catalogue in `src/shared/avatars.ts`.

- `sources/*.webp`: individual transparent artwork generated with the built-in
  image_gen tool, using the user-selected `style-reference.png`. Stored as
  WebP (quality 90, lossless-quality alpha) to keep the repo small.
- `manifest.json`: names, generation prompts, source eye landmarks, and optional
  layout overrides. Source WebPs are named by catalogue ID.
- `../../src/client/shared/avatar/*.webp`: packaged 512 × 512 runtime layers.

To rebuild with Pillow:

```sh
python3 scripts/avatar-clay-art.py
# After revising selected sources:
python3 scripts/avatar-clay-art.py --only bobble xmasscarf earmuffs
```

This packages the existing transparent art, aligns faces by their measured eye
positions, seats accessories on the shared canvas, rebuilds affected phone atlases
in catalogue order, and writes character, accessory, and combination contact
sheets into `output/christmas-clay/`. It does not regenerate images or rebuild
unrelated game artwork. WebPs are committed; the normal app build needs no image
generation or Python dependency.

Artwork direction: matte sculpted polymer clay, chunky rounded forms, soft
frontal lighting, warm festive colors, friendly open eyes, head-only characters,
and independent accessories with transparent openings. Exact initial prompts
are recorded per asset in the manifest. The nutcracker was revised to remove
an unwanted built-in crown so it can wear the separate accessories.

The old felt-style JPEG sources in `../avatar-art-xmas/` are legacy references;
do not run the original magenta-keying pipeline over this transparent clay art.

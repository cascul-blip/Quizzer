# Legacy felt Christmas avatar sources

The active Christmas collection is now Toybox Clay: 20 characters and 20
accessories. See `../avatar-art-clay/README.md` and `../avatar-clay-art.py` for
the transparent sources and current build pipeline. The files below are
retained only as legacy references.


Source stickers (1024x1024, on flat magenta) for the Christmas characters and accessories:
15 of each, listed at the end of `AVATARS` and `ACCESSORIES` in `src/shared/avatars.ts`.

They are kept apart from `scripts/avatar-art/` because they were not cut out by
`scripts/avatar-art.py`. That script's `chroma()` key leaves a pink fringe on these fuzzy
felt edges. The committed WebPs in `src/client/shared/avatar/` came from a stronger key
(with scipy) and custom seating for the antler headband, wreath crown (arched over the head
like `seat_headphones`) and scarf (under the chin). Commit the WebPs as they are. Don't
re-cut these sources with the stock script.

If an id is added, removed or reordered, rebuild the phone sheets with
`python3 scripts/phone-art.py`.

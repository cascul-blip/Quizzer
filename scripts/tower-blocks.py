#!/usr/bin/env python3
"""Turns the generated facade tiles in scripts/tower-blocks/ into the Tallest Tower
block art in src/client/shared/tower/. Needs Pillow and numpy; the WebPs are committed,
so builds don't.

    python3 scripts/tower-blocks.py [preview.png]

The sources have a neutral grey wall. Grey pixels become translucent black or white
shading and coloured pixels (glass, lit windows, awning) stay opaque, so one tile drawn
over a team-coloured square takes that team's colour. With a path argument, also writes
a sheet of every tile over every team colour for checking.

The sources came from FLUX.1-schnell (genimg, 1024x1024, 4 steps, seed 11):
  "flat orthographic front view of one square building facade tile filling the whole
   frame edge to edge, plain light grey concrete wall, <SUBJECT>, bold cartoon game
   asset, clean flat shapes, thick outlines, no perspective, no sky, no ground, no text"
with <SUBJECT>:
  office-1  a two by two grid of four large square windows, the top left and bottom right
            windows glow warm yellow, the other two windows are dark navy blue glass
  office-2  ... all four windows are dark navy blue glass
  office-3  ... all four windows glow warm yellow
  office-4  ... the left two windows glow warm yellow, the right two windows are dark navy
            blue glass
  shop      light grey stone blocks with thick grey outlines, a small shop front with a red
            and white striped awning above one wide display window with grey frame and
            light blue glass
  lobby     light grey stone blocks with thick grey outlines, a building entrance with
            light blue glass double doors with thick grey frame in the center, a blank dark
            grey sign band above the doors
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/tower-blocks"
OUT = ROOT / "src/client/shared/tower"
SIZE = 256

# Fraction of the source height to keep: every tile has a strip of pavement along the
# bottom. The crop is a square of that size, top-aligned and centred.
KEEP = {"office-1": 0.925, "office-2": 0.925, "office-3": 0.93, "office-4": 0.925, "shop": 0.92, "lobby": 0.83}

# Saturation range over which a pixel goes from wall (tinted) to its own colour.
SAT_LO, SAT_HI = 0.15, 0.3
# How strongly wall pixels brighter than the wall itself show up as white.
HIGHLIGHT = 0.7

TEAM_COLORS = ["#e21b3c", "#1368ce", "#c98a00", "#26890c", "#864cbf", "#e8710a"]


def crop(img: Image.Image, keep: float) -> Image.Image:
    w, h = img.size
    side = round(h * keep)
    left = (w - side) // 2
    return img.crop((left, 0, left + side, side)).resize((SIZE, SIZE), Image.LANCZOS)


def overlay(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"), dtype=np.float64) / 255
    hi, lo = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(hi > 0, (hi - lo) / np.maximum(hi, 1e-6), 0)
    t = np.clip((sat - SAT_LO) / (SAT_HI - SAT_LO), 0, 1)
    wall = 1 - t * t * (3 - 2 * t)

    lum = rgb @ np.array([0.299, 0.587, 0.114])
    base = np.median(lum[wall > 0.9])
    darker = lum < base
    shade_alpha = np.where(darker, (base - lum) / base, HIGHLIGHT * (lum - base) / max(1 - base, 1e-6))
    shade_rgb = np.where(darker, 0.0, 1.0)

    wall_alpha = wall * shade_alpha
    alpha = wall_alpha + (1 - wall)
    premult = wall_alpha[..., None] * shade_rgb[..., None] + (1 - wall)[..., None] * rgb
    out = np.dstack([premult / np.maximum(alpha, 1e-6)[..., None], alpha])
    return Image.fromarray(np.round(np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = []
    for name, keep in KEEP.items():
        tile = overlay(crop(Image.open(SRC / f"{name}.png"), keep))
        dest = OUT / f"{name}.webp"
        tile.save(dest, "WEBP", quality=85, method=6)
        print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.1f} KB")
        tiles.append(tile)

    if len(sys.argv) > 1:
        sheet = Image.new("RGB", (SIZE * len(tiles), SIZE * len(TEAM_COLORS)))
        for row, color in enumerate(TEAM_COLORS):
            for col, tile in enumerate(tiles):
                cell = Image.new("RGBA", (SIZE, SIZE), color)
                cell.alpha_composite(tile)
                sheet.paste(cell.convert("RGB"), (col * SIZE, row * SIZE))
        sheet.save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

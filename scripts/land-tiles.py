#!/usr/bin/env python3
"""Turns the generated textures in scripts/land-tiles/ into the Land Grab tile art in
src/client/shared/land/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/land-tiles.py [preview.png]

Each tile is a hex-shaped crop (the board clips it to the exact hexagon). Grass tiles keep
their colours. The claimed tile comes from a neutral grey texture: it becomes translucent
black and white shading, so drawn over a team-coloured hexagon it takes that team's colour.
With a path argument, also writes a sheet of the tiles, the claimed one over every team
colour, for checking.

The sources came from FLUX.1-schnell (genimg, 1024x1024, 4 steps, seed 11):
  grass    "flat top-down orthographic view of a lush green grass lawn texture filling the
            whole frame edge to edge, small tufts of grass and a few tiny daisies and clover,
            bold cartoon game asset, hand painted, clean flat shapes, even lighting, no
            shadows, no horizon, no text"
  claimed  "flat top-down orthographic view of light grey cobblestone paving filling the
            whole frame edge to edge, large rounded grey stones with thick dark grey
            outlines, uniform neutral grey, bold cartoon game asset, hand painted, clean
            flat shapes, even lighting, no colour, no grass, no text"
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/land-tiles"
OUT = ROOT / "src/client/shared/land"
# A pointy-top hexagon is sqrt(3)/2 as wide as it is tall.
H = 256
W = round(H * 3**0.5 / 2)

# Top-left corner and height of each crop in its 1024x1024 source.
GRASS_CROPS = [(120, 90, 330), (560, 140, 330), (330, 560, 330)]
CLAIMED_CROP = (300, 250, 400)
# How strongly pixels lighter than the stones themselves show up as white.
HIGHLIGHT = 0.6
# The grout between the stones, at full strength, would hide most of the team colour.
SHADE = 0.75

TEAM_COLORS = ["#e21b3c", "#1368ce", "#c98a00", "#26890c", "#864cbf", "#e8710a"]


def crop(img: Image.Image, box: tuple[int, int, int]) -> Image.Image:
    left, top, height = box
    width = round(height * W / H)
    return img.crop((left, top, left + width, top + height)).resize((W, H), Image.LANCZOS)


def shading(img: Image.Image) -> Image.Image:
    lum = np.asarray(img.convert("L"), dtype=np.float64) / 255
    base = np.median(lum)
    darker = lum < base
    alpha = np.where(darker, SHADE * (base - lum) / base, HIGHLIGHT * (lum - base) / max(1 - base, 1e-6))
    value = np.where(darker, 0.0, 1.0)
    out = np.dstack([value, value, value, alpha])
    return Image.fromarray(np.round(np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")


def save(tile: Image.Image, name: str) -> None:
    dest = OUT / f"{name}.webp"
    tile.save(dest, "WEBP", quality=82, method=6)
    print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.1f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    grass_src = Image.open(SRC / "grass.png").convert("RGB")
    grass = [crop(grass_src, box) for box in GRASS_CROPS]
    for i, tile in enumerate(grass):
        save(tile, f"grass-{i + 1}")
    claimed = shading(crop(Image.open(SRC / "claimed.png"), CLAIMED_CROP))
    save(claimed, "claimed")

    if len(sys.argv) > 1:
        cells = [t.convert("RGBA") for t in grass]
        for color in TEAM_COLORS:
            cell = Image.new("RGBA", (W, H), color)
            cell.alpha_composite(claimed)
            cells.append(cell)
        sheet = Image.new("RGB", (W * len(cells), H))
        for i, cell in enumerate(cells):
            sheet.paste(cell.convert("RGB"), (i * W, 0))
        sheet.save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Turns the generated textures in scripts/fight-ground/ into the Tower Fight ground art in
src/client/shared/fight/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/fight-ground.py [preview.png]

The terrain changes shape as craters are blown into it, so the ground is not one picture:
Terrain in fight-art.tsx fills it with two repeating patterns. This writes:
  ground-soil.webp   seamless tile of earth with pebbles, for the body of the ground
  ground-grass.webp  seamless tile of grass blades, for the band along the surface
With a path argument, also writes a 3x2 sheet of each tile to check the seams.

The sources came from FLUX.1-schnell (genimg, 1024x1024, 4 steps, seed 7):
  soil   "flat side view cross-section of brown earth soil texture filling the whole frame
          edge to edge, warm brown dirt with small embedded rounded pebbles and stones, a few
          tiny roots, bold cartoon game asset, hand painted, thick dark brown outlines on the
          stones, clean flat shapes, even lighting, no grass, no sky, no horizon, no text"
  grass  "flat front view of a dense lush green grass texture filling the whole frame edge
          to edge, many short pointed grass blades in several shades of green, bold cartoon
          game asset, hand painted, clean flat shapes, even lighting, no flowers, no sky, no
          dirt, no horizon, no text"
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/fight-ground"
OUT = ROOT / "src/client/shared/fight"

# (left, top, size) of the square crop in each source; the soil has a painted frame round it.
SOIL_CROP = (60, 60, 900)
GRASS_CROP = (0, 0, 1024)
SOIL_PX, GRASS_PX = 384, 256
# The soil comes out orange; this pulls it toward a darker, browner earth.
SOIL_DESATURATE = 0.4
SOIL_TINT = np.array([0.75, 0.62, 0.50])


def seamless(a: np.ndarray) -> np.ndarray:
    """Cross-fades the image with a copy shifted by half, which hides its edges, so it tiles."""
    h, w = a.shape[:2]
    shifted = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    y = 1 - np.abs(np.linspace(-1, 1, h))
    x = 1 - np.abs(np.linspace(-1, 1, w))
    # 1 in the middle (keep the original), 0 along the edges (use the shifted copy, whose middle is there).
    weight = np.clip(np.minimum.outer(y, x) * 6, 0, 1)[..., None]
    return a * weight + shifted * (1 - weight)


def tile(name: str, crop: tuple[int, int, int], px: int, tint: np.ndarray | None = None) -> Image.Image:
    left, top, size = crop
    img = Image.open(SRC / f"{name}.png").convert("RGB").crop((left, top, left + size, top + size))
    a = np.asarray(img.resize((px, px), Image.LANCZOS), dtype=np.float64) / 255
    if tint is not None:
        grey = a.mean(axis=2, keepdims=True)
        a = (a + (grey - a) * SOIL_DESATURATE) * tint
    return Image.fromarray(np.round(np.clip(seamless(a), 0, 1) * 255).astype(np.uint8), "RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = {"ground-soil": tile("soil", SOIL_CROP, SOIL_PX, SOIL_TINT), "ground-grass": tile("grass", GRASS_CROP, GRASS_PX)}
    for name, im in tiles.items():
        dest = OUT / f"{name}.webp"
        im.save(dest, "WEBP", quality=85, method=6)
        print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.1f} KB")

    if len(sys.argv) > 1:
        sheets = []
        for im in tiles.values():
            sheet = Image.new("RGB", (im.width * 3, im.height * 2))
            for i in range(6):
                sheet.paste(im, (im.width * (i % 3), im.height * (i // 3)))
            sheets.append(sheet.resize((1152, 768 * sheet.height // sheet.width * 3 // 2)))
        out = Image.new("RGB", (1152, sum(s.height for s in sheets)))
        y = 0
        for s in sheets:
            out.paste(s, (0, y))
            y += s.height
        out.save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

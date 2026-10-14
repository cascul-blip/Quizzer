#!/usr/bin/env python3
"""Turns the generated saloon pictures in scripts/cup-saloon/ into the Cup of Death art in
src/client/shared/cup/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/cup-saloon.py [preview.png]

This writes:
  saloon.webp  the room behind the table, with the sign over the door blanked
  table.webp   the round table, background and floor shadow removed, cropped
With a path argument, also writes the table over the room roughly where the scene puts it.
The script prints where the tabletop sits in table.webp, which Table in cup-art.tsx uses to
lay the picture over the table ellipse.

Both came from FLUX.1-schnell (genimg, 1344x768, 4 steps).
saloon.png, seed 4:
  "flat 2D cartoon illustration, view from high up looking steeply down into an empty wild
   west saloon, the back wall only in the top quarter of the picture with a long wooden bar
   counter, shelves of colourful bottles, swinging batwing doors and bright desert light,
   hanging oil lamps with warm glow, a huge empty wooden plank floor filling most of the
   picture, the whole middle of the floor is completely empty, no tables, no chairs, no
   people, thick dark outlines, clean flat shapes, warm brown and amber colours, no text"
table.png, seed 2:
  "a round wooden saloon table viewed from a high three quarter angle, a thick round dark
   walnut tabletop with a visible thick edge all around, a heavy carved wooden pedestal leg
   with four feet underneath, the empty tabletop shows wood planks and grain, the whole table
   small and centred with plenty of white space around it, flat 2D cartoon game asset, thick
   dark outlines, clean flat shapes, rich brown colours, isolated on a plain white
   background, no objects on the table, no text"
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/cup-saloon"
OUT = ROOT / "src/client/shared/cup"

# The tabletop's top surface in table.png, measured on its dark outline: centre and radii, source pixels.
TOP_CX, TOP_CY, TOP_RX, TOP_RY = 665, 218.5, 514, 182.5
TABLE_W = 900
# The lettering on the sign over the door in saloon.png: left, top, right, bottom, source pixels.
SIGN = (616, 182, 738, 210)
WARM = np.array([1.1, 1.0, 0.86])


def save(name: str, im: Image.Image, quality: int) -> None:
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=quality, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.1f} KB")


def cut_table() -> tuple[Image.Image, tuple[float, float, float, float]]:
    """table.png on a transparent background, cropped, and the tabletop ellipse as fractions of it."""
    rgb = np.asarray(Image.open(SRC / "table.png").convert("RGB")).astype(np.float64) / 255
    hi, lo = rgb.max(axis=2), rgb.min(axis=2)
    # The white background and the grey shadow under the pedestal: light and colourless.
    pale = (lo > 0.55) & (hi - lo < 0.06)
    # The walnut comes out a little cold next to the amber room: warm it up.
    rgb = np.clip(rgb * WARM, 0, 1)
    # Flood the pale area in from the corners; pale bits inside the table (highlights) stay.
    mask = Image.fromarray((pale * 255).astype(np.uint8)).copy()  # floodfill skips read-only array views
    for xy in [(0, 0), (mask.width - 1, 0), (0, mask.height - 1), (mask.width - 1, mask.height - 1)]:
        ImageDraw.floodfill(mask, xy, 128)
    bg = np.asarray(mask) == 128
    # Soften the cut by a pixel so the outline doesn't stair-step.
    soft = np.asarray(Image.fromarray((~bg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))) / 255
    alpha = np.where(bg, soft, 1)
    img = Image.fromarray(np.round(np.dstack([rgb, alpha]) * 255).astype(np.uint8), "RGBA")
    box = Image.fromarray((~bg * 255).astype(np.uint8)).getbbox()
    assert box
    img = img.crop(box)
    w, h = img.size
    top = ((TOP_CX - box[0]) / w, (TOP_CY - box[1]) / h, TOP_RX / w, TOP_RY / h)
    return img.resize((TABLE_W, round(h * TABLE_W / w)), Image.LANCZOS), top


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    room = Image.open(SRC / "saloon.png").convert("RGB")
    # The sign over the door came out with made-up letters: paint the panel plain (the scene writes on it).
    panel = np.asarray(room.crop(SIGN))
    ImageDraw.Draw(room).rectangle(SIGN, fill=tuple(int(c) for c in np.median(panel.reshape(-1, 3), axis=0)))
    save("saloon", room, 82)
    table, (cx, cy, rx, ry) = cut_table()
    save("table", table, 88)
    print(f"aspect (width / height) = {table.width / table.height:.4f}")
    print(f"tabletop centre = ({cx:.4f}, {cy:.4f}), radii = ({rx:.4f}, {ry:.4f}) of the picture")

    if len(sys.argv) > 1:
        sheet = room.convert("RGBA")
        tw = round(sheet.width * 0.5)
        t = table.resize((tw, round(table.height * tw / table.width)), Image.LANCZOS)
        sheet.alpha_composite(t, ((sheet.width - t.width) // 2, round(sheet.height * 0.62 - cy * t.height)))
        sheet.convert("RGB").save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Turns the generated castle towers in scripts/fight-castle/ into the Tower Fight art in
src/client/shared/fight/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/fight-castle.py [preview.png]

tower-0.png is the intact tower and tower-1…4.png are its damage stages. They have magenta
cloth (banner, flag, crest) on a white background. This writes:
  castle-0…4.webp    each stage, background removed, with the cloth turned into
                     translucent dark shading
  castle-cloth.webp  white where the cloth is
The client fills the cloth mask with the team colour and draws the tower over it, so the
stone is the same for both teams and only the cloth takes the team colour. With a path
argument, also writes every stage in each team colour for checking. The script prints the
tower's proportions, which CastleTower in fight-art.tsx uses to place it.

tower-0.png came from FLUX.1-schnell (genimg, 768x1344, 4 steps, seed 4):
  "a single tall narrow medieval stone castle tower, straight front view, grey stone
   bricks, crenellated battlements on top, arched wooden door at the base, arrow slit
   windows, a long cloth banner hanging down the wall, a pennant flag on a pole on the
   roof, the banner and the flag are bright magenta, bold cartoon game asset, thick dark
   outlines, clean flat shapes, plain white background, whole tower visible, no ground,
   no text"

The damage stages were made from it, each adding to the one before: rough cracks, holes and
broken-off battlements were painted onto the tower, the same model redrew that sketch
image-to-image (denoise 0.5, 8 steps, a prompt describing the damage), and only the painted
areas of the result were pasted back onto tower-0.png. Outside the damage every stage is
pixel-identical, so the tower doesn't shift as it takes hits.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/fight-castle"
STAGES = 5
OUT = ROOT / "src/client/shared/fight"
HEIGHT = 640

# The source has a black shadow on the ground. Everything below BASE_Y goes, and from
# SHADOW_Y down so does everything outside the tower's foot (FOOT_X0…FOOT_X1). Source pixels.
BASE_Y, SHADOW_Y, FOOT_X0, FOOT_X1 = 1306, 1272, 122, 642

TEAM_COLORS = ["#e21b3c", "#1368ce"]
KEY = (0, 255, 0)


def load(stage: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """One stage as (rgb 0…1, brightness, solid mask, cloth amount 0…1)."""
    img = Image.open(SRC / f"tower-{stage}.png").convert("RGB")
    for xy in [(0, 0), (img.width - 1, 0), (0, img.height - 1), (img.width - 1, img.height - 1)]:
        ImageDraw.floodfill(img, xy, KEY, thresh=40)
    px = np.asarray(img)
    solid = ~(px == KEY).all(axis=2)
    ys, xs = np.mgrid[: img.height, : img.width]
    solid &= (ys < BASE_Y) & ((ys < SHADOW_Y) | ((xs >= FOOT_X0) & (xs <= FOOT_X1)))

    rgb = px.astype(np.float64) / 255
    hi, lo = rgb.max(axis=2), rgb.min(axis=2)
    sat = (hi - lo) / np.maximum(hi, 1e-6)
    # Magenta: red and blue both well above green.
    cloth = np.clip((np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]) / 0.25, 0, 1) * np.clip((sat - 0.3) / 0.3, 0, 1)
    return rgb, hi, solid, cloth * solid


def to_image(a: np.ndarray) -> Image.Image:
    return Image.fromarray(np.round(np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    def save(name: str, im: Image.Image) -> None:
        dest = OUT / f"{name}.webp"
        im.save(dest, "WEBP", quality=88, method=6)
        print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.1f} KB")

    # The intact tower sets the crop, the cloth brightness and the cloth mask for every stage.
    rgb, hi, solid, cloth = load(0)
    box = Image.fromarray((solid * 255).astype(np.uint8)).getbbox()
    assert box
    size = (round((box[2] - box[0]) * HEIGHT / (box[3] - box[1])), HEIGHT)
    bright = np.percentile(hi[cloth > 0.8], 90)
    mask_img = to_image(np.dstack([np.ones_like(rgb), cloth])).crop(box).resize(size, Image.LANCZOS)
    save("castle-cloth", mask_img)

    towers = []
    for stage in range(STAGES):
        rgb, hi, solid, cloth = load(stage)
        shade = 1 - np.clip(hi / bright, 0, 1)
        alpha = ((1 - cloth) + cloth * shade) * solid
        premult = (1 - cloth)[..., None] * rgb
        tower = to_image(np.dstack([premult / np.maximum(alpha, 1e-6)[..., None], alpha])).crop(box).resize(size, Image.LANCZOS)
        save(f"castle-{stage}", tower)
        towers.append(tower)

    # Where the battlements start: the first row that is mostly tower rather than flagpole.
    a = np.asarray(towers[0])[..., 3] > 128
    wall_top = int(np.argmax(a.sum(axis=1) > size[0] * 0.4))
    print(f"aspect (width / height) = {size[0] / size[1]:.3f}")
    print(f"battlements start at {wall_top / size[1]:.3f} of the height")

    if len(sys.argv) > 1:
        pad = 30
        sheet = Image.new("RGBA", ((size[0] + pad) * STAGES + pad, (HEIGHT + pad) * len(TEAM_COLORS) + pad), (95, 180, 255))
        for row, color in enumerate(TEAM_COLORS):
            for col, tower in enumerate(towers):
                cell = Image.new("RGBA", size, (0, 0, 0, 0))
                cell.paste(Image.new("RGBA", size, color), (0, 0), mask_img)
                cell.alpha_composite(tower)
                sheet.alpha_composite(cell if row == 0 else cell.transpose(Image.FLIP_LEFT_RIGHT), (pad + col * (size[0] + pad), pad + row * (HEIGHT + pad)))
        sheet.convert("RGB").save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

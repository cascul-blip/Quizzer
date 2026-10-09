#!/usr/bin/env python3
"""Turns the generated renders in scripts/robot-parts/ into the Robot Attack robot art in
src/client/shared/robot/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/robot-parts.py [preview.png]

Every source is a 3D render on a white background. This writes, background removed:
  body.webp     the robed machine priest; the whole square source frame is kept, so a point
                in the source is the same fraction of the WebP, and the bottom fades out
                (it is cut off at the knees and stands behind the board)
  arm.webp      one segment of a back arm, lying left to right
  joint.webp    the ball joint between two segments
  emitter.webp  the laser emitter at an arm's tip, seen from the front
Robot in robot-art.tsx places the body and builds the three back arms from the other
pieces. The glows (lenses, axe edge, emitter lens) are drawn by the client on top, so they
can pulse and change colour; the renders have none. With a path argument, also writes the
pieces over the arena's background colour for checking the edges.

The sources came from FLUX.1-schnell (genimg, 4 steps).

body.png, 1024x1024, seed 8:
  "3D render of a stylised game boss character, a tall imposing broad-shouldered robed
   machine priest cyborg, straight front view, shown from the knees up, deep red heavy
   cloth robe with the hood raised over the head, the face in the shadow of the hood is a
   dark metal mask covered in five round camera lenses of different sizes arranged unevenly
   like spider eyes, all with dark glass, a respirator grille over the mouth, ribbed tubes
   and cables running from the mask down into the robe, brass cog tooth pattern trim along
   the edge of the hood and the wide sleeves, a brass cogwheel badge on the chest, a bulky
   grey mechanical backpack rising behind both shoulders, its right mechanical hand grips a
   tall polearm that stands upright beside the body, the polearm rises higher than the head
   and ends in a large axe blade shaped like half a toothed cogwheel, its left sleeve hangs
   straight down empty with no hand visible, soft studio lighting from the upper left,
   matte materials, plain white background, no glow, no text"

The other three, seed 1, each "<SUBJECT>, 3D render of a stylised game asset, dark grey
painted metal with brass rings and small rivets, soft studio lighting from the upper left,
matte materials, isolated on a plain white background, no shadow, no glow, no text":
  arm.png (1344x768)       a single straight horizontal segment of a robotic arm, a thick
                           metal cylinder lying exactly horizontally from the left edge to
                           the right edge, with a thinner chrome hydraulic piston rod
                           running alongside it, flat cut ends, side view
  joint.png (1024x1024)    a single mechanical ball joint seen from the front, a perfectly
                           round dark metal sphere held in a round brass collar with bolts
                           around it, centred, circular silhouette
  emitter.png (1024x1024)  a single sci-fi laser cannon emitter head seen straight from the
                           front, a round dark metal housing with a brass ring, a large
                           round dark glass lens in the centre, cooling fins around the
                           rim, centred, circular silhouette
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/robot-parts"
OUT = ROOT / "src/client/shared/robot"

KEY = (0, 255, 0)
BODY_SIZE = 900
# The body's alpha falls from 1 to 0 between these rows of the source.
FADE_Y0, FADE_Y1 = 800, 1000
# The part of the arm render used as a segment (fractions of its width): the end of the
# barrel, its collar and the piston rod. The whole arm is too long for one short segment.
ARM_X0, ARM_X1 = 0.5, 0.97
ARM_LENGTH = 256
ROUND_SIZE = 160
# The gap between the joint's ball and its collar shows the white background; it gets this.
JOINT_GAP = (26, 27, 32)
ARENA_BG = (59, 31, 79)
# Background the corners don't reach: between the robe and the axe's shaft. Source pixels.
BODY_HOLES = [(751, 785)]
# The round pieces sit on a faint shadow, which goes with the background at this threshold.
ROUND_THRESH = 90


def cutout(img: Image.Image, thresh: int = 30, holes: list[tuple[int, int]] = []) -> Image.Image:
    """The image with the background connected to its corners (and to `holes`) made transparent."""
    keyed = img.convert("RGB")
    w, h = keyed.size
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), *holes]:
        if min(keyed.getpixel(xy)) > 255 - thresh:
            ImageDraw.floodfill(keyed, xy, KEY, thresh=thresh)
    solid = ~(np.asarray(keyed) == KEY).all(axis=2)
    # Pull the edge in a little: its pixels are part background.
    alpha = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def bbox(im: Image.Image) -> tuple[int, int, int, int]:
    box = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    assert box
    return box


def disc(im: Image.Image) -> Image.Image:
    """A round piece cropped to its circle, as wide as the piece and touching its top, which leaves out what is left of the shadow under it."""
    x0, y0, x1, _ = bbox(im)
    d = x1 - x0
    im = im.crop((x0, y0, x1, y0 + d))
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d - 1, d - 1), fill=255)
    alpha = np.minimum(np.asarray(im.getchannel("A")), np.asarray(mask))
    # The shadow's last sliver is the only light thing along the bottom.
    light = np.asarray(im.convert("RGB")).min(axis=2) > 150
    light[: round(d * 0.9)] = False
    im.putalpha(Image.fromarray(np.where(light, 0, alpha).astype(np.uint8)))
    return im.resize((ROUND_SIZE, ROUND_SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    def save(name: str, im: Image.Image) -> None:
        dest = OUT / f"{name}.webp"
        im.save(dest, "WEBP", quality=88, method=6)
        print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.1f} KB")

    body = cutout(Image.open(SRC / "body.png"), holes=BODY_HOLES)
    a = np.asarray(body).astype(np.float64)
    rows = np.arange(body.height)[:, None]
    a[..., 3] *= np.clip((FADE_Y1 - rows) / (FADE_Y1 - FADE_Y0), 0, 1)
    body = Image.fromarray(np.round(a).astype(np.uint8), "RGBA").resize((BODY_SIZE, BODY_SIZE), Image.LANCZOS)
    save("body", body)

    arm = cutout(Image.open(SRC / "arm.png"))
    x0, y0, x1, y1 = bbox(arm)
    arm = arm.crop((round(x0 + (x1 - x0) * ARM_X0), y0, round(x0 + (x1 - x0) * ARM_X1), y1))
    arm = arm.resize((ARM_LENGTH, round(arm.height * ARM_LENGTH / arm.width)), Image.LANCZOS)
    save("arm", arm)
    print(f"arm aspect (length / thickness) = {arm.width / arm.height:.2f}")

    src = Image.open(SRC / "joint.png").convert("RGB")
    # Up from the middle of the ball, the first white pixel is in the gap.
    x = src.width // 2
    y = next(y for y in range(src.height // 2, 0, -1) if min(src.getpixel((x, y))) > 235)
    ImageDraw.floodfill(src, (x, y - 2), JOINT_GAP, thresh=200)
    joint = disc(cutout(src, ROUND_THRESH))
    save("joint", joint)

    emitter = disc(cutout(Image.open(SRC / "emitter.png"), ROUND_THRESH))
    save("emitter", emitter)

    if len(sys.argv) > 1:
        pad = 30
        sheet = Image.new("RGBA", (BODY_SIZE + ARM_LENGTH * 2 + pad * 3, BODY_SIZE + pad * 2), ARENA_BG)
        sheet.alpha_composite(body, (pad, pad))
        x = BODY_SIZE + pad * 2
        big = arm.resize((arm.width * 2, arm.height * 2), Image.LANCZOS)
        sheet.alpha_composite(big, (x, pad))
        sheet.alpha_composite(joint.resize((320, 320), Image.LANCZOS), (x, pad * 2 + big.height))
        sheet.alpha_composite(emitter.resize((320, 320), Image.LANCZOS), (x, pad * 3 + big.height + 320))
        sheet.convert("RGB").save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()

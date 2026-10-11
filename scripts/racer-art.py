#!/usr/bin/env python3
"""Turns the generated pictures in scripts/racer-art/ into the Racer scene's pixel art in
src/client/shared/racer/. Needs Pillow and numpy; the WebPs are committed, so builds don't.

    python3 scripts/racer-art.py [preview.png]

The sources are smooth, large "pixel art style" pictures. Each one is cut out, shrunk to a
real low resolution, reduced to a small palette and given hard alpha, so the client can scale
it up with image-rendering: pixelated. This writes:
  car.webp          the car, facing left, tightly cropped
  car-crashed.webp  the same sprite wrecked: dull, sooty, dented, nose sunk (same size)
  skyline.webp      the buildings without their sky; the right half mirrors the left, so it
                    tiles horizontally
  palm.webp         one palm tree, tightly cropped; its base is the bottom edge
RacerScene in racer-art.tsx layers them over a CSS sky and road. With a path argument, also
writes a mock-up of that scene (both cars) for checking the edges.

The sources came from FLUX.1-schnell (genimg, 4 steps).

car.png, 1344x768, seed 21:
  "flat 2D side elevation of a classic 1980s Porsche 911 coupe, perfectly side-on
   orthographic profile like a blueprint, both wheels fully round, 16-bit retro pixel art
   game sprite, orange body, dark navy windows, chunky pixels, hard edges, plain white
   background, no ground line, no shadow, no text"

skyline.png, 1344x768, seed 5:
  "16-bit retro pixel art city skyline silhouette at dusk, wide horizontal strip of blue and
   indigo skyscrapers of varied heights with small lit orange and amber windows, flat
   straight-on side view, buildings standing on the bottom edge of the image, plain flat
   solid magenta-free deep purple sky with no clouds, no sun, no stars, synthwave arcade
   racing game background, chunky pixels, hard edges, no text"

palm.png, 768x1344, seed 3:
  "16-bit retro pixel art sprite of one tall palm tree, full tree from the base of the trunk
   to the top of the fronds, straight slender brown trunk, dark purple and teal blue fronds
   with orange highlights, synthwave arcade style, chunky pixels, hard edges, centered on a
   plain flat white background, no ground, no shadow, no text"
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/racer-art"
OUT = ROOT / "src/client/shared/racer"

# Sprite widths in real pixels, and palette sizes.
CAR_W = 160
PALM_W = 64
SKYLINE_W = 480  # one copy of the source; the tile is twice this (mirrored)
CAR_COLORS = 16
PALM_COLORS = 12
SKYLINE_COLORS = 16

# A background pixel is at least this light in every channel. The palm's shadow is a pale
# lavender (about 216, 214, 236), so this also takes it.
LIGHT = 190
# Shaved off a cut-out before shrinking, so the blended rim of the source doesn't survive.
ERODE = 2


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f"{name}.png").convert("RGB")).astype(np.int32)


def outside(candidate: np.ndarray) -> np.ndarray:
    """The candidate pixels connected to the border: the background, not light details inside."""
    padded = np.pad(candidate, 1, constant_values=True)
    img = Image.fromarray(np.where(padded, 255, 0).astype(np.uint8), "L").copy()
    ImageDraw.floodfill(img, (0, 0), 128)
    return (np.asarray(img) == 128)[1:-1, 1:-1]


def cut_out(rgb: np.ndarray, background: np.ndarray) -> Image.Image:
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MinFilter(2 * ERODE + 1))
    img = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
    img.putalpha(alpha)
    return img.crop(alpha.getbbox())


def pixelate(img: Image.Image, width: int, colors: int) -> Image.Image:
    """Shrinks to real pixels: averaged over the opaque part only, hard alpha, small palette."""
    height = round(img.height * width / img.width)
    small = np.asarray(img.convert("RGBa").resize((width, height), Image.BOX).convert("RGBA")).copy()
    opaque = small[..., 3] >= 128
    pixels = small[opaque][:, :3]
    strip = Image.fromarray(pixels.reshape(1, -1, 3), "RGB")
    quantized = strip.quantize(colors, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    small[opaque, :3] = np.asarray(quantized.convert("RGB")).reshape(-1, 3)
    small[..., 3] = np.where(opaque, 255, 0)
    small[~opaque, :3] = 0
    out = Image.fromarray(small, "RGBA")
    return out.crop(out.getchannel("A").getbbox())


def car() -> Image.Image:
    rgb = load("car")
    h, w, _ = rgb.shape
    # The ground line: the lowest run of rows that are dark most of the way across (the sill
    # between the wheels is another, higher up). It would also close off the gap under the
    # car, so it goes before the flood fill. Where a tyre stands on it (dark just above the
    # line) the line is kept as the tyre's bottom.
    dark = rgb.sum(axis=2) < 330
    rows = np.flatnonzero(dark.sum(axis=1) > 0.6 * w)
    if len(rows):
        rows = rows[rows > rows[np.flatnonzero(np.diff(rows) > 1)].max()] if (np.diff(rows) > 1).any() else rows
        top, bottom = rows.min() - 3, rows.max() + 3
        tyre = dark[top - 6 : top - 2].all(axis=0)
        rgb[top : bottom + 1][:, ~tyre] = 255
        rgb[bottom + 1 :] = 255
    return pixelate(cut_out(rgb, outside(rgb.min(axis=2) > LIGHT)), CAR_W, CAR_COLORS)


def crash(car_img: Image.Image) -> Image.Image:
    px = np.asarray(car_img).astype(np.float64)
    h, w, _ = px.shape
    rgb, alpha = px[..., :3], px[..., 3]
    # Dull and dark, as if burnt.
    grey = rgb @ np.array([0.3, 0.59, 0.11])
    rgb = (grey[..., None] * 0.55 + rgb * 0.45) * 0.62
    # Soot and dents: small dark clusters, mostly over the engine at the back (the right end).
    rng = np.random.default_rng(911)
    soot = np.array([22.0, 17.0, 26.0])
    solid = np.argwhere(alpha > 0)
    weights = 0.25 + (solid[:, 1] / w) ** 2
    for y, x in solid[rng.choice(len(solid), size=26, p=weights / weights.sum(), replace=False)]:
        for dy, dx in [(0, 0), (0, 1), (1, 0), (1, 1), (0, -1)][: rng.integers(1, 6)]:
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and alpha[yy, xx] > 0:
                rgb[yy, xx] = soot
    out = np.dstack([rgb, alpha])
    # The nose (left) has dropped: the front third sinks 2 px, the next stretch 1 px.
    for x in range(w):
        drop = 2 if x < w * 0.3 else 1 if x < w * 0.45 else 0
        if drop:
            out[drop:, x] = out[:-drop, x].copy()
            out[:drop, x] = 0
    return Image.fromarray(np.round(out).astype(np.uint8), "RGBA")


def skyline() -> Image.Image:
    rgb = load("skyline")
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # The sky runs from deep blue at the top to magenta at the horizon, but the buildings
    # only reach into its magenta part: red with almost no green. Buildings are blue (more
    # green than red), their windows orange (plenty of green), the foreground black.
    sky = (r > 60) & (g < 0.22 * r + 8) & (b > 60)
    # From the highest rooftop down to where the black band at the bottom becomes solid.
    solid = np.flatnonzero((rgb.sum(axis=2) < 45).mean(axis=1) > 0.98)
    bottom = solid[solid > rgb.shape[0] // 2].min()
    top = np.flatnonzero((~sky[:bottom] & (r[:bottom] < 60) & (g[:bottom] > r[:bottom])).sum(axis=1) > 0)
    # Everything above the first magenta row is sky as well, whatever its colour.
    first = np.flatnonzero(sky.mean(axis=1) > 0.9).min()
    top = top[top >= first].min()
    band = rgb[top:bottom].astype(np.uint8)
    img = Image.fromarray(band, "RGB").convert("RGBA")
    img.putalpha(Image.fromarray(np.where(sky[top:bottom], 0, 255).astype(np.uint8), "L"))
    height = round(img.height * SKYLINE_W / img.width)
    small = np.asarray(img.convert("RGBa").resize((SKYLINE_W, height), Image.BOX).convert("RGBA")).copy()
    opaque = small[..., 3] >= 128
    # A rim pixel is part sky: where red still beats green and blue isn't far ahead, drop it.
    sr, sg, sb = (small[..., i].astype(np.int32) for i in range(3))
    opaque &= ~((sr > 70) & (sg < 0.3 * sr) & (sb > 50))
    strip = Image.fromarray(small[opaque][:, :3].reshape(1, -1, 3), "RGB")
    quantized = strip.quantize(SKYLINE_COLORS, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    small[opaque, :3] = np.asarray(quantized.convert("RGB")).reshape(-1, 3)
    small[..., 3] = np.where(opaque, 255, 0)
    small[~opaque, :3] = 0
    # The bottom row is solid, so the strip sits on whatever is below it without gaps.
    gaps = small[-1, :, 3] == 0
    small[-1, gaps] = small[-1][~gaps][0] if (~gaps).any() else (0, 0, 0, 255)
    return Image.fromarray(np.concatenate([small, small[:, ::-1]], axis=1), "RGBA")


def palm() -> Image.Image:
    rgb = load("palm")
    return pixelate(cut_out(rgb, outside(rgb.min(axis=2) > LIGHT)), PALM_W, PALM_COLORS)


def save(img: Image.Image, name: str) -> None:
    dest = OUT / f"{name}.webp"
    img.save(dest, "WEBP", lossless=True, quality=100, method=6, exact=True)
    colors = len(img.convert("RGB").getcolors(1 << 16) or [])
    print(f"{dest.relative_to(ROOT)}  {img.width}x{img.height}  {colors} colours  {dest.stat().st_size / 1024:.1f} KB")


def preview(path: str, car_img: Image.Image, crashed: Image.Image, city: Image.Image, tree: Image.Image) -> None:
    """Roughly what RacerScene draws, at 3x, with both cars."""
    w, h, zoom = 640, 200, 3
    road = 48
    horizon = h - road
    scene = Image.new("RGBA", (w, h), "#24202e")
    draw = ImageDraw.Draw(scene)
    top, low = np.array([0x1B, 0x13, 0x40]), np.array([0x6A, 0x1B, 0x7A])
    bands = 7
    for i in range(bands):
        color = tuple(int(v) for v in np.round(top + (low - top) * i / (bands - 1)))
        draw.rectangle([0, horizon * i // bands, w, horizon * (i + 1) // bands], fill=color)
    draw.ellipse([130, horizon - 110, 240, horizon], fill="#ff8a1f")
    for x in range(-40, w, city.width):
        scene.alpha_composite(city.resize((city.width * 80 // city.height, 80), Image.NEAREST), (x, horizon - 80))
    tree_big = tree.resize((tree.width * 120 // tree.height, 120), Image.NEAREST)
    for x in (30, 250, 470):
        scene.alpha_composite(tree_big, (x, horizon - 116))
    draw.rectangle([0, horizon, w, h], fill="#24202e")
    draw.rectangle([0, horizon, w, horizon + 1], fill="#ff8a1f")
    for x in range(10, w, 60):
        draw.rectangle([x, horizon + 24, x + 28, horizon + 26], fill="#ffc23d")
    scene.alpha_composite(crashed, (40, h - 16 - crashed.height))
    scene.alpha_composite(car_img, (384 - car_img.width // 2, h - 16 - car_img.height))
    scene.resize((w * zoom, h * zoom), Image.NEAREST).convert("RGB").save(path)
    print(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    car_img = car()
    crashed = crash(car_img)
    city = skyline()
    tree = palm()
    save(car_img, "car")
    save(crashed, "car-crashed")
    save(city, "skyline")
    save(tree, "palm")
    if len(sys.argv) > 1:
        preview(sys.argv[1], car_img, crashed, city, tree)


if __name__ == "__main__":
    main()

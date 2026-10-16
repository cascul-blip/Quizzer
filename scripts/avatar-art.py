#!/usr/bin/env python3
"""Cuts the Imagine avatar pictures in scripts/avatar-art/ into the WebPs the
client loads from src/client/shared/avatar/. Needs Pillow and numpy. The WebPs
are committed, so a normal build does not run this.

    python3 scripts/avatar-art.py [preview.png]

Sources are painted stickers on a flat magenta background. This keys that
magenta and seats every piece on one 512 canvas, the same layout the faces
share: a face fills from 18% to 90% of the height, a hat rests on the crown,
glasses sit on the eye line, and a bow tie sits under the chin.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/avatar-art"
OUT = ROOT / "src/client/shared/avatar"
CANVAS = 512

# Faces share one box so a hat drawn for one character also lands on the others.
FACE_TOP = 0.18
FACE_BOTTOM = 0.90
FACE_MAX_W = 0.94

# One character, in the same order as AVATARS.
FACES = [
    "cat", "dog", "fox", "panda", "bear", "bunny", "frog", "owl", "penguin",
    "lion", "tiger", "koala", "monkey", "pig", "cow", "mouse", "unicorn",
    "dragon", "dino", "octopus", "chick", "robot", "alien", "ghost", "monster",
    "kid1", "kid2", "kid3", "kid4", "shark", "raccoon", "parrot", "axolotl",
    "turtle", "hedgehog", "bee", "capybara",
]

# pin is which edge of the cutout meets `y` (unless ANCHOR says otherwise).
# width and max_h are fractions of the canvas. x is the horizontal anchor.
GEAR = [
    ("snorkel", "mid", 0.48, 0.46, 0.50, 0.50),
    ("eyepatch", "mid", 0.74, 0.52, 0.36, 0.50),
    ("goggles", "mid", 0.68, 0.52, 0.32, 0.50),
    ("antlers", "bottom", 0.84, 0.30, 0.34, 0.50),
    ("propeller", "bottom", 0.56, 0.33, 0.40, 0.50),
    ("beret", "bottom", 0.60, 0.33, 0.36, 0.50),
    ("scarf", "bottom", 0.90, 0.99, 0.36, 0.50),
    ("tiara", "bottom", 0.62, 0.30, 0.28, 0.50),
    ("tophat", "bottom", 0.58, 0.34, 0.32, 0.50),
    ("cap", "bottom", 0.70, 0.36, 0.34, 0.50),
    ("crown", "bottom", 0.72, 0.34, 0.32, 0.50),
    ("beanie", "bottom", 0.56, 0.36, 0.34, 0.50),
    ("partyhat", "bottom", 0.42, 0.36, 0.34, 0.50),
    ("cowboy", "bottom", 0.90, 0.36, 0.34, 0.50),
    ("wizard", "bottom", 0.64, 0.36, 0.34, 0.50),
    ("pirate", "bottom", 0.78, 0.34, 0.30, 0.50),
    ("viking", "bottom", 0.70, 0.38, 0.36, 0.50),
    # Seated by seat_headphones: the cups sit outside the head, so these numbers are unused.
    ("headphones", "mid", 0.78, 0.50, 0.62, 0.50),
    ("flowers", "bottom", 0.84, 0.48, 0.36, 0.50),
    ("bow", "mid", 0.26, 0.28, 0.20, 0.72),
    ("curly", "bottom", 0.80, 0.44, 0.40, 0.50),
    ("spiky", "bottom", 0.90, 0.46, 0.42, 0.50),
    ("pigtails", "bottom", 0.86, 0.64, 0.52, 0.50),
    ("sunglasses", "mid", 0.64, 0.52, 0.28, 0.50),
    ("hearts", "mid", 0.60, 0.52, 0.32, 0.50),
    ("nerd", "mid", 0.66, 0.52, 0.30, 0.50),
    ("monocle", "mid", 0.40, 0.52, 0.55, 0.62),
    ("mustache", "mid", 0.46, 0.66, 0.16, 0.50),
    ("bowtie", "bottom", 0.42, 0.98, 0.18, 0.50),
]

# Point inside the cutout (fraction of its box) that lands on (x, y).
# The monocle's chain hangs off the lens, so the box center is not the lens.
ANCHOR = {
    "monocle": (0.44, 0.36),
}

# Worn samples for the contact sheet. Any accessory has to fit any face.
SAMPLES = [
    ("cat", "tophat"),
    ("cat", "sunglasses"),
    ("cat", "scarf"),
    ("cat", "bowtie"),
    ("cat", "bow"),
    ("cat", "headphones"),
    ("cat", "curly"),
    ("cat", "mustache"),
    ("shark", "snorkel"),
    ("fox", "monocle"),
    ("panda", "crown"),
    ("bunny", "partyhat"),
    ("frog", "flowers"),
    ("kid1", "pigtails"),
    ("lion", "cowboy"),
    ("robot", "nerd"),
]


def chroma(im: Image.Image) -> Image.Image:
    """Drop the flat magenta background. Soft edge, with the magenta spill pulled out of the rim."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    samples = np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4], rgb[3, rgb.shape[1] // 2]])
    key = np.median(samples, axis=0)
    dist = np.sqrt(((rgb - key) ** 2).sum(-1))
    alpha = np.clip((dist - 36) / (88 - 36), 0, 1)
    # Unmix only the semi-transparent rim. A hard floor on the divisor stops a soft
    # glow from blowing out where it met the magenta.
    fringe = (alpha > 0.05) & (alpha < 0.92)
    fixed = np.clip((rgb - key * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 0.35), 0, 255)
    rgb = np.where(fringe[..., None], fixed, rgb)
    rgb[alpha < 0.05] = 0
    alpha[alpha < 0.05] = 0
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def cutout(name: str) -> Image.Image:
    im = chroma(Image.open(SRC / f"{name}.jpg"))
    box = im.getchannel("A").getbbox()
    if not box:
        raise SystemExit(f"{name}: nothing left after the key")
    return im.crop(box)


def blank() -> Image.Image:
    return Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))


def paste(base: Image.Image, sprite: Image.Image, left: float, top: float) -> None:
    left_i, top_i = round(left), round(top)
    w, h = sprite.size
    src_x = max(0, -left_i)
    src_y = max(0, -top_i)
    dst_x = max(0, left_i)
    dst_y = max(0, top_i)
    cw = min(w - src_x, CANVAS - dst_x)
    ch = min(h - src_y, CANVAS - dst_y)
    if cw <= 0 or ch <= 0:
        return
    piece = sprite.crop((src_x, src_y, src_x + cw, src_y + ch))
    base.alpha_composite(piece, (dst_x, dst_y))


def resize(sprite: Image.Image, scale: float) -> Image.Image:
    w = max(1, round(sprite.width * scale))
    h = max(1, round(sprite.height * scale))
    return sprite.resize((w, h), Image.Resampling.LANCZOS)


def seat_face(sprite: Image.Image) -> Image.Image:
    """One head size for every character. Ears and spikes count, so they stay inside the box."""
    target_h = (FACE_BOTTOM - FACE_TOP) * CANVAS
    scale = target_h / sprite.height
    if sprite.width * scale > FACE_MAX_W * CANVAS:
        scale = (FACE_MAX_W * CANVAS) / sprite.width
    fitted = resize(sprite, scale)
    left = (CANVAS - fitted.width) / 2
    top = FACE_TOP * CANVAS + max(0, (target_h - fitted.height) / 2)
    out = blank()
    paste(out, fitted, left, top)
    return out


def seat_headphones(sprite: Image.Image) -> Image.Image:
    """The drawn cups are close together, so a plain scale lays them over the face.

    Spread is measured from the empty gap between the cups and matched to the head,
    which puts the cups outside the cheeks and the band over the crown.
    """
    rgb = np.asarray(sprite.convert("RGB"))
    alpha = np.array(sprite.getchannel("A"))
    # The source sometimes leaves a crumb of a cup on the frame edge. Drop it.
    alpha[:, :8] = 0
    alpha[:, -8:] = 0
    im = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    box = im.getchannel("A").getbbox()
    if not box:
        raise SystemExit("headphones: nothing left after the key")
    sprite = im.crop(box)
    mask = np.asarray(sprite.getchannel("A")) > 20
    sh, sw = mask.shape
    gap_y = []
    best = None
    for y in range(sh):
        cols = np.where(mask[y])[0]
        if len(cols) < 5:
            continue
        splits = np.where(np.diff(cols) > 5)[0]
        if len(splits) != 1:
            continue
        left_end = int(cols[splits[0]])
        right_start = int(cols[splits[0] + 1])
        gap_y.append(y)
        if best is None or right_start - left_end > best[0]:
            best = (right_start - left_end, left_end, right_start)
    if best is None or not gap_y:
        raise SystemExit("headphones: no gap between the cups")
    # Wide enough that the cheeks sit in the opening. The widest faces are about 0.76.
    gap_target = 0.74
    scale = (gap_target * CANVAS / best[0])
    fitted = resize(sprite, scale)
    inner_x = (1 - gap_target) / 2 * CANVAS
    left = inner_x - best[1] * scale
    cup_mid = (gap_y[0] + gap_y[-1]) / 2 / sh
    top = 0.54 * CANVAS - cup_mid * fitted.height
    out = blank()
    paste(out, fitted, left, top)
    return out


def seat_gear(sprite: Image.Image, pin: str, width: float, y: float, max_h: float, x: float, anchor: tuple[float, float] | None) -> Image.Image:
    scale = (width * CANVAS) / sprite.width
    if sprite.height * scale > max_h * CANVAS:
        scale = (max_h * CANVAS) / sprite.height
    fitted = resize(sprite, scale)
    if anchor is None:
        ax = 0.5
        ay = {"bottom": 1.0, "mid": 0.5, "top": 0.0}[pin]
    else:
        ax, ay = anchor
    left = x * CANVAS - fitted.width * ax
    top = y * CANVAS - fitted.height * ay
    if top < 1:
        top = 1
    if top + fitted.height > CANVAS - 1:
        top = CANVAS - 1 - fitted.height
    out = blank()
    paste(out, fitted, left, top)
    return out


def save(im: Image.Image, name: str) -> None:
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=86, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.0f} KB")


def guide(base: Image.Image, dark: bool) -> Image.Image:
    """A faint head, the eye line, and the mouth, so a hat that misses the crown shows up."""
    plate = Image.new("RGBA", (CANVAS, CANVAS), (37, 9, 79, 255) if dark else (243, 240, 250, 255))
    ink = (255, 255, 255, 90) if dark else (43, 34, 56, 70)
    draw = ImageDraw.Draw(plate)
    cx, ry = CANVAS * 0.5, CANVAS * 0.36
    draw.ellipse((cx - ry, FACE_TOP * CANVAS, cx + ry, FACE_BOTTOM * CANVAS), outline=ink, width=3)
    for ex in (0.40, 0.60):
        x, y = ex * CANVAS, 0.52 * CANVAS
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=ink)
    my = 0.66 * CANVAS
    draw.arc((cx - 28, my - 10, cx + 28, my + 18), 20, 160, fill=ink, width=3)
    plate.alpha_composite(base)
    return plate


def tile(sheet: Image.Image, draw: ImageDraw.ImageDraw, col: int, row: int, cell: int, label_h: int, name: str, layer: Image.Image, dark: bool) -> None:
    shot = guide(layer, dark).resize((cell, cell), Image.Resampling.LANCZOS).convert("RGB")
    y = row * (cell + label_h)
    sheet.paste(shot, (col * cell, y))
    draw.text((col * cell + 6, y + cell + 4), name, fill=(30, 20, 40))


def contact(faces: dict[str, Image.Image], gear: dict[str, Image.Image], path: Path) -> None:
    cell, label_h, cols = 220, 22, 8
    face_rows = (len(FACES) + cols - 1) // cols
    gear_names = [row[0] for row in GEAR]
    gear_rows = (len(gear_names) + cols - 1) // cols
    sample_rows = (len(SAMPLES) + cols - 1) // cols
    rows = face_rows + gear_rows + sample_rows
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(FACES):
        tile(sheet, draw, i % cols, i // cols, cell, label_h, name, faces[name], False)
    base = face_rows
    for i, name in enumerate(gear_names):
        tile(sheet, draw, i % cols, base + i // cols, cell, label_h, name, gear[name], True)
    base = face_rows + gear_rows
    for i, (face, extra) in enumerate(SAMPLES):
        layer = blank()
        layer.alpha_composite(faces[face])
        layer.alpha_composite(gear[extra])
        tile(sheet, draw, i % cols, base + i // cols, cell, label_h, f"{face}+{extra}", layer, False)
    sheet.save(path)
    print(path)


def main() -> None:
    files = {p.stem for p in SRC.glob("*.jpg")}
    known = set(FACES) | {row[0] for row in GEAR}
    missing = sorted(known - files)
    extra = sorted(files - known)
    if missing or extra:
        raise SystemExit(f"sources out of sync. missing={missing} extra={extra}")
    OUT.mkdir(parents=True, exist_ok=True)
    faces = {name: seat_face(cutout(name)) for name in FACES}
    gear = {}
    for name, pin, width, y, max_h, x in GEAR:
        sprite = cutout(name)
        gear[name] = seat_headphones(sprite) if name == "headphones" else seat_gear(sprite, pin, width, y, max_h, x, ANCHOR.get(name))
    for name, im in faces.items():
        save(im, name)
    for name, im in gear.items():
        save(im, name)
    preview = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/avatar-preview.png")
    contact(faces, gear, preview)


if __name__ == "__main__":
    main()

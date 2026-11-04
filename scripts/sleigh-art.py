#!/usr/bin/env python3
"""Cuts the Santa's Sleigh Run art in scripts/sleigh-art/ into the WebPs the client loads
from src/client/shared/sleigh/, and writes the town's house table. Needs Pillow and numpy.
The outputs are committed, so a normal build does not run this.

    python3 scripts/sleigh-art.py

The town is one painting (town-dark.jpg, with town-lit.jpg the same town strung with
lights) and houses.json outlines its roofs. This writes:
  src/shared/sleigh-town.ts           every usable house: roof outline and chimney, field units
  sleigh/town.webp                    the dark town, the projector's whole background
  sleigh/lit/s-NN.webp, lit.ts        each usable house cut from the lit town, soft-edged, placed
                                      over the dark town once its present is delivered
  sleigh/*.webp                       sleigh, reindeer, gifts, chimneys, wall, pad, effects, screens
  sleigh/phone/*.webp                 the phone's wheel, backdrop and candy canes

Player-colour art (the sleigh body, gift-key and the wheel's marker and hub) is painted key
cyan. Each one is split into X.webp, with the cyan replaced by its shading (black for shadow,
white for gloss, alpha for how much), and X-paint.webp, a white mask of the cyan. The client
fills the mask with the player's colour and draws X.webp over it.

Effects come on pure black; they are turned into alpha (brightness) so they draw normally.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/sleigh-art"
OUT = ROOT / "src/client/shared/sleigh"
TOWN_TS = ROOT / "src/shared/sleigh-town.ts"
QUALITY = 86

# The town painting is 2560x1440 for the 1600x900 field (sleigh-rules.ts).
PX_PER_UNIT = 1.6
# How far the lit patch reaches past the roof outline (string lights hang on the walls), and its soft edge, in px.
LIT_GROW = 17
LIT_FEATHER = 5


def save(im: Image.Image, name: str, quality: int = QUALITY) -> None:
    dest = OUT / f"{name}.webp"
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6, exact=True)


def load(name: str) -> Image.Image:
    im = Image.open(SRC / name)
    return im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")


def fit(im: Image.Image, w: int, h: int | None = None) -> Image.Image:
    return im.resize((w, h if h is not None else round(im.height * w / im.width)), Image.LANCZOS)


def hue_sat_val(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.where(mx - mn == 0, 1, mx - mn)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def tint_split(im: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Key cyan → (shading layer, paint mask). Over a fill of colour c the pair redraws the
    original with c in place of the cyan: dark where it was dark, white where it was glossy."""
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    h, s, v = hue_sat_val(rgb)
    # Saturated cyan is paint; pale blue-white gloss on the paint counts too, fading out with saturation.
    cyan = np.clip((14 - np.abs(h - 193)) / 6, 0, 1) * np.clip((s - 0.12) / 0.2, 0, 1) * np.clip((v - 0.08) / 0.1, 0, 1)
    paint = Image.fromarray((cyan * alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    p = np.asarray(paint).astype(np.float32) / 255
    # The paint is c·v·(1−g) + white·v·g, with g the gloss (lack of saturation).
    gloss = np.clip(1 - s / 0.85, 0, 1)
    over_a = np.clip(1 - v * (1 - gloss), 0, 1)
    over_rgb = np.where(over_a > 1e-3, v * gloss / np.maximum(over_a, 1e-3), 0)
    out = a.copy()
    out[..., :3] = rgb * (1 - p[..., None]) + np.repeat(over_rgb[..., None], 3, -1) * p[..., None]
    out[..., 3] = alpha * (1 - p) + over_a * p
    mask = np.zeros_like(a)
    mask[..., :3] = 1
    mask[..., 3] = p
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA"), Image.fromarray((mask * 255).astype(np.uint8), "RGBA")


def glow_alpha(im: Image.Image) -> Image.Image:
    """An effect on pure black → the same light as colour plus alpha, so it draws without a blend mode."""
    a = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    al = a.max(-1)
    rgb = np.where(al[..., None] > 1e-3, a / np.maximum(al[..., None], 1e-3), 0)
    return Image.fromarray((np.dstack([rgb, al]) * 255).astype(np.uint8), "RGBA")


def u(px: float) -> float:
    return round(px / PX_PER_UNIT, 1)


def town() -> None:
    data = json.loads((SRC / "houses.json").read_text())
    dark = load("town-dark.jpg")
    lit = load("town-lit.jpg").convert("RGBA")
    save(dark, "town", 82)

    spots = [h for h in data["houses"] if not h["edge"] and h["chimney"]]
    rows, imports, patches = [], [], []
    W, H = dark.size
    for h in spots:
        x0, y0, w, hh = h["bbox"]
        pad = LIT_GROW + LIT_FEATHER * 2
        bx0, by0 = max(0, x0 - pad), max(0, y0 - pad)
        bx1, by1 = min(W, x0 + w + pad), min(H, y0 + hh + pad)
        mask = Image.new("L", (bx1 - bx0, by1 - by0), 0)
        ImageDraw.Draw(mask).polygon([(px - bx0, py - by0) for px, py in h["polygon"]], fill=255)
        mask = mask.filter(ImageFilter.MaxFilter(LIT_GROW * 2 + 1)).filter(ImageFilter.GaussianBlur(LIT_FEATHER))
        patch = lit.crop((bx0, by0, bx1, by1))
        patch.putalpha(mask)
        name = f"s-{h['id']:02d}"
        save(patch, f"lit/{name}", 84)
        imports.append(f'import {name.replace("-", "")} from "./lit/{name}.webp";')
        patches.append(f"  {h['id']}: {{ href: {name.replace('-', '')}, x: {u(bx0)}, y: {u(by0)}, w: {u(bx1 - bx0)}, h: {u(by1 - by0)} }},")
        poly = ", ".join(f"[{u(px)}, {u(py)}]" for px, py in h["polygon"])
        cx, cy = h["chimney"]
        rows.append(f"  {{ id: {h['id']}, chimney: [{u(cx)}, {u(cy)}], poly: [{poly}] }},")

    TOWN_TS.write_text(
        "// Generated by scripts/sleigh-art.py from scripts/sleigh-art/houses.json; do not edit by hand.\n"
        "/**\n"
        " * The houses of the painted town (town-dark / town-lit) that can wait for a present: not cut off\n"
        " * by the picture's edge and with a chimney. Field units (sleigh-rules.ts); `poly` is the roof\n"
        " * outline (convex), `chimney` the painted chimney stack. `id` is the house's number in houses.json.\n"
        " */\n"
        "export interface TownSpot {\n  id: number;\n  chimney: readonly [number, number];\n  poly: readonly (readonly [number, number])[];\n}\n\n"
        "export const TOWN_SPOTS: readonly TownSpot[] = [\n" + "\n".join(rows) + "\n];\n"
    )
    (OUT / "lit.ts").write_text(
        "// Generated by scripts/sleigh-art.py; do not edit by hand.\n"
        "/** Each town house cut from the lit town, by TownSpot id: where it goes over the dark town, in field units. */\n"
        + "\n".join(imports)
        + "\n\nexport const LIT_PATCHES: Record<number, { href: string; x: number; y: number; w: number; h: number }> = {\n"
        + "\n".join(patches)
        + "\n};\n"
    )
    print(f"town: {len(spots)} usable houses of {len(data['houses'])}")


def sprites() -> None:
    # The team: 1024 px = 30 field units, about 48 px on the town; 256 px covers a 4K projector.
    body, paint = tint_split(load("sleigh.png"))
    save(fit(body, 256), "sleigh")
    save(fit(paint, 256), "sleigh-paint")
    for i in range(1, 5):
        save(fit(load(f"reindeer-{i}.png"), 256), f"reindeer-{i}")
        save(fit(load(f"rudolph-{i}.png"), 256), f"rudolph-{i}")

    for name in ["chimney-waiting", "chimney-done"]:
        save(fit(load(f"{name}.png"), 96), name)
    for c in ["red", "green", "blue", "purple", "gold"]:
        save(fit(load(f"gift-{c}.png"), 128), f"gift-{c}")
    body, paint = tint_split(load("gift-key.png"))
    save(fit(body, 128), "gift-key")
    save(fit(paint, 128), "gift-key-paint")

    save(fit(load("wall-straight.png"), 1024), "wall-straight")
    save(fit(load("wall-corner.png"), 256), "wall-corner")
    save(fit(load("wall-wreath.png"), 64), "wall-wreath")
    save(fit(load("launch-pad.png"), 512), "launch-pad")
    save(fit(load("candy-canes.png"), 512), "candy-canes")

    save(fit(glow_alpha(load("sparkle-burst.png")), 256), "sparkle-burst")
    save(fit(glow_alpha(load("snow-puff.png")), 256), "snow-puff")
    save(fit(glow_alpha(load("magic-dust.png")), 512), "magic-dust")

    save(load("takeoff.jpg"), "takeoff", 80)
    save(load("celebration.jpg"), "celebration", 80)


def phone() -> None:
    body, paint = tint_split(load("wheel.png"))
    save(fit(body, 768), "phone/wheel")
    save(fit(paint, 768), "phone/wheel-paint")
    save(load("phone-bg.jpg"), "phone/backdrop", 78)
    save(fit(load("candy-canes.png"), 384), "phone/candy-canes")


if __name__ == "__main__":
    town()
    sprites()
    phone()

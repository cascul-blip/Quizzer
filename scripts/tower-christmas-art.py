#!/usr/bin/env python3
"""Prepare the approved North Pole source art, including team-color trim overlays.

Run with python3 scripts/tower-christmas-art.py (Pillow and numpy required).
Only green painted structural wood becomes tintable; snow, windows, brass and
Christmas decorations retain their colors. Outputs are committed like normal art.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts/tower-christmas-art"
OUT = ROOT / "src/client/shared/tower/christmas"


def trim_overlay(im: Image.Image, name: str) -> Image.Image:
    rgba = np.asarray(im.convert("RGBA"), dtype=float) / 255
    rgb, original_alpha = rgba[..., :3], rgba[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = np.clip((g - r - 0.015) / 0.06, 0, 1) * np.clip((g - b - 0.01) / 0.045, 0, 1)
    y, x = np.mgrid[:im.height, :im.width].astype(float)
    x, y = x / im.width, y / im.height
    if name == "crane":
        # The holly and bow on the mast remain green/red.
        structure = ~((x > 0.22) & (x < 0.38) & (y > 0.48) & (y < 0.62))
    else:
        structure = (x < 0.105) | (x > 0.895) | (y < 0.165) | (y > 0.895)
        structure |= (y < 0.34) & ((x < 0.29 - y * 0.5) | (x > 0.71 + y * 0.5))
        if name == "lobby":
            structure |= (x > 0.23) & (x < 0.77) & (y > 0.38)
    mask = green * structure
    # Encode material texture as translucent black/white over the team's color.
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    base = 0.24
    shade_alpha = np.where(lum < base, (base - lum) / base, (lum - base) / (1 - base))
    shade_rgb = np.where(lum < base, 0.0, 1.0)
    alpha = (1 - mask + mask * shade_alpha) * original_alpha
    premult = ((1 - mask)[..., None] * rgb + (mask * shade_alpha * shade_rgb)[..., None]) * original_alpha[..., None]
    result = np.dstack([premult / np.maximum(alpha[..., None], 1e-8), alpha])
    return Image.fromarray(np.round(np.clip(result, 0, 1) * 255).astype("uint8"), "RGBA")


def main() -> None:
    names = ["office-1", "office-2", "office-3", "office-4", "lobby", "shop", "crane", "bell", "yeti", "background"]
    for name in names + ["crane-mask"]:
        im = Image.open(SOURCE / f"{'crane' if name == 'crane-mask' else name}.png").convert("RGBA")
        if name == "crane-mask":
            mask = Image.new("RGBA", im.size, "white")
            mask.putalpha(im.getchannel("A"))
            im = mask
        if name not in ("bell", "yeti", "background", "crane-mask"):
            im = trim_overlay(im, name)
        for phone in (False, True):
            # Towers occupy small areas even on a projector. Background is full screen.
            width = (960 if phone else 1920) if name == "background" else (192 if phone else 384) if name in ("yeti", "crane", "crane-mask") else (128 if phone else 256)
            scaled = im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS)
            if name == "background":
                scaled = scaled.convert("RGB")
            dest = OUT / ("phone" if phone else "") / f"{name}.webp"
            dest.parent.mkdir(parents=True, exist_ok=True)
            scaled.save(dest, "WEBP", quality=85, method=6)
            print(f"{dest.relative_to(ROOT)}: {scaled.width}x{scaled.height}, {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

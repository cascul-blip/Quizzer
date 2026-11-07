#!/usr/bin/env python3
"""Convert the generated Gingerbread Siege PNGs into host and phone WebP assets."""
import json
import sys
from statistics import median
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'scripts/fight-christmas-art'
DEST = ROOT / 'src/client/shared/fight/christmas'


def ground_profile(image, peak_height):
    """Measure the connected alpha silhouette, ignoring isolated sugar specks above it."""
    image = image.convert('RGBA')
    width, height = image.size
    alpha = image.getchannel('A')
    def top(x):
        x = min(width - 1, max(0, x))
        y = height - 1
        while y > 0 and alpha.getpixel((x, y)) < 128:
            y -= 1
        while y > 0 and alpha.getpixel((x, y - 1)) >= 128:
            y -= 1
        return y
    surface = [median(top(min(width - 1, round(i / 200 * (width - 1))) + dx) for dx in range(-4, 5)) for i in range(201)]
    flat = median(surface[4:40] + surface[161:197])
    # Use the same fixed height choices as classic. The image is transformed with this same scale.
    scale = peak_height / (flat - min(surface[47:154]))
    terrain = [round(60 + max(0, flat - y) * scale, 1) if 46 < i < 154 else 60 for i, y in enumerate(surface)]
    return {'y': round(540 - flat * scale, 4), 'height': round(height * scale, 4), 'terrain': terrain}


def main():
    (DEST / 'phone').mkdir(parents=True, exist_ok=True)
    profile_path = ROOT / 'src/shared/fight-ground-profiles.json'
    profiles = json.loads(profile_path.read_text()) if profile_path.exists() else {}
    selected = set(sys.argv[1:])
    for source in sorted(SOURCES.glob('*.png')):
        image = Image.open(source)
        name = source.stem
        if selected and name not in selected:
            continue
        if name.startswith('ground-'):
            hill = name.removeprefix('ground-')
            profiles[hill] = ground_profile(image, {'low': 150, 'medium': 230, 'high': 310}[hill])
            size = (1280, round(image.height * 1280 / image.width))
        elif name == 'sky':
            ratio = min(1, 1024 / image.width)
            size = (round(image.width * ratio), round(image.height * ratio))
        elif name.startswith('flag-'):
            size = (512, round(image.height * 512 / image.width))
        elif name.startswith('castle'):
            size = (384, 960)  # Identical damage-stage canvases, never trim individually.
        elif name in ('earth', 'icing'):
            size = (384, 384)
        else:
            size = (768, round(image.height * 768 / image.width))
        image = image.resize(size, Image.Resampling.LANCZOS)
        image.save(DEST / f'{name}.webp', 'WEBP', quality=85, method=6)
        small = image.resize((image.width // 2, image.height // 2), Image.Resampling.LANCZOS)
        small.save(DEST / 'phone' / f'{name}.webp', 'WEBP', quality=82, method=6)
        print(f'{name}: {size[0]}x{size[1]}, phone {small.width}x{small.height}')
    profile_path.write_text(json.dumps(profiles, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()

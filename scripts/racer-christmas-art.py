#!/usr/bin/env python3
"""Prepare built-in ImageGen Neon Noel sources as hard-alpha, low-resolution sprites.
Run: python3 scripts/racer-christmas-art.py
Uses the same quantization and crash treatment as Racer's original art pipeline.
"""
from pathlib import Path
import importlib.util
import sys
from PIL import Image, ImageDraw, ImageOps

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('racer_art', ROOT / 'scripts/racer-art.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)
SRC = ROOT / 'scripts/racer-christmas-art'
OUT = ROOT / 'src/client/shared/racer/christmas'
OUT.mkdir(parents=True, exist_ok=True)

def source(name):
    img = Image.open(SRC / f'{name}.png').convert('RGBA')
    # Remove the faint generated halo before resizing; preserve the actual sprite.
    alpha = img.getchannel('A').point(lambda a: 255 if a >= 180 else 0)
    img.putalpha(alpha)
    return img.crop(alpha.getbbox())

def save(img, name):
    img.save(OUT / f'{name}.webp', 'WEBP', lossless=True, exact=True, method=6)
    print(f'{name}: {img.width}x{img.height}')

car = art.pixelate(source('car'), 160, 24)
save(car, 'car')
save(art.crash(car), 'car-crashed')
save(art.pixelate(source('tree'), 64, 20), 'tree')
# Preserve the existing tile geometry (960x101). Two mirrored halves make a seamless loop.
city = source('skyline')
city = city.resize((480, 101), Image.Resampling.BOX)
city = art.pixelate(city, 480, 24)
# pixelate trims transparent margins: restore exact tile dimensions without stretching.
strip = Image.new('RGBA', (480, 101))
strip.alpha_composite(city, (0, 101 - city.height))
# A solid baseline seats the skyline against the snowbank.
ImageDraw.Draw(strip).line((0, 100, 479, 100), fill='#231051')
tile = Image.new('RGBA', (960, 101))
tile.alpha_composite(strip)
tile.alpha_composite(ImageOps.mirror(strip), (480, 0))
save(tile, 'skyline')

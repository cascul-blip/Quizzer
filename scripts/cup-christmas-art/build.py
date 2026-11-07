"""Optimize the generated background and transparent table without altering their art."""
from pathlib import Path
from PIL import Image

SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parent.parent / "src/client/shared/cup/christmas"
OUT.mkdir(parents=True, exist_ok=True)
for name in ("workshop", "table"):
    image = Image.open(SOURCE / f"{name}.png")
    if name == "table":
        image = image.crop(image.getbbox())
        image.thumbnail((1100, 1100))
    else:
        image.thumbnail((1600, 1000))
    image.save(OUT / f"{name}.webp", quality=88, method=6)

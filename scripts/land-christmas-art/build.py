"""Export generated North Pole artwork as runtime WebP and smaller phone copies."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / "src"
DEST = ROOT / "src/client/shared/land/christmas"

for name in ("north-pole", "tabletop"):
    source = "north-pole-aged" if name == "north-pole" else name
    image = Image.open(SOURCE / f"{source}.png").convert("RGBA" if name == "north-pole" else "RGB")
    DEST.mkdir(parents=True, exist_ok=True)
    image.save(DEST / f"{name}.webp", quality=88)
    image.thumbnail((1100, 1100))
    (DEST / "phone").mkdir(exist_ok=True)
    image.save(DEST / "phone" / f"{name}.webp", quality=82)

"""Convert approved snowball artwork to host/phone WebPs. Requires Pillow."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "scripts/duel-christmas-art"
target = root / "src/client/shared/duel/christmas"
for sub, factor in [("", 1), ("phone", .5)]:
    out = target / sub
    out.mkdir(parents=True, exist_ok=True)
    for name in ["plaza", "street-1", "street-2", "street-3", "elf-sheet", "snow-puff"]:
        im = Image.open(source / f"{name}.png").convert("RGBA")
        # The effect is rendered small. Cap it before producing the phone copy.
        limit = 640 if name == "snow-puff" else 1774 if name == "elf-sheet" else 1600
        scale = min(1, limit / im.width) * factor
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
        im.save(out / f"{name}.webp", quality=88, method=6)
        print(out.relative_to(root) / f"{name}.webp")

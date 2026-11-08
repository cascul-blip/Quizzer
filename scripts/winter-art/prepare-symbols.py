"""Extract generated review-sheet tiles into white-backed game pictures (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/client/shared/winter/symbols"
OUT.mkdir(parents=True, exist_ok=True)
FAMILIES = {
    "tree": ["star-baubles", "bow-baubles", "star-garland", "bells", "snow", "star-bow"],
    "gift": ["square", "tall", "holly", "round", "dots", "heart"],
    "stocking": ["right", "left", "star", "dots", "stripes", "tree"],
    "wreath": ["bottom-bow", "top-bow", "bells", "star", "candy-canes", "snowflake"],
}
# Both generated sheets are 1448 x 1086 with the same four-column layout.
COLUMNS = [(44, 365), (391, 711), (736, 1057), (1082, 1405)]
ROWS = [(27, 356), (376, 703), (725, 1061)]
for sheet_index, name in enumerate(["approved", "companion"]):
    sheet = Image.open(Path(__file__).parent / "symbol-sources" / f"{name}.png").convert("RGB")
    assert sheet.size == (1448, 1086), sheet.size
    for col, (family, designs) in enumerate(FAMILIES.items()):
        for row, (top, bottom) in enumerate(ROWS):
            left, right = COLUMNS[col]
            tile = sheet.crop((left, top, right, bottom))
            # Discard the teal sheet outside each rounded white review tile.
            # This only trims empty tile corners; the painted objects remain intact.
            mask = Image.new("L", tile.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle((2, 2, tile.width-3, tile.height-3), radius=47, fill=255)
            picture = Image.new("RGB", tile.size, "white")
            picture.paste(tile, mask=mask)
            canvas = Image.new("RGB", (352, 352), "white")
            canvas.paste(picture, ((352-picture.width)//2, (352-picture.height)//2))
            canvas.save(OUT / f"{family}-{designs[sheet_index*3+row]}.webp", quality=90, method=6)

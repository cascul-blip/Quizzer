#!/usr/bin/env python3
"""Makes the phone-sized copies of the art in src/client/shared/ from the projector files.
Needs Pillow. The WebPs are committed, so a normal build does not run this; run it again
after regenerating any of the art below.

    python3 scripts/phone-art.py

Phones draw this art far smaller than the projector does, and every phone downloads it at
once over the host's Wi-Fi. This writes:
  avatar/phone-faces.webp  every character in AVATARS order, one sheet
  avatar/phone-gear.webp   every accessory in ACCESSORIES order (minus "none"), one sheet
  fight/phone/*.webp       the Tower Fight art at half size
  tower/phone/*.webp       the building tiles at half size
  land/phone/*.webp        the Land Grab board art at half size (not the maps, see below)

The sheets are a grid of SHEET_COLS cells of CELL pixels, each with GUTTER transparent
pixels around it so a neighbour never bleeds in when the browser scales the sheet. The
client reads the same constants from avatar-art.tsx, so change both together.
A 192 px cell covers the 64 px picker tile on a 3x screen.
"""
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "src/client/shared"
CELL = 192
GUTTER = 2
SHEET_COLS = 8
QUALITY = 80

HALF_SIZE = {
    # fight/phone/aim-backdrop.webp is phone only and comes straight from the art build.
    "fight": [
        "castle-0", "castle-1", "castle-2", "castle-3", "castle-4", "castle-cloth", "castle-cloth-0", "castle-cloth-1",
        "castle-cloth-2", "castle-cloth-3", "castle-cloth-4", "catapult", "catapult-cloth", "scaffold", "fx-dust", "fx-dirt",
        "fx-crater-rim", "fx-rubble", "sky", "ground-earth", "ground-grass", "ui-attack", "ui-rebuild", "brick",
    ],
    "tower": ["lobby", "shop", "office-1", "office-2", "office-3", "office-4"],
    # Board, states, effects, keeps and shapes; the team card, banner and plinths are projector only.
    # The maps (land/phone/map-*.webp) come straight from the art build at 0.75 scale and serve both screens.
    "land": [
        "background", "felt-tile", "tray-wood", "grass-1", "grass-2", "grass-3", "grass-4", "claimed-1",
        "claimed-2", "claimed-3", "state-blocked", "state-guarded", "state-selected", "cost-2", "cost-blank", "keep",
        "keep-flag-tint", "keep-red", "keep-blue", "keep-yellow", "keep-cyan", "keep-purple", "keep-pink", "keep-out",
        "place-pop", "capture-flash", "shape-circle", "shape-square", "shape-triangle", "shape-diamond", "shape-star", "shape-heart",
        "compass-rose",
    ],
}


def avatar_ids(list_name: str) -> list[str]:
    """The ids of one of the lists in src/shared/avatars.ts, in order."""
    source = (ROOT / "src/shared/avatars.ts").read_text()
    body = re.search(rf"export const {list_name} = \[(.*?)\] as const", source, re.S)
    if not body:
        raise SystemExit(f"{list_name} not found in src/shared/avatars.ts")
    return [i for i in re.findall(r'id: "(\w+)"', body.group(1)) if i != "none"]


def save(im: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(exist_ok=True)
    im.save(dest, "WEBP", quality=QUALITY, method=6)
    print(f"{dest.relative_to(ROOT)}: {im.width}x{im.height}, {dest.stat().st_size // 1024} KB")


def sheet(ids: list[str], name: str) -> None:
    step = CELL + 2 * GUTTER
    rows = -(-len(ids) // SHEET_COLS)
    out = Image.new("RGBA", (SHEET_COLS * step, rows * step), (0, 0, 0, 0))
    for i, id_ in enumerate(ids):
        im = Image.open(ART / "avatar" / f"{id_}.webp").convert("RGBA").resize((CELL, CELL), Image.LANCZOS)
        out.paste(im, ((i % SHEET_COLS) * step + GUTTER, (i // SHEET_COLS) * step + GUTTER))
    save(out, ART / "avatar" / f"{name}.webp")


def main() -> None:
    sheet(avatar_ids("AVATARS"), "phone-faces")
    sheet(avatar_ids("ACCESSORIES"), "phone-gear")
    for folder, names in HALF_SIZE.items():
        for name in names:
            im = Image.open(ART / folder / f"{name}.webp")
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            save(im.resize((round(im.width / 2), round(im.height / 2)), Image.LANCZOS), ART / folder / "phone" / f"{name}.webp")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Package transparent Toybox Clay sprites into the shared avatar coordinate system.

Needs Pillow. Generated art is never repainted or chroma-keyed here: this only
crops empty alpha, resizes and places each sprite, then writes WebPs and previews.
Run after generation with: python3 scripts/avatar-clay-art.py
"""
import argparse
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts/avatar-art-clay"
OUT = ROOT / "src/client/shared/avatar"
PREVIEW = ROOT / "output/christmas-clay"
SIZE = 512


def load_sprite(item):
    path = SOURCE / "sources" / f"{item['id']}.webp"
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    if alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 250:
        raise ValueError(f"{path}: expected a transparent background and opaque subject")
    # Ignore near-invisible antialiasing when finding the visible bounds.
    box = alpha.point(lambda a: 255 if a > 12 else 0).getbbox()
    if box is None:
        raise ValueError(f"{path}: empty sprite")
    return image.crop(box)


def place(sprite, width, height, center_x, anchor_y, pin="mid", stretch=False):
    if stretch:
        # Headband openings need an independent width, while cups and antlers
        # stay at the same height on the shared face coordinate system.
        size = (round(width * SIZE), round(height * SIZE))
    else:
        scale = min(width * SIZE / sprite.width, height * SIZE / sprite.height)
        size = (round(sprite.width * scale), round(sprite.height * scale))
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    left = round(center_x * SIZE - sprite.width / 2)
    top = round(anchor_y * SIZE - sprite.height * {"mid": 0.5, "bottom": 1, "top": 0}[pin])
    if left < 0 or top < 0 or left + sprite.width > SIZE or top + sprite.height > SIZE:
        raise ValueError("Sprite seating would clip the art")
    image = Image.new("RGBA", (SIZE, SIZE))
    image.alpha_composite(sprite, (left, top))
    return image


def seat(item):
    sprite = load_sprite(item)
    if item["type"] == "face" and "eyes" in item:
        # Measured source landmarks keep glasses level across ears, antlers,
        # hair and beards. Fit all visible art without clipping any silhouette.
        left_eye, right_eye, eye_y = item["eyes"]
        scale = min(.24 * SIZE / ((right_eye - left_eye) * sprite.width),
                    .94 * SIZE / sprite.width,
                    (.52 - .04) * SIZE / (eye_y * sprite.height),
                    (.89 - .52) * SIZE / ((1 - eye_y) * sprite.height))
        fitted = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.Resampling.LANCZOS)
        x = round(.5 * SIZE - (left_eye + right_eye) / 2 * fitted.width)
        y = round(.52 * SIZE - eye_y * fitted.height)
        if x < 0 or y < 0 or x + fitted.width > SIZE or y + fitted.height > SIZE:
            raise ValueError(f"{item['id']}: face would be clipped")
        image = Image.new("RGBA", (SIZE, SIZE))
        image.alpha_composite(fitted, (x, y))
        return image
    # Layout values can be overridden per item after checking worn previews.
    layouts = {
        "face": (.88, .72, .5, .54, "mid"),
        "hat": (.68, .30, .5, .32, "bottom"),
        "band": (.91, .58, .5, .08, "top"),
        "scarf": (.72, .22, .5, .79, "top"),
        "side": (.25, .25, .77, .30, "mid"),
        "glasses": (.62, .26, .5, .52, "mid"),
        "bow": (.44, .18, .5, .96, "bottom"),
        "hand": (.27, .34, .82, .93, "bottom"),
        "crown": (.70, .27, .5, .32, "bottom"),
    }
    return place(sprite, *item.get("layout", layouts[item["type"]]), stretch=item.get("stretch", False))


def contact(items, layers, title, path, gear=None):
    cols, cell, label = 5, 200, 48 if gear else 30
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, 64 + rows * (cell + label)), "#f8f1e7")
    draw = ImageDraw.Draw(sheet)
    font_path = "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"
    try:
        font = ImageFont.truetype(font_path, 14)
        small_font = ImageFont.truetype(font_path, 12)
        heading = ImageFont.truetype(font_path, 26)
    except OSError:
        font = small_font = heading = ImageFont.load_default()
    draw.text((20, 18), title, fill="#60332b", font=heading)
    for i, item in enumerate(items):
        layer = layers[item["id"]].copy()
        name = item["name"]
        if not gear and item["type"] != "face":
            layer = place(load_sprite(item), .78, .78, .5, .5)
        if gear:
            extra, extras = gear
            accessory = extra[i % len(extra)]
            layer.alpha_composite(extras[accessory["id"]])

        x, y = (i % cols) * cell, 64 + (i // cols) * (cell + label)
        layer = layer.resize((cell, cell), Image.Resampling.LANCZOS)
        sheet.paste(layer, (x, y), layer)
        draw.text((x + 5, y + cell + 2), name, fill="#60332b", font=font)
        if gear:
            text = "+ " + accessory["name"]
            label_font = small_font if draw.textlength(text, font=font) > cell - 10 else font
            draw.text((x + 5, y + cell + 20), text, fill="#60332b", font=label_font)
    sheet.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="Only re-encode these runtime layers; rebuild affected phone sheets and all previews")
    args = parser.parse_args()
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    faces = [item for item in manifest["assets"] if item["type"] == "face"]
    gear = [item for item in manifest["assets"] if item["type"] != "face"]
    if len(faces) != 20 or len(gear) != 20:
        raise ValueError("Expected exactly 20 characters and 20 accessories")
    selected = set(args.only or [item["id"] for item in manifest["assets"]])
    unknown = selected - {item["id"] for item in manifest["assets"]}
    if unknown:
        parser.error(f"Unknown asset IDs: {sorted(unknown)}")
    layers = {}
    for item in manifest["assets"]:
        image = seat(item)
        if item["id"] in selected:
            dest = OUT / f"{item['id']}.webp"
            temporary = dest.with_suffix(".tmp.webp")
            image.save(temporary, "WEBP", quality=90, method=6)
            temporary.replace(dest)
        layers[item["id"]] = image
    # Reuse the phone atlas builder without rebuilding unrelated game artwork.
    spec = importlib.util.spec_from_file_location("phone_art", ROOT / "scripts/phone-art.py")
    phone = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(phone)
    if any(item["id"] in selected for item in faces) or not (OUT / "phone-faces.webp").exists():
        phone.sheet(phone.avatar_ids("AVATARS"), "phone-faces")
    if any(item["id"] in selected for item in gear) or not (OUT / "phone-gear.webp").exists():
        phone.sheet(phone.avatar_ids("ACCESSORIES"), "phone-gear")
    PREVIEW.mkdir(parents=True, exist_ok=True)
    contact(faces, layers, "Toybox Clay — 20 Christmas characters", PREVIEW / "characters.png")
    contact(gear, layers, "Toybox Clay — 20 Christmas accessories", PREVIEW / "accessories.png")
    contact(faces, layers, "Toybox Clay — mix and match", PREVIEW / "combinations.png", (gear, layers))
    for id_ in ("earmuffs", "reindeerband"):
        accessory = next(item for item in gear if item["id"] == id_)
        contact(faces, layers, f"Toybox Clay — {accessory['name']} fit on all 20 avatars",
                PREVIEW / f"{id_}-fit.png", ([accessory], layers))
    print(f"Packaged {len(faces)} characters and {len(gear)} accessories; previews: {PREVIEW}")


if __name__ == "__main__":
    main()

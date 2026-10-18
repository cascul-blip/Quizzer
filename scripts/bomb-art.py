#!/usr/bin/env python3
"""Turns the generated Bomb Squad pictures in scripts/bomb-art/ into the WebPs the client
loads from src/client/shared/bomb/ (here: /workspace/quizzer-art/bomb/). Needs Pillow and
numpy. The WebPs are committed, so a normal build does not run this.

    python3 scripts/bomb-art.py [--src DIR] [--out DIR] [preview.png]

Also writes manifest.md next to the outputs: every file, its size, alpha, blend mode,
layer order and the coordinates the code needs (clock-face rectangle, module bay, LED
sockets, wire terminals, keypad display, picture window), in px and %.

Style: "A", the gritty disposal room (style-reference.png = bomb/mockups/style-a.png). Every
generation below used it as the style reference. Keying: green (#00ff00) or blue (#0000ff)
screens are keyed by colour distance; the fireball and sparks were made on black and are
keyed by brightness (they look right drawn normally, and best with screen/lighter blending).

Prompts (Grok Imagine, 1280x720 JPG):
bench.jpg (image-to-image from style-reference.png):
  "Edit this image: keep the exact same gritty dimly lit bomb-disposal room, the same harsh
   overhead lamp, the same battered steel workbench, camera angle, lighting, haze, teal
   shadows and semi-realistic painted cinematic style, but remove the metal device
   completely: the middle of the workbench is now empty, clear scuffed steel bench top where
   something will be placed later, keep the tools at the front edges of the bench. No
   people, no text."
bench-scorched.jpg (image-to-image from bench.jpg):
  "Edit this image: the exact same dimly lit bomb-disposal room, same camera angle, same
   overhead lamp, same workbench and composition, same semi-realistic painted cinematic
   style, but now just after a blast: the middle of the steel bench top is blackened and
   scorched with a big dark soot burn mark radiating outward, warped buckled metal,
   scattered small scorched metal fragments, bits of melted wire and broken circuit board
   pieces on the bench, lingering grey smoke haze in the air, a few glowing orange embers,
   the lamp still hanging and swinging slightly, soot on the wall behind. No people, no
   fire, no gore, no text."
casing.jpg (style reference):
  "Semi-realistic painted cinematic movie-prop asset in the same style, materials and
   lighting as the reference image: the scuffed dark riveted steel casing of the device,
   seen straight on from the front with only a very slight top view, a wide rectangular box
   with heavy bolted corners, at the top centre a recessed rectangular digital clock window
   with a completely BLANK dark glass face (no digits, no numbers, unlit), below it a large
   empty recessed rectangular bay across the whole front, plain dark metal inside the bay,
   nothing mounted in it, a little exposed green circuit board and a few coloured wires
   peeking out at the left side, harsh warm top light, teal shadows, isolated on a
   perfectly flat plain pure green (#00ff00) background, no shadow on the background, no
   text, no digits"
panels.jpg (style reference; one generation so the three panels match):
  "Three matching square module panels side by side in a row with clear empty space between
   them, all exactly the same size and same scuffed dark riveted steel plate with four bolts
   in the corners, straight-on front view, semi-realistic painted cinematic movie-prop style
   matching the reference image, each panel has the same row of four small empty round LED
   sockets along its top edge. Left panel: a wire module, a recessed dark rectangular slot
   in the middle with a row of four brass terminal posts along the top of the slot and four
   along the bottom, no wires. Middle panel: a keypad module with a 3 by 4 grid of worn
   metal number keys and a small blank dark display above the keys. Right panel: a picture
   module, a large empty recessed square window frame with a plain flat dark grey inside.
   Harsh warm top light, teal shadows, isolated on a perfectly flat plain pure green
   (#00ff00) background, no text, no numbers on the display"
  (The model labelled the keys 1 2 3 4 / 4 5 6 9 / * 8 9 #; this script paints the labels
   out and re-letters them 1 2 3 4 / 5 6 7 8 / * 9 0 #.)
lights.jpg:
  "Three identical small round indicator lights side by side with empty space between them,
   each a chrome bezel ring around a domed glass LED lens, straight-on front view,
   semi-realistic painted movie-prop style, all exactly the same size: left one switched off
   with a dark smoky grey lens, middle one glowing bright green, right one glowing bright
   red, small soft glow, isolated on a perfectly flat plain pure blue (#0000ff) background,
   no text"
wires.jpg:
  "Two electrical wires side by side, each running straight vertically from top to bottom
   with a gentle slight curve, both with bright flat magenta (#ff00ff) rubber insulation and
   small bare copper ends with crimped brass connectors at the very top and very bottom,
   both exactly the same length and thickness. Left wire: whole and intact. Right wire: cut
   clean through in the middle, the two halves pulled slightly apart with frayed bare copper
   strands sticking out of each cut end. Semi-realistic painted movie-prop style,
   straight-on view, soft top light, isolated on a perfectly flat plain pure green (#00ff00)
   background, no text"
cutters.jpg:
  "A pair of wire cutters, open jaws, worn steel head and red rubber grip handles, angled
   diagonally with the jaws at the top right, semi-realistic painted movie-prop style with
   harsh warm top light and cool shadows, whole tool visible and centred, isolated on a
   perfectly flat plain pure green (#00ff00) background, no shadow, no text"
sparks.jpg:
  "A burst of bright electrical sparks, many thin glowing white-hot and yellow-orange spark
   streaks shooting outward from one small bright point in the centre, a few tiny glowing
   particles, semi-realistic cinematic visual effect element, on a perfectly plain pure
   black background, no objects, no text"
fireball.jpg:
  "A huge round explosion fireball seen from the front, a billowing ball of bright orange,
   yellow and white-hot fire with darker red edges and curling flame tongues, glowing
   intensely, centred with empty space around it, semi-realistic cinematic visual effect
   element, on a perfectly plain pure black background, no smoke column, no ground, no
   objects, no text"
smoke.jpg:
  "A large billowing cloud of thick dark grey and charcoal smoke, round puffy rolling smoke
   shapes with soft lighter grey highlights on top, a wide roughly circular cloud centred
   with empty space around it, semi-realistic cinematic visual effect element, isolated on a
   perfectly flat plain pure green (#00ff00) background, no fire, no ground, no objects, no
   text"
debris.jpg:
  "Flying debris from an exploded metal device, spread out in a wide ring around an empty
   centre: about twenty separate scorched fragments of dark riveted steel plate, twisted
   bolts, broken pieces of green circuit board, short bits of coloured wire, a few small
   glowing orange embers, all separate pieces not touching, semi-realistic cinematic visual
   effect element, isolated on a perfectly flat plain pure green (#00ff00) background, no
   people, no fire, no text"
confetti.jpg:
  "Celebration confetti falling, about forty separate small paper confetti pieces and curly
   streamers in red, blue, yellow, orange, purple and white, some flat rectangles and some
   curled ribbons, tumbling at different angles, spread evenly across the whole picture with
   gaps between pieces, none touching, semi-realistic with soft shading, isolated on a
   perfectly flat plain pure green (#00ff00) background, no green confetti, no text"
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SRC_DEFAULT = HERE / "bomb-art"
OUT_DEFAULT = HERE.parent / "bomb"

# ---- names and sizes: change these when the client wants other ones -------------------
BENCH = {"bench": "bench", "bench-scorched": "bench-scorched"}  # source -> output
BENCH_SIZE = (1344, 768)  # same as cup/saloon.webp and dragon/cave.webp
CASING = ("casing", "casing", 760)  # (source, output, width); a soft contact shadow is added
PANELS = ("panels", ["module-wire", "module-keypad", "module-picture"], (360, 372))  # left to right
LIGHTS = ("lights", ["light-off", "light-green", "light-red"], 96)  # square
WIRES = ("wires", ["wire", "wire-cut"], 640)  # height; each also gets a "-tint" mask
CUTTERS = ("cutters", "cutters", 320)  # phone only: written straight to phone/
SPARKS = ("sparks", "sparks", 512)
FIREBALL = ("fireball", "explosion-fireball", 1024)
SMOKE = ("smoke", "explosion-smoke", 1100)
DEBRIS = ("debris", "explosion-debris", BENCH_SIZE)
CONFETTI = ("confetti", "confetti", BENCH_SIZE)
# Half-size phone copies (spec "Phone" column). Cutters are phone-only (see CUTTERS).
PHONE = {"casing", "module-wire", "module-keypad", "wire", "wire-tint", "wire-cut", "wire-cut-tint",
         "light-off", "light-green", "light-red", "sparks", "confetti"}
QUALITY = 86
KEY_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "*", "9", "0", "#"]

# ---- measured on the sources (source px, 1280x720) -----------------------------------
CLOCK = (482, 216, 698, 314)  # blank clock glass in casing.jpg (inner edge of the bezel)
BAY = (480, 370, 984, 501)  # recessed module bay in casing.jpg (inner edge)
# Per panel, relative to that panel's own bounding box in panels.jpg:
LEDS = {  # four LED sockets, centres; ring outer diameter ~30 source px
    "module-wire": [(87, 40), (156, 40), (223, 40), (286, 40)],
    "module-keypad": [(85, 40), (150, 40), (215, 40), (280, 40)],
    "module-picture": [(84, 40), (150, 40), (216, 40), (284, 40)],
}
LED_RING = 30
TERMINALS_TOP = [(87, 148), (152, 148), (219, 148), (287, 148)]  # wire panel, brass posts
TERMINALS_BOTTOM = [(88, 258), (152, 258), (220, 258), (287, 258)]
KEYPAD_DISPLAY = (86, 105, 284, 172)  # keypad panel, blank display glass
KEY_CENTRES = [(x, y) for y in (210, 260, 310) for x in (104, 158, 211, 265)]  # keypad panel
KEY_LABEL_BOX = 15  # half-size of the label area painted out on each key
PICTURE_WINDOW = (71, 94, 304, 325)  # picture panel, inner window
WIRE_LUG = (47, 666)  # y of the top and bottom ring-lug hole centres in wires.jpg


def key_out(im: Image.Image, protect_inside: bool = True) -> Image.Image:
    """Flat colour screen -> RGBA. Alpha from distance to the key and from how much the key's
    own channel sticks out; the soft rim is un-mixed from the key so it carries no spill.
    Only the rim is despilled, so green circuit boards and a green LED inside keep colour."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    samples = np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4], rgb[3, w // 2], rgb[h // 2, 3], rgb[h // 2, -4]])
    key = np.median(samples, axis=0)
    c = int(np.argmax(key))
    others = [i for i in range(3) if i != c]
    spill = rgb[..., c] - np.maximum(rgb[..., others[0]], rgb[..., others[1]])
    key_spill = key[c] - max(key[others[0]], key[others[1]])
    dist = np.sqrt(((rgb - key) ** 2).sum(-1))
    a1 = np.clip((dist - 45) / (115 - 45), 0, 1)
    a2 = np.clip((key_spill * 0.75 - spill) / (key_spill * 0.55), 0, 1)
    alpha = np.clip(np.maximum(a1, a2), 0, 1)
    alpha[dist < 30] = 0
    # The rim: anything within 3 px of the background.
    bg = Image.fromarray(((alpha < 0.5) * 255).astype(np.uint8))
    rim = np.asarray(bg.filter(ImageFilter.MaxFilter(7))) > 0
    fringe = rim & (alpha > 0.02)
    a = np.maximum(alpha, 0.35)[..., None]
    fixed = np.clip((rgb - key * (1 - alpha[..., None])) / a, 0, 255)
    rgb = np.where(fringe[..., None], fixed, rgb)
    lim = np.maximum(rgb[..., others[0]], rgb[..., others[1]])
    rgb[..., c] = np.where(fringe & (rgb[..., c] > lim), lim, rgb[..., c])
    alpha[alpha < 0.04] = 0
    rgb[alpha == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")


def glow_key(im: Image.Image) -> Image.Image:
    """Black screen -> alpha from brightness, colour un-premultiplied. Normal blending then
    equals adding the light; screen/lighter blending is also fine."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    floor = np.percentile(rgb.max(-1), 15)
    a = np.clip((rgb.max(-1) - floor) / (1 - floor), 0, 1)
    a = np.clip(a * 1.2, 0, 1)
    col = np.clip((rgb - floor * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0, 1)
    col[a < 0.01] = 0
    return Image.fromarray((np.dstack([col, a]) * 255).astype(np.uint8), "RGBA")


def smoke_key(im: Image.Image) -> Image.Image:
    """Grey smoke on green: alpha from how much green is left over (the smoke itself is
    neutral), colour un-mixed from the key and made fully grey, so soft edges carry no green."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    key = np.median(np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4]]), axis=0)
    excess = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    k = key[1] - max(key[0], key[2])
    alpha = np.clip(1 - excess / (k * 0.92), 0, 1)
    alpha = np.clip((alpha - 0.04) / 0.96, 0, 1)
    a = np.maximum(alpha, 0.05)[..., None]
    obj = np.clip((rgb - key * (1 - alpha[..., None])) / a, 0, 255)
    grey = np.clip(obj[..., [0, 2]].mean(-1), 0, 255)  # red and blue carry no key
    out = np.dstack([grey, grey * 0.99, grey * 1.02, alpha * 255])
    out[alpha == 0] = 0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def bbox(im: Image.Image, thresh: int = 24) -> tuple[int, int, int, int]:
    box = im.getchannel("A").point(lambda v: 255 if v > thresh else 0).getbbox()
    assert box
    return box


def crop(im: Image.Image, pad: int = 3) -> Image.Image:
    x0, y0, x1, y1 = bbox(im)
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit_w(im: Image.Image, w: int) -> Image.Image:
    return im.resize((w, round(im.height * w / im.width)), Image.Resampling.LANCZOS)


def fit_max(im: Image.Image, side: int) -> Image.Image:
    s = side / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.Resampling.LANCZOS)


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Centre-crop to the aspect, then scale (1280x720 -> 1260x720 -> 1344x768)."""
    tw, th = size
    w, h = im.size
    if w / h > tw / th:
        nw = round(h * tw / th)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * th / tw)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize(size, Image.Resampling.LANCZOS)


def magenta(rgb: np.ndarray) -> np.ndarray:
    hi, lo = rgb.max(-1), rgb.min(-1)
    sat = (hi - lo) / np.maximum(hi, 1e-6)
    return np.clip((np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]) / 0.25, 0, 1) * np.clip((sat - 0.3) / 0.3, 0, 1)


def tintable(im: Image.Image) -> tuple[Image.Image, Image.Image]:
    """(wire with the magenta insulation turned into translucent dark shading, white mask of
    the insulation). Same scheme as fight/castle-cloth and dragon/banner-cloth."""
    a = np.asarray(im).astype(np.float64) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    cloth = magenta(rgb) * (alpha > 0.3)
    cloth = np.asarray(Image.fromarray((cloth * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float64) / 255
    hi = rgb.max(-1)
    bright = np.percentile(hi[cloth > 0.8], 92) if (cloth > 0.8).any() else 1
    shade = 1 - np.clip(hi / bright, 0, 1)
    out_a = ((1 - cloth) + cloth * shade) * alpha
    premult = (1 - cloth)[..., None] * rgb * alpha[..., None]
    pic = np.dstack([premult / np.maximum(out_a, 1e-6)[..., None], out_a])
    mask = np.dstack([np.ones_like(rgb), cloth * alpha])
    to = lambda x: Image.fromarray(np.round(np.clip(x, 0, 1) * 255).astype(np.uint8), "RGBA")
    return to(pic), to(mask)


def tinted(pic: Image.Image, mask: Image.Image, colour: str) -> Image.Image:
    cell = Image.new("RGBA", pic.size, (0, 0, 0, 0))
    cell.paste(Image.new("RGBA", pic.size, colour), (0, 0), mask.getchannel("A"))
    cell.alpha_composite(pic)
    return cell


def relabel_keys(panel: Image.Image, scale: tuple[float, float]) -> Image.Image:
    """Paint out the generated key labels and letter them 1-8, *, 9, 0, # in a matching beige."""
    im = panel.copy()
    arr = np.asarray(im).copy()
    sx, sy = scale
    r = KEY_LABEL_BOX
    for (cx, cy) in KEY_CENTRES:
        x, y = cx * sx, cy * sy
        x0, y0, x1, y1 = int(x - r * sx), int(y - r * sy), int(x + r * sx), int(y + r * sy)
        ring = np.concatenate([arr[y0 - 3 : y0, x0:x1, :3].reshape(-1, 3), arr[y1 : y1 + 3, x0:x1, :3].reshape(-1, 3),
                               arr[y0:y1, x0 - 3 : x0, :3].reshape(-1, 3), arr[y0:y1, x1 : x1 + 3, :3].reshape(-1, 3)])
        top = np.median(arr[y0 - 3 : y0, x0:x1, :3].reshape(-1, 3), 0)
        bot = np.median(arr[y1 : y1 + 3, x0:x1, :3].reshape(-1, 3), 0)
        t = np.linspace(0, 1, y1 - y0)[:, None, None]
        fill = top * (1 - t) + bot * t
        noise = np.random.default_rng(cx * 7 + cy).normal(0, 3, (y1 - y0, x1 - x0, 1))
        arr[y0:y1, x0:x1, :3] = np.clip(fill + noise, 0, 255).astype(np.uint8)
        del ring
    im = Image.fromarray(arr, "RGBA")
    # Soften the patched squares into the key caps.
    soft = im.filter(ImageFilter.GaussianBlur(1.2))
    m = Image.new("L", im.size, 0)
    md = ImageDraw.Draw(m)
    for (cx, cy) in KEY_CENTRES:
        x, y = cx * sx, cy * sy
        md.rectangle((x - (r + 1) * sx, y - (r + 1) * sy, x + (r + 1) * sx, y + (r + 1) * sy), fill=255)
    im = Image.composite(soft, im, m.filter(ImageFilter.GaussianBlur(1.5)))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", round(23 * sx))
    except OSError:
        font = ImageFont.load_default()
    for (cx, cy), label in zip(KEY_CENTRES, KEY_LABELS):
        x, y = cx * sx, cy * sy
        d.text((x + 1, y + 1), label, font=font, anchor="mm", fill=(20, 16, 12, 200))
        d.text((x, y), label, font=font, anchor="mm", fill=(206, 196, 172, 255))
    return im


def add_contact_shadow(im: Image.Image) -> tuple[Image.Image, int]:
    """Extend the canvas downward and put a soft dark shadow under the casing's base.
    Returns (image, base y in px = where it sits on the bench)."""
    a = np.asarray(im.getchannel("A")) > 128
    rows = np.nonzero(a.any(1))[0]
    base = int(rows.max())
    cols = np.nonzero(a[base - 10 : base + 1].any(0))[0]
    pad = 40
    out = Image.new("RGBA", (im.width, im.height + pad), (0, 0, 0, 0))
    sh = Image.new("L", out.size, 0)
    ImageDraw.Draw(sh).ellipse((cols.min() - 20, base - 18, cols.max() + 20, base + 22), fill=200)
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 255))
    shadow.putalpha(sh)
    out.alpha_composite(shadow)
    out.alpha_composite(im)
    return out, base


def save(im: Image.Image, out: Path, name: str, files: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{name}.webp"
    im.save(dest, "WEBP", quality=QUALITY, method=6)
    files[name] = im.size
    print(f"{dest}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.0f} KB")
    if name in PHONE:
        small = im.resize((round(im.width / 2), round(im.height / 2)), Image.Resampling.LANCZOS)
        (out / "phone").mkdir(exist_ok=True)
        pd = out / "phone" / f"{name}.webp"
        small.save(pd, "WEBP", quality=80, method=6)
        files["phone/" + name] = small.size
        print(f"{pd}  {small.width}x{small.height}  {pd.stat().st_size / 1024:.0f} KB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=SRC_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("preview", nargs="?")
    args = ap.parse_args()
    src, out = args.src, args.out
    res: dict[str, Image.Image] = {}
    files: dict[str, tuple[int, int]] = {}
    coords: dict = {}

    for s, name in BENCH.items():
        res[name] = cover(Image.open(src / f"{s}.jpg").convert("RGB"), BENCH_SIZE)

    # Casing: key, crop, scale, contact shadow. Map the clock and bay rectangles through.
    k = key_out(Image.open(src / f"{CASING[0]}.jpg"))
    box = bbox(k)
    c = k.crop(box)
    s = CASING[2] / c.width
    c = fit_w(c, CASING[2])
    c, base = add_contact_shadow(c)
    res[CASING[1]] = c
    m = lambda r: tuple(round(v) for v in ((r[0] - box[0]) * s, (r[1] - box[1]) * s, (r[2] - box[0]) * s, (r[3] - box[1]) * s))
    coords["casing"] = {"size": c.size, "clock": m(CLOCK), "bay": m(BAY), "base_y": base}

    # Panels: one generation, split into three by their bounding boxes, each to PANEL size.
    k = key_out(Image.open(src / f"{PANELS[0]}.jpg"))
    a = np.asarray(k.getchannel("A")) > 128
    cols = np.nonzero(a.any(0))[0]
    runs, st, pv = [], cols[0], cols[0]
    for x in cols[1:]:
        if x != pv + 1:
            runs.append((st, pv))
            st = x
        pv = x
    runs.append((st, pv))
    runs = [r for r in runs if r[1] - r[0] > 100]
    assert len(runs) == 3, runs
    pw, ph = PANELS[2]
    coords["panels"] = {}
    for (x0, x1), name in zip(runs, PANELS[1]):
        rows = np.nonzero(a[:, x0 : x1 + 1].any(1))[0]
        pb = (x0, int(rows.min()), x1 + 1, int(rows.max()) + 1)
        p = k.crop(pb).resize((pw, ph), Image.Resampling.LANCZOS)
        sx, sy = pw / (pb[2] - pb[0]), ph / (pb[3] - pb[1])
        if name == "module-keypad":
            p = relabel_keys(p, (sx, sy))
        res[name] = p
        pc = {"leds": [(round(x * sx), round(y * sy)) for x, y in LEDS[name]], "led_diameter": round(LED_RING * sx)}
        if name == "module-wire":
            pc["terminals_top"] = [(round(x * sx), round(y * sy)) for x, y in TERMINALS_TOP]
            pc["terminals_bottom"] = [(round(x * sx), round(y * sy)) for x, y in TERMINALS_BOTTOM]
        if name == "module-keypad":
            pc["display"] = tuple(round(v) for v in (KEYPAD_DISPLAY[0] * sx, KEYPAD_DISPLAY[1] * sy, KEYPAD_DISPLAY[2] * sx, KEYPAD_DISPLAY[3] * sy))
        if name == "module-picture":
            pc["window"] = tuple(round(v) for v in (PICTURE_WINDOW[0] * sx, PICTURE_WINDOW[1] * sy, PICTURE_WINDOW[2] * sx, PICTURE_WINDOW[3] * sy))
        coords["panels"][name] = pc

    # Lights: three on blue, each centred on the same square canvas.
    k = key_out(Image.open(src / f"{LIGHTS[0]}.jpg"))
    w3 = k.width // 3
    parts = [crop(k.crop((i * w3, 0, (i + 1) * w3, k.height)), 2) for i in range(3)]
    # The lit green lens came with a cyan halo (key colour bleeding into its glow), which
    # also made its bezel look smaller. Trim it to a disc the size of the unlit bezels.
    bez = min(parts[0].width, parts[2].width, parts[0].height, parts[2].height) / 2
    g = parts[1]
    arr = np.asarray(g).astype(np.float32)
    al = arr[..., 3]
    ys, xs = np.nonzero(al > 250)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    yy, xx = np.mgrid[0:g.height, 0:g.width]
    d = np.hypot(yy - cy, xx - cx)
    arr[..., 3] = al * np.clip(bez * 0.965 - d + 0.5, 0, 1)
    ring = (d > bez * 0.8)[..., None]  # silver bezel rim: make it grey like the others
    grey = arr[..., :3].mean(-1, keepdims=True)
    arr[..., :3] = np.where(ring, grey, arr[..., :3])
    g = Image.fromarray(arr.astype(np.uint8), "RGBA")
    parts[1] = crop(g, 2)
    for i, name in enumerate(LIGHTS[1]):
        part = parts[i]
        side = max(part.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.alpha_composite(part, ((side - part.width) // 2, (side - part.height) // 2))
        res[name] = sq.resize((LIGHTS[2], LIGHTS[2]), Image.Resampling.LANCZOS)

    # Wires: whole (left half) and cut (right half) on one shared canvas: same lug heights.
    k = key_out(Image.open(src / f"{WIRES[0]}.jpg"))
    halves = [k.crop((0, 0, k.width // 2, k.height)), k.crop((k.width // 2, 0, k.width, k.height))]
    boxes = [bbox(hh) for hh in halves]
    y0 = min(b[1] for b in boxes) - 2
    y1 = max(b[3] for b in boxes) + 2
    wmax = max(b[2] - b[0] for b in boxes) + 6
    ws = WIRES[2] / (y1 - y0)
    for hh, b, name in zip(halves, boxes, WIRES[1]):
        cx = (b[0] + b[2]) // 2
        piece = hh.crop((cx - wmax // 2, y0, cx - wmax // 2 + wmax, y1))
        piece = piece.resize((round(wmax * ws), WIRES[2]), Image.Resampling.LANCZOS)
        pic, mask = tintable(piece)
        res[name], res[name + "-tint"] = pic, mask
    lug = [round((y - y0) * ws) for y in WIRE_LUG]
    coords["wire"] = {"size": res[WIRES[1][0]].size, "lug_top_y": lug[0], "lug_bottom_y": lug[1]}

    # Cutters: phone only.
    cut = fit_max(crop(key_out(Image.open(src / f"{CUTTERS[0]}.jpg"))), CUTTERS[2])

    # Effects.
    sp = crop(glow_key(Image.open(src / f"{SPARKS[0]}.jpg")), 0)
    side = max(sp.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(sp, ((side - sp.width) // 2, (side - sp.height) // 2))
    res[SPARKS[1]] = sq.resize((SPARKS[2], SPARKS[2]), Image.Resampling.LANCZOS)
    fb = crop(glow_key(Image.open(src / f"{FIREBALL[0]}.jpg")), 6)
    side = max(fb.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(fb, ((side - fb.width) // 2, (side - fb.height) // 2))
    res[FIREBALL[1]] = sq.resize((FIREBALL[2], FIREBALL[2]), Image.Resampling.LANCZOS)
    res[SMOKE[1]] = fit_max(crop(smoke_key(Image.open(src / f"{SMOKE[0]}.jpg")), 6), SMOKE[2])
    res[DEBRIS[1]] = key_out(Image.open(src / f"{DEBRIS[0]}.jpg")).resize(DEBRIS[2], Image.Resampling.LANCZOS)
    res[CONFETTI[1]] = key_out(Image.open(src / f"{CONFETTI[0]}.jpg")).resize(CONFETTI[2], Image.Resampling.LANCZOS)

    for name, im in res.items():
        save(im, out, name, files)
    (out / "phone").mkdir(parents=True, exist_ok=True)
    cut.save(out / "phone" / f"{CUTTERS[1]}.webp", "WEBP", quality=80, method=6)
    files["phone/" + CUTTERS[1]] = cut.size
    print(f"{out / 'phone' / CUTTERS[1]}.webp  {cut.width}x{cut.height}")

    write_manifest(out, files, coords)
    if args.preview:
        preview(args.preview, res, cut, coords)


def pct(v: float, total: float) -> str:
    return f"{100 * v / total:.1f}%"


def rect_line(r, size) -> str:
    w, h = size
    return (f"x {r[0]}–{r[2]}, y {r[1]}–{r[3]} px ({r[2] - r[0]}×{r[3] - r[1]}); "
            f"left {pct(r[0], w)}, top {pct(r[1], h)}, width {pct(r[2] - r[0], w)}, height {pct(r[3] - r[1], h)}")


def pts_line(pts, size) -> str:
    w, h = size
    return ", ".join(f"({x}, {y}) = ({pct(x, w)}, {pct(y, h)})" for x, y in pts)


SCENE_CASING_W = 740  # suggested drawn width of casing.webp on the 1344x768 bench
SCENE_BASE = (672, 640)  # suggested bench point (px) under the casing's base, bottom-centre


def write_manifest(out: Path, files: dict, coords: dict) -> None:
    cs = coords["casing"]
    W, H = cs["size"]
    p = coords["panels"]
    pw, ph = PANELS[2]
    wire = coords["wire"]
    sz = lambda n: f"{files[n][0]}×{files[n][1]}" if n in files else "–"
    rows = [
        ("bench", "no (opaque)", "normal", "0 (back)", "the room, empty bench. Phone: no"),
        ("bench-scorched", "no (opaque)", "normal", "0 (back)", "swap in for bench after the explosion (same framing)"),
        ("casing", "yes", "normal", "1", "the bomb; blank clock; module bay; contact shadow baked in. Phone copy (Race)"),
        ("module-wire", "yes", "normal", "2", "panel in the bay; wires drawn on top. Phone copy"),
        ("module-keypad", "yes", "normal", "2", "panel in the bay. Phone copy"),
        ("module-picture", "yes", "normal", "2", "panel in the bay; the question picture goes in its window. No phone copy"),
        ("wire / wire-cut", "yes", "normal", "3", "one wire, tinted per colour (see Tinting). Phone copies"),
        ("wire-tint / wire-cut-tint", "mask", "mask", "3 (under the wire)", "white where the insulation is"),
        ("light-off / light-green / light-red", "yes", "normal", "3", "LEDs over the panel sockets. Phone copies"),
        ("sparks", "yes (glow)", "normal or screen/lighter", "4", "on a wrong or right cut, at the wire. Phone copy"),
        ("explosion-smoke", "yes", "normal", "5", "behind the fireball, grows and darkens, lingers"),
        ("explosion-fireball", "yes (glow)", "screen/lighter (normal also OK)", "6", "scale up from the bomb's centre, fade out"),
        ("explosion-debris", "yes", "normal", "7", "full-frame ring of pieces around the centre; scale outward from the centre"),
        ("confetti", "yes", "normal", "8 (front)", "Defused; full frame; drift down. Phone copy"),
        ("phone/cutters", "yes", "normal", "phone UI", "phone only, the Cut button icon"),
    ]
    L = []
    L.append("# Bomb Squad art manifest\n")
    L.append("Style A (gritty disposal room). Made by `scripts/bomb-art.py` from the sources in `scripts/bomb-art/` "
             "(prompts in the script). Phone copies (`phone/`) are half size unless noted. All coordinates are in the "
             "file's own pixels, top-left origin; % is of that file's width/height. The flash and the screen shake are "
             "not images (draw them in code); the clock digits are not painted (draw them in code).\n")
    L.append("## Files\n")
    L.append("| File | Size | Phone copy | Alpha | Blend | Layer | Use |")
    L.append("|---|---|---|---|---|---|---|")
    for name, alpha, blend, layer, use in rows:
        names = [n.strip() for n in name.split("/")] if not name.startswith("phone/") else [name]
        size = ", ".join(sz(n) for n in names)
        phone = ", ".join(sz("phone/" + n) for n in names if ("phone/" + n) in files) or "–"
        if name.startswith("phone/"):
            size, phone = "–", sz(name)
        L.append(f"| `{name}.webp` | {size} | {phone} | {alpha} | {blend} | {layer} | {use} |")
    L.append("")
    L.append("Layer order, back to front: bench → casing → module panels → wires and LEDs → sparks → "
             "(explosion) smoke → fireball → debris → code-drawn white flash → (defused) confetti. "
             "During the explosion, swap bench for bench-scorched under the flash and hide the casing and panels.\n")
    L.append("## Placing the casing on the bench\n")
    L.append(f"Suggested: draw `casing.webp` {SCENE_CASING_W} px wide on the 1344×768 bench "
             f"(scale {SCENE_CASING_W / W:.3f}), with its base line (y = {cs['base_y']} px = {pct(cs['base_y'], H)} of the "
             f"casing) at bench point {SCENE_BASE} px ({pct(SCENE_BASE[0], 1344)}, {pct(SCENE_BASE[1], 768)}), horizontally "
             f"centred. The shadow under the base is part of the image. That puts the casing's centre, and the explosion "
             f"centre, near bench ({SCENE_BASE[0]}, {round(SCENE_BASE[1] - cs['base_y'] * SCENE_CASING_W / W / 2)}).\n")
    L.append(f"## casing.webp ({W}×{H})\n")
    L.append(f"* **Clock face** (blank glass; draw the red digits inside): {rect_line(cs['clock'], cs['size'])}")
    L.append(f"* **Module bay** (put the module panels inside, in a row, scaled to the bay height): {rect_line(cs['bay'], cs['size'])}")
    L.append(f"* **Base line** (sits on the bench): y = {cs['base_y']} px ({pct(cs['base_y'], H)})\n")
    bw, bh = cs["bay"][2] - cs["bay"][0], cs["bay"][3] - cs["bay"][1]
    L.append(f"The bay is {bw}×{bh} px: 3 panels side by side at the bay's height fit with gaps "
             f"({round(bh * pw / ph)} px wide each). For 4 panels, scale them to fit the bay width. For more modules than "
             "fit (Together with several squads), the spec doesn't say; suggested: a second row (scale panels down) or one "
             "casing per squad.\n")
    L.append(f"## Module panels ({pw}×{ph} each, same canvas, so they swap)\n")
    for name, pc in p.items():
        L.append(f"### {name}.webp")
        L.append(f"* **LED sockets** (centres, left to right; ring {pc['led_diameter']} px across; draw `light-*.webp` "
                 f"about {pc['led_diameter'] + 6} px wide centred on each): {pts_line(pc['leds'], (pw, ph))}")
        L.append("  Use the first N sockets for a module with N wires (2–4); leave the rest off.")
        if "terminals_top" in pc:
            L.append(f"* **Wire terminals, top row**: {pts_line(pc['terminals_top'], (pw, ph))}")
            L.append(f"* **Wire terminals, bottom row**: {pts_line(pc['terminals_bottom'], (pw, ph))}")
            L.append("  Wire i runs from top terminal i to bottom terminal i. With 2 or 3 wires, use terminals 1–2 or 1–3, "
                     "or the middle ones; the unused brass posts stay empty.")
        if "display" in pc:
            L.append(f"* **Display glass** (blank; the typed answer can be drawn here): {rect_line(pc['display'], (pw, ph))}")
            L.append("* Keys are lettered 1 2 3 4 / 5 6 7 8 / * 9 0 # (decorative; typing happens on the phones).")
        if "window" in pc:
            L.append(f"* **Picture window** (draw the question picture inside, clipped to it): {rect_line(pc['window'], (pw, ph))}")
        L.append("")
    ww, wh = wire["size"]
    L.append(f"## Wires ({ww}×{wh}; wire and wire-cut share the canvas)\n")
    L.append(f"* Ring-lug hole centres: top y = {wire['lug_top_y']} px ({pct(wire['lug_top_y'], wh)}), bottom y = "
             f"{wire['lug_bottom_y']} px ({pct(wire['lug_bottom_y'], wh)}), both at x = {ww // 2} px (50%).")
    L.append("* To hang a wire between two terminals: scale it so the lug-to-lug distance equals the terminal distance, "
             "and place the top lug centre on the top terminal. Swap `wire` for `wire-cut` on a cut; nothing moves.")
    L.append("* **Tinting**: fill `wire-tint.webp` (white = insulation) with the wire colour, then draw `wire.webp` on top "
             "at the same box. SVG: `<mask><image href=tint/></mask><rect fill=COLOUR mask=…/><image href=wire/>`; CSS: "
             "`background: COLOUR; mask-image: url(wire-tint.webp); mask-size: 100% 100%` under an `<img src=wire.webp>`. "
             "The copper ends and brass lugs stay their own colour. Same for `wire-cut` with `wire-cut-tint`.\n")
    L.append("## Effects\n")
    L.append(f"* `sparks.webp` {sz('sparks')}: centre of the burst = image centre. Glow alpha (brightness), so normal "
             "blending looks right; `mix-blend-mode: screen` (canvas `lighter`) is a touch brighter.")
    L.append(f"* `explosion-fireball.webp` {sz('explosion-fireball')}: centre = image centre. Glow alpha; best with "
             "screen/lighter. Suggested: scale 0.2 → 1.4 over ~0.6 s from the casing centre, fade out by ~1.2 s.")
    L.append(f"* `explosion-smoke.webp` {sz('explosion-smoke')}: normal alpha (dark smoke must darken, so not additive). "
             "Centre = image centre; start with the fireball, grow slowly, fade over ~3 s.")
    L.append(f"* `explosion-debris.webp` {sz('explosion-debris')}: full frame, normal alpha; the pieces ring the image "
             "centre. Scale it up from ~0.3 to ~1.3 around the casing centre while fading, and/or rotate slightly.")
    L.append(f"* `confetti.webp` {sz('confetti')}: full frame, normal alpha. Loop two copies falling at different "
             "speeds, or draw in code.")
    L.append("")
    (out / "manifest.md").write_text("\n".join(L))
    print(out / "manifest.md")


def preview(path: str, res: dict, cut: Image.Image, coords: dict) -> None:
    W, M = 1800, 20
    cs = coords["casing"]

    def scene(bench: str, explosion: float | None = None, modules: bool = True, wires_cut: int = 1) -> Image.Image:
        sc = res[bench].convert("RGBA").copy()
        if explosion is None or explosion < 0.25:
            c = res["casing"].copy()
            if modules:
                bx0, by0, bx1, by1 = cs["bay"]
                bh = by1 - by0 - 10
                pw, ph = PANELS[2]
                k = bh / ph
                cw = round(pw * k)
                gap = ((bx1 - bx0) - 3 * cw) // 4
                for i, name in enumerate(PANELS[1]):
                    p = res[name].copy()
                    pc = coords["panels"][name]
                    if name == "module-wire":
                        colours = ["#e21b3c", "#1368ce", "#f2c200", "#26890c"]
                        wsrc = coords["wire"]
                        for j in range(3):
                            (tx, ty), (bx, by) = pc["terminals_top"][j], pc["terminals_bottom"][j]
                            nm = "wire-cut" if j < wires_cut else "wire"
                            wpic = tinted(res[nm], res[nm + "-tint"], colours[j])
                            span = by - ty
                            s = span / (wsrc["lug_bottom_y"] - wsrc["lug_top_y"])
                            wpic = wpic.resize((max(1, round(wpic.width * s)), round(wpic.height * s)), Image.Resampling.LANCZOS)
                            p.alpha_composite(wpic, (round(tx - wpic.width / 2), round(ty - wsrc["lug_top_y"] * s)))
                    d = pc["led_diameter"] + 6
                    states = {"module-wire": ["light-green", "light-off", "light-off", "light-off"],
                              "module-keypad": ["light-off"] * 4, "module-picture": ["light-red", "light-off", "light-off", "light-off"]}[name]
                    for (lx, ly), st in zip(pc["leds"], states):
                        p.alpha_composite(res[st].resize((d, d), Image.Resampling.LANCZOS), (lx - d // 2, ly - d // 2))
                    p = p.resize((cw, bh), Image.Resampling.LANCZOS)
                    c.alpha_composite(p, (bx0 + gap + i * (cw + gap), by0 + 5))
            # Clock digits, as the code would draw them.
            dr = ImageDraw.Draw(c)
            x0, y0, x1, y1 = cs["clock"]
            try:
                f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", round((y1 - y0) * 0.7))
            except OSError:
                f = ImageFont.load_default()
            dr.text(((x0 + x1) / 2, (y0 + y1) / 2), "04:59", font=f, anchor="mm", fill=(255, 40, 30, 255))
            s = SCENE_CASING_W / c.width
            c = c.resize((SCENE_CASING_W, round(c.height * s)), Image.Resampling.LANCZOS)
            sc.alpha_composite(c, (SCENE_BASE[0] - c.width // 2, round(SCENE_BASE[1] - cs["base_y"] * s)))
        if explosion is not None:
            ctr = (SCENE_BASE[0], round(SCENE_BASE[1] - cs["base_y"] * SCENE_CASING_W / cs["size"][0] / 2))
            t = explosion
            def put(name, scale, alpha):
                im = res[name]
                im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
                if alpha < 1:
                    a = np.asarray(im).copy()
                    a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
                    im = Image.fromarray(a, "RGBA")
                sc.alpha_composite(im, (ctr[0] - im.width // 2, ctr[1] - im.height // 2))
            put("explosion-smoke", 0.4 + 0.6 * t, min(1, 0.4 + t))
            put("explosion-fireball", 0.25 + 0.75 * t, max(0, 1.1 - t * 0.6))
            put("explosion-debris", 0.3 + 0.9 * t, max(0, 1 - t * 0.5))
        return sc

    rows = []
    rows.append(("1. Assembled scene: bench + casing (blank clock, digits drawn here as the code would) + 3 panels (wire module: 1 of 3 wires cut, tinted; keypad; picture) + LEDs", [scene("bench")], 560))
    rows.append(("2. Explosion sequence over the scene (code adds the white flash and shake): t=0.15, 0.35, 0.6, 0.9, then bench-scorched", [scene("bench", 0.15), scene("bench", 0.35), scene("bench-scorched", 0.6), scene("bench-scorched", 0.9), res["bench-scorched"]], 200))
    rows.append(("3. bench | bench-scorched | casing alone (clock rect = red box, bay = yellow box)", [res["bench"], res["bench-scorched"], annotated_casing(res["casing"], cs)], 300))
    pan = [annotated_panel(res[n], coords["panels"][n]) for n in PANELS[1]]
    rows.append(("4. module-wire | module-keypad | module-picture (cyan = LED sockets, magenta = terminals, yellow = display / window) | the same unmarked", pan + [res[n] for n in PANELS[1]], 300))
    wires = [res["wire"], res["wire-tint"], res["wire-cut"], res["wire-cut-tint"]] + [tinted(res["wire"], res["wire-tint"], c) for c in ("#e21b3c", "#1368ce", "#f2c200", "#26890c", "#ffffff", "#222222")] + [tinted(res["wire-cut"], res["wire-cut-tint"], c) for c in ("#e21b3c", "#1368ce")]
    rows.append(("5. wire | wire-tint | wire-cut | wire-cut-tint | tinted: red, blue, yellow, green, white, black | cut red, blue", wires, 260))
    rows.append(("6. light-off | light-green | light-red | sparks | phone/cutters | explosion-fireball | explosion-smoke", [res["light-off"], res["light-green"], res["light-red"], res["sparks"], cut, res["explosion-fireball"], res["explosion-smoke"]], 220))
    rows.append(("7. explosion-debris (full frame) | confetti (full frame), on dark grey", [on(res["explosion-debris"], (40, 40, 44)), on(res["confetti"], (40, 40, 44))], 300))
    H = sum(h + 34 + M for _, _, h in rows) + M
    sheet = Image.new("RGBA", (W, H), (24, 26, 30, 255))
    dr = ImageDraw.Draw(sheet)
    y = M
    for title, cells, h in rows:
        dr.text((M, y + 10), title, fill=(255, 210, 63, 255))
        y += 34
        scaled = []
        for c in cells:
            c = c.copy()
            c.thumbnail((100000, h))
            scaled.append(c)
        total = sum(c.width for c in scaled) + M * (len(scaled) - 1)
        k = min(1.0, (W - 2 * M) / total)
        x = M
        for c in scaled:
            if k < 1:
                c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.Resampling.LANCZOS)
            sheet.alpha_composite(c.convert("RGBA"), (x, y))
            x += c.width + M
        y += h + M
    sheet.convert("RGB").save(path)
    print(path)


def on(im: Image.Image, colour) -> Image.Image:
    bg = Image.new("RGBA", im.size, colour + (255,))
    bg.alpha_composite(im)
    return bg


def annotated_casing(c: Image.Image, cs: dict) -> Image.Image:
    im = c.copy()
    d = ImageDraw.Draw(im)
    d.rectangle(cs["clock"], outline=(255, 40, 40, 255), width=3)
    d.rectangle(cs["bay"], outline=(255, 210, 63, 255), width=3)
    d.line((0, cs["base_y"], im.width, cs["base_y"]), fill=(0, 220, 255, 255), width=2)
    return im


def annotated_panel(p: Image.Image, pc: dict) -> Image.Image:
    im = p.copy()
    d = ImageDraw.Draw(im)
    r = pc["led_diameter"] / 2
    for x, y in pc["leds"]:
        d.ellipse((x - r, y - r, x + r, y + r), outline=(0, 230, 255, 255), width=2)
    for x, y in pc.get("terminals_top", []) + pc.get("terminals_bottom", []):
        d.ellipse((x - 6, y - 6, x + 6, y + 6), outline=(255, 0, 255, 255), width=2)
    for k in ("display", "window"):
        if k in pc:
            d.rectangle(pc[k], outline=(255, 210, 63, 255), width=2)
    return im


if __name__ == "__main__":
    main()

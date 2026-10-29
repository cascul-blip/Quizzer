#!/usr/bin/env python3
"""Turns the generated Dragon's Hoard pictures in scripts/dragon-art/ (this folder)
into the WebPs the client loads from src/client/shared/dragon/. Needs Pillow and numpy. The
WebPs are committed, so a normal build does not run this.

    python3 scripts/dragon-art.py [preview.png]
    python3 scripts/dragon-art.py --src DIR --out DIR [preview.png]

Batch 1: the cave backdrop and the dragon.
  cave.webp                    the backdrop, opaque, 1344x768 (same as cup/saloon.webp)
  dragon-healthy.webp          the dragon curled round its hoard, transparent
  dragon-wounded.webp          same canvas, same pose, a few cuts and wing holes
  dragon-badly-wounded.webp    same canvas, same pose, battered, orange eye
  dragon-slain.webp            same canvas, collapsed flat on the gold, knocked out (dizzy swirls)
  dragon-asleep.webp           the slain picture without the swirls: the lobby's sleeping dragon
  dragon-jaw.webp              the lower jaw alone, same canvas as the standing stages
  dragon-head.webp             the head cropped out (mouth shut), for small uses
  phone/dragon-head.webp       half size

All five dragon files share ONE canvas (one crop box), so the stages swap by changing the
src and the jaw lines up exactly with its socket: draw it at the same left/top/size and rotate
it about HINGE (printed as % of the canvas). Unlike the anglerfish jaw in sea-art.py, the
jaw layer goes BEHIND the body: the standing bodies have the jaw
cut out, and the jaw layer carries the jaw plus a dark inner-mouth flap (glowing towards the
throat) that the head hides at rest. Swinging the jaw down swings the flap with it, so the
open mouth is dark and fiery instead of showing the cave. Draw: jaw (rotated), then body.
CSS: transform-origin: <hinge x%> <hinge y%>; rotate(-Ndeg) opens it (negative = the
left-facing jaw tips down). -25deg is wide open. The slain stage has no jaw (head is
lying down), so don't draw the jaw with it.

Sources (Grok Imagine, 1280x720 JPG, flat green #00ff00 backgrounds for the dragon):
cave.jpg:
  "Painted 2D cartoon game background, wide landscape view inside a huge deep mountain cave,
   a dark rocky cavern with jagged stone walls and stalactites hanging from the ceiling,
   purple and deep violet shadows in the rock, warm golden glow rising from the empty middle
   of the cave floor as if lit by treasure, a few scattered gold coins and glinting gems at
   the edges of the floor, flickering orange torch light on the walls, the large middle of
   the picture and the floor centre are completely empty open space for a dragon to sit
   later, a smooth flat rocky floor in the lower third, rich painted illustration with soft
   brushwork and clean dark outlines, deep purple (#3a1175 to #25094f) and warm gold
   (#ffd23f) colour palette, atmospheric depth, no characters, no dragon, no creatures, no
   people, no text"
dragon-healthy.jpg:
  "A single huge red and gold dragon curled around a big mountain of gold coins and
   treasure, full body visible and large in the frame, side view, the dragon's head on the
   left in clear side profile resting low on top of the gold with its jaws closed, big curved
   golden horns, glowing yellow eyes, red scales with a golden-tan belly, folded bat wings,
   its long tail curling around the front of the treasure pile, the gold pile has coins,
   goblets, gems and a crown, bold painted cartoon game asset in the style of a polished
   mobile game illustration, soft painterly shading, clean dark outlines, warm golden rim
   light from the treasure, isolated on a perfectly flat plain pure green (#00ff00)
   background, nothing touching the edges, no shadow, no floor, no text"
dragon-wounded.jpg (image-to-image from dragon-healthy.jpg; v2, damage pushed for the back row):
  "Edit this exact image with minimal changes: the dragon's head, horns, jaw, neck, wings,
   body, tail and the gold pile must stay in exactly the same place with exactly the same
   outline, size and pose; do not move, turn or redraw anything. Only paint clearly visible
   battle damage on top that reads from far away: three or four big bold dark cracks and
   long slash marks across the golden neck and chest, several large patches of missing
   scales showing dark grey-brown scorched skin on the shoulder, flank and tail, two big
   ragged holes torn through the wing membrane, dark soot smudges. Keep the flat pure green
   background, same painted cartoon style, same lighting, same outlines, no blood."
dragon-badly-wounded.jpg (image-to-image from dragon-wounded.jpg; v2):
  "Edit this exact image with minimal changes: [same keep-everything-in-place wording] Make
   the damage much heavier so it reads from far away: big bold dark cracks and deep slash
   marks all over the neck, chest, shoulder, legs and tail, large patches of missing scales
   showing dark charred grey skin, the scales much darker and duller red with heavy black
   soot and scorch marks, the wing membrane shredded with many big ragged holes, the eye
   glowing bright orange, a wisp of smoke from the nostril. Keep the flat pure green
   background, same painted cartoon style, same lighting, same outlines, no blood."
The first, subtler stages (batch 1, v1-dragon-wounded.jpg / v1-dragon-badly-wounded.jpg) are not in the repo.
dragon-slain.jpg (image-to-image from dragon-healthy.jpg):
  "Edit this image: the same red and gold dragon with the same scales, horns, colours and
   painted cartoon style, and the same gold treasure pile in the same place, same framing,
   same flat pure green background. The dragon has been defeated and has collapsed, knocked
   out cold: it lies limp and flat over and around the front of the gold pile, its long neck
   stretched flat along the coins on the left with its head resting on its side, eyes closed
   with little cartoon swirl marks, mouth closed, wings crumpled and drooping limp, tail
   lying flat, a few torn wing holes and scratched scales, a few coins knocked loose. Kid
   friendly, no blood, no tongue, no text. Same lighting, same outlines."
dragon-asleep.webp is made from dragon-slain.jpg with the swirl marks keyed out (no extra
generation). Earlier rejected tries (head moved; blood pool) are not in the repo.
The wounded and badly wounded stages came out within ~1% of the healthy outline; this
script still takes the whole head (above NECK_CUT) from the healthy picture for every
standing stage, so the shared jaw always matches its socket.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
SRC_DEFAULT = HERE / "dragon-art"
OUT_DEFAULT = HERE.parent / "src/client/shared/dragon"

# ---- names and sizes: change these when the client wants other ones -------------------
CAVE = ("cave", "cave", (1344, 768))  # (source stem, output name, output size): the saloon backdrop size
STAGES = [  # (source stem, output name)
    ("dragon-healthy", "dragon-healthy"),
    ("dragon-wounded", "dragon-wounded"),
    ("dragon-badly-wounded", "dragon-badly-wounded"),
    ("dragon-slain", "dragon-slain"),
]
STANDING = 3  # the first three stages are standing and share the head and jaw socket
ASLEEP = ("dragon-slain", "dragon-asleep")  # (source stem, output name): slain minus the dark swirl marks
JAW_NAME = "dragon-jaw"  # for healthy and wounded
# Stages whose (healthy) head gets darkened to match their sooty body, and an orange eye.
# They get their own jaw file, f"{JAW_NAME}-{stage name minus 'dragon-'}".
DARK_HEAD = {"dragon-badly-wounded"}
EYE_BOX = (300, 175, 370, 215)  # source px around the eye
HEAD_NAME = "dragon-head"
DRAGON_WIDTH = None  # width of the shared dragon canvas; None keeps the source pixels (no upscale)
HEAD_WIDTH = 320  # projector head crop width (phone gets half)
PHONE = [HEAD_NAME]  # items the spec marks for phone: half-size copies in phone/
QUALITY = 86

# ---- measured on dragon-healthy.jpg, source pixels (1280x720) -------------------------
# Lower jaw, including its fangs and the spikes under it. The first point is the hinge.
JAW = [
    (380, 236),
    (362, 233), (342, 243), (320, 250), (300, 257), (280, 264), (260, 274), (244, 283),
    (232, 288), (240, 300), (258, 318), (272, 330), (286, 318), (300, 300),
    (330, 292), (360, 285), (392, 280), (408, 262), (402, 244),
]
# Everything inside this box is the head; standing stages take it from the healthy picture.
HEAD_BOX = (0, 0, 470, 345)
NECK_FEATHER = 18
HEAD_CROP = (205, 10, 470, 318)  # for dragon-head.webp
HEAD_FADE = (400, 470)  # neck fades out between these source x
MOUTH = (46, 12, 16)
MOUTH_LINE_END = 7  # JAW[0..7] is the mouth line (hinge to under the snout)
FLAP_UP = 85
TONGUE_W = 13
TONGUE = (140, 34, 44)  # how far the inner-mouth flap reaches up into the head, source px
THROAT_GLOW = (255, 120, 30)


def chroma(im: Image.Image, keep_inner_green: bool = True) -> Image.Image:
    """Drop the flat green background: soft edge, green spill pulled out of the rim, specks removed."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    samples = np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4], rgb[3, w // 2], rgb[h // 2, 3], rgb[h // 2, -4]])
    key = np.median(samples, axis=0)
    # Greenness: how far green sticks out above red and blue. The dragon and gold never do.
    green = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    key_green = key[1] - max(key[0], key[2])
    dist = np.sqrt(((rgb - key) ** 2).sum(-1))
    a1 = np.clip((dist - 40) / (110 - 40), 0, 1)
    a2 = np.clip((key_green * 0.75 - green) / (key_green * 0.55), 0, 1)
    alpha = np.maximum(a1, a2) * np.clip(1 - (green - key_green * 0.6) / 40, 0, 1)
    alpha = np.clip(alpha, 0, 1)
    # Despill: green may not exceed the larger of red and blue (gold keeps r > g, so it's safe).
    lim = np.maximum(rgb[..., 0], rgb[..., 2])
    rgb[..., 1] = np.where(rgb[..., 1] > lim, lim + (rgb[..., 1] - lim) * 0.15, rgb[..., 1])
    if keep_inner_green:
        # Emeralds are green too, but darker than the key and bluish (blue above red), unlike
        # the key, the red/green rim of the outline, or a yellow glow painted onto the key.
        # Give those pixels (and a 1 px rim) their own colour and full alpha back.
        orig = np.asarray(im.convert("RGB")).astype(np.float32)
        gem = ((orig[..., 1] - np.maximum(orig[..., 0], orig[..., 2])) > 40) & (orig[..., 2] > orig[..., 0] + 10) & (dist >= 90)
        gem &= np.asarray(Image.fromarray((alpha > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3))) > 0
        rgb[gem] = orig[gem]
        alpha[gem] = 1
    alpha[alpha < 0.04] = 0
    alpha = drop_specks(alpha)
    rgb[alpha == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")


def drop_specks(alpha: np.ndarray, min_px: int = 120) -> np.ndarray:
    """Zero out tiny islands (JPEG noise in the green); keeps anything bigger, like the swirl marks."""
    solid = alpha > 0.3
    lab = np.zeros(solid.shape, np.int32)
    h, w = solid.shape
    nxt = 1
    sizes = {}
    ys, xs = np.nonzero(solid)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if lab[y, x]:
            continue
        stack = [(y, x)]
        lab[y, x] = nxt
        n = 0
        while stack:
            cy, cx = stack.pop()
            n += 1
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = nxt
                    stack.append((ny, nx))
        sizes[nxt] = n
        nxt += 1
    small = np.array([0] + [sizes[i] < min_px for i in range(1, nxt)])
    kill = small[lab] & solid
    # Also the faint halo around a killed speck.
    kill = np.asarray(Image.fromarray((kill * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    out = alpha.copy()
    out[kill & ~(lab > 0) | (kill & small[lab])] = 0
    return out


def remove_swirls(arr: np.ndarray) -> np.ndarray:
    """Clear the cartoon dizzy swirls: separate, nearly black islands above the dragon."""
    solid = arr[..., 3] > 30
    lum = arr[..., :3].astype(np.float32).mean(-1)
    out = arr.copy()
    lab, n = label(solid)
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < 30000 and lum[m].mean() < 70:
            grow = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
            out[grow & ~(lab > 0) | m] = 0
    return out


def label(solid: np.ndarray) -> tuple[np.ndarray, int]:
    """4-connected components (no scipy on the box)."""
    lab = np.zeros(solid.shape, np.int32)
    h, w = solid.shape
    n = 0
    ys, xs = np.nonzero(solid)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if lab[y, x]:
            continue
        n += 1
        stack = [(y, x)]
        lab[y, x] = n
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    stack.append((ny, nx))
    return lab, n


def polygon_mask(size, pts) -> np.ndarray:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m) > 0


def head_weight(size) -> np.ndarray:
    """1 inside HEAD_BOX, fading to 0 over NECK_FEATHER px on its right and bottom sides."""
    w, h = size
    x0, y0, x1, y1 = HEAD_BOX
    xs = np.arange(w)[None, :].astype(np.float32)
    ys = np.arange(h)[:, None].astype(np.float32)
    wx = np.clip((x1 - xs) / NECK_FEATHER, 0, 1) * (xs >= x0)
    wy = np.clip((y1 - ys) / NECK_FEATHER, 0, 1) * (ys >= y0)
    return wx * wy


def darkened_head(healthy: np.ndarray, stage: np.ndarray) -> np.ndarray:
    """The healthy head, shaded to the stage's own (darker, sootier) scale colour, with an orange eye."""
    h, w = healthy.shape[:2]
    x0, y0, x1, y1 = HEAD_BOX
    body = np.zeros((h, w), bool)
    body[y1 : y1 + 200, x1 : x1 + 300] = True  # neck and shoulder just below/right of the head
    m = body & (healthy[..., 3] > 250) & (stage[..., 3] > 250)
    ratio = np.clip(stage[m][:, :3].astype(np.float32).mean(0) / np.maximum(healthy[m][:, :3].astype(np.float32).mean(0), 1), 0.4, 1.1)
    out = healthy.astype(np.float32).copy()
    out[..., :3] *= ratio
    ex0, ey0, ex1, ey1 = EYE_BOX
    eye = out[ey0:ey1, ex0:ex1]
    src = healthy[ey0:ey1, ex0:ex1].astype(np.int16)
    yellow = (src[..., 0] > 170) & (src[..., 1] > 120) & (src[..., 2] < 110) & (src[..., 0] > src[..., 2] + 80)
    eye[yellow, 0] = 255
    eye[yellow, 1] = src[yellow, 1] * 0.55
    eye[yellow, 2] = 10
    print(f"darkened head x{ratio.round(2)}")
    return np.clip(out, 0, 255).astype(np.uint8)


def standing_with_healthy_head(stage: np.ndarray, healthy: np.ndarray) -> np.ndarray:
    wgt = head_weight((stage.shape[1], stage.shape[0]))[..., None]
    out = stage.astype(np.float32) * (1 - wgt) + healthy.astype(np.float32) * wgt
    return np.clip(out, 0, 255).astype(np.uint8)


def split_jaw(body: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(body with the jaw cut out, the jaw layer on the same canvas).

    The jaw layer is drawn BEHIND the body. It holds the jaw itself plus an inner-mouth
    flap (dark throat, glowing towards the back) that reaches up from the jaw into the
    head. At rest the opaque head hides the flap and the jaw fills its hole exactly; when
    the jaw swings down the flap swings with it and fills the gap, so the open mouth never
    shows the background."""
    size = (body.shape[1], body.shape[0])
    jaw_px = polygon_mask(size, JAW) & (body[..., 3] > 40)
    # The flap: the mouth line (top edge of JAW, hinge to snout) and the same line FLAP_UP higher.
    line = JAW[: MOUTH_LINE_END + 1]
    flap_poly = line + [(x + 6, y - FLAP_UP) for x, y in reversed(line)]
    # Inside the opaque head, a couple of px in from its outline (but right up to the jaw).
    hidden = (np.asarray(Image.fromarray((body[..., 3] > 250).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 0) & ~jaw_px
    flap = polygon_mask(size, flap_poly) & hidden
    # Grow the flap down into the jaw's own area so there is no seam between them.
    flap |= jaw_px
    jaw = np.zeros_like(body)
    ys, xs = np.nonzero(flap)
    hx, hy = JAW[0]
    glow = np.clip(1 - np.sqrt((xs - hx) ** 2 + (ys - hy) ** 2) / 150, 0, 1) ** 1.5
    col = np.array(MOUTH, np.float32)[None, :] * (1 - glow[:, None]) + np.array(THROAT_GLOW, np.float32)[None, :] * glow[:, None] * 0.85
    # Darker towards the flap's far edge (the roof of the mouth), so it reads as a hollow.
    fm = Image.fromarray((flap & ~jaw_px).astype(np.uint8) * 255)
    depth = np.asarray(fm.filter(ImageFilter.GaussianBlur(10)), np.float32) / 255
    col *= (0.55 + 0.45 * np.clip(depth[ys, xs] * 1.6 - 0.3, 0, 1))[:, None]
    jaw[ys, xs, :3] = np.clip(col, 0, 255).astype(np.uint8)
    jaw[ys, xs, 3] = 255
    # A tongue lying on the lower jaw, just above the mouth line.
    tongue = Image.new("L", size, 0)
    td = ImageDraw.Draw(tongue)
    pts = [(x, y - 5) for x, y in line[1:-1]]
    td.line(pts, fill=255, width=TONGUE_W, joint="curve")
    for x, y in (pts[0], pts[-1]):
        td.ellipse((x - TONGUE_W / 2, y - TONGUE_W / 2, x + TONGUE_W / 2, y + TONGUE_W / 2), fill=255)
    t = np.asarray(tongue.filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255 * (flap[..., None])
    shade = np.asarray(tongue.filter(ImageFilter.GaussianBlur(5)), np.float32)[..., None] / 255
    tcol = np.array(TONGUE, np.float32) * (0.7 + 0.45 * shade)
    jaw[..., :3] = np.clip(jaw[..., :3] * (1 - t) + tcol * t, 0, 255).astype(np.uint8)
    # Soft inner edge so the flap doesn't look cut.
    jaw[..., 3] = np.asarray(Image.fromarray(jaw[..., 3]).filter(ImageFilter.GaussianBlur(1.0)))
    jaw[jaw_px] = body[jaw_px]
    cut = body.copy()
    cut[jaw_px] = 0
    return cut, jaw


def rotate_jaw(jaw: Image.Image, hinge_px, angle_css: float) -> Image.Image:
    """angle_css matches CSS rotate(): negative opens this left-facing jaw."""
    return jaw.rotate(-angle_css, resample=Image.Resampling.BICUBIC, center=hinge_px)


def save(im: Image.Image, out: Path, name: str, phone: bool = False) -> None:
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{name}.webp"
    im.save(dest, "WEBP", quality=QUALITY, method=6)
    print(f"{dest}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.0f} KB")
    if phone:
        small = im.resize((round(im.width / 2), round(im.height / 2)), Image.Resampling.LANCZOS)
        (out / "phone").mkdir(exist_ok=True)
        pdest = out / "phone" / f"{name}.webp"
        small.save(pdest, "WEBP", quality=80, method=6)
        print(f"{pdest}  {small.width}x{small.height}  {pdest.stat().st_size / 1024:.0f} KB")


def bright_spot(arr: np.ndarray, pred, box=None) -> tuple[float, float]:
    m = pred(arr.astype(np.int16)) & (arr[..., 3] > 200)
    if box:
        x0, y0, x1, y1 = box
        z = np.zeros_like(m)
        z[y0:y1, x0:x1] = True
        m &= z
    ys, xs = np.nonzero(m)
    return (float(xs.mean()), float(ys.mean())) if len(xs) else (0.0, 0.0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=SRC_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("preview", nargs="?")
    args = ap.parse_args()
    src, out = args.src, args.out

    # Cave: opaque.
    cave = Image.open(src / f"{CAVE[0]}.jpg").convert("RGB")
    if cave.size != CAVE[2]:
        # Centre-crop to the target aspect first (1280x720 -> 1260x720), then scale.
        tw, th = CAVE[2]
        cw_, ch_ = cave.size
        if cw_ / ch_ > tw / th:
            nw = round(ch_ * tw / th)
            cave = cave.crop(((cw_ - nw) // 2, 0, (cw_ - nw) // 2 + nw, ch_))
        else:
            nh = round(cw_ * th / tw)
            cave = cave.crop((0, (ch_ - nh) // 2, cw_, (ch_ - nh) // 2 + nh))
        cave = cave.resize(CAVE[2], Image.Resampling.LANCZOS)
    save(cave, out, CAVE[1], CAVE[1] in PHONE)

    keyed = [np.asarray(chroma(Image.open(src / f"{stem}.jpg"))) for stem, _ in STAGES]
    healthy = keyed[0]
    bodies, jaw = [], None
    extra_jaws: dict[str, np.ndarray] = {}
    for i, arr in enumerate(keyed):
        if i < STANDING:
            head = healthy
            if STAGES[i][1] in DARK_HEAD:
                head = darkened_head(healthy, arr)
            arr = standing_with_healthy_head(arr, head) if i else arr
            cav, j = split_jaw(arr)
            if i == 0:
                jaw = j
            if STAGES[i][1] in DARK_HEAD:
                extra_jaws[STAGES[i][1]] = j
            bodies.append(cav)
        else:
            bodies.append(arr)
    assert jaw is not None

    # One crop box for every stage and the jaw, so they all swap and line up.
    union = np.maximum.reduce([b[..., 3] for b in bodies] + [jaw[..., 3]] + [j[..., 3] for j in extra_jaws.values()])
    box = Image.fromarray(union).getbbox()
    assert box
    pad = 4
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(union.shape[1], box[2] + pad), min(union.shape[0], box[3] + pad))
    cw, ch = box[2] - box[0], box[3] - box[1]
    scale = DRAGON_WIDTH / cw if DRAGON_WIDTH else 1.0
    size = (round(cw * scale), round(ch * scale))

    def fin(a: np.ndarray) -> Image.Image:
        im = Image.fromarray(a, "RGBA").crop(box)
        return im.resize(size, Image.Resampling.LANCZOS) if size != im.size else im

    finals = [fin(b) for b in bodies]
    jaw_im = fin(jaw)
    for (_, name), im in zip(STAGES, finals):
        save(im, out, name, name in PHONE)
    save(jaw_im, out, JAW_NAME, JAW_NAME in PHONE)
    for stage, j in extra_jaws.items():
        name = f"{JAW_NAME}-{stage.removeprefix('dragon-')}"
        save(fin(j), out, name, name in PHONE)
    asleep = fin(remove_swirls(np.asarray(chroma(Image.open(src / f"{ASLEEP[0]}.jpg")))))
    save(asleep, out, ASLEEP[1], ASLEEP[1] in PHONE)

    def to_canvas(x, y):
        return ((x - box[0]) * scale, (y - box[1]) * scale)

    hinge = to_canvas(*JAW[0])
    tip = to_canvas(232, 285)  # front of the snout: where fire comes out
    eye = bright_spot(healthy, lambda a: (a[..., 0] > 200) & (a[..., 1] > 150) & (a[..., 2] < 90) & (a[..., 1] > a[..., 2] + 90), (310, 180, 360, 210))
    eye = to_canvas(*eye)
    pct = lambda p: (100 * p[0] / size[0], 100 * p[1] / size[1])
    print(f"canvas {size[0]}x{size[1]}  (crop of the 1280x720 sources: {box})")
    print(f"jaw hinge   {hinge[0]:.0f},{hinge[1]:.0f} px = {pct(hinge)[0]:.1f}% {pct(hinge)[1]:.1f}%")
    print(f"snout tip   {tip[0]:.0f},{tip[1]:.0f} px = {pct(tip)[0]:.1f}% {pct(tip)[1]:.1f}%")
    print(f"eye         {eye[0]:.0f},{eye[1]:.0f} px = {pct(eye)[0]:.1f}% {pct(eye)[1]:.1f}%")

    # Head crop for small uses (lobby list, phone health bar): healthy body + jaw shut.
    hx0, hy0, hx1, hy1 = HEAD_CROP
    head = Image.fromarray(healthy, "RGBA").crop(HEAD_CROP)
    # Keep only the head: fade out the neck on the right.
    a = np.asarray(head).copy()
    xs = np.arange(hx0, hx1)[None, :].astype(np.float32)
    ys = np.arange(hy0, hy1)[:, None].astype(np.float32)
    # Fade the neck out towards the lower right, so the head stands alone.
    t = np.clip((xs - HEAD_FADE[0]) / (HEAD_FADE[1] - HEAD_FADE[0]), 0, 1) * np.clip((ys - 120) / 80, 0, 1)
    t = np.maximum(t, np.clip((ys - 290) / 28, 0, 1) * np.clip((xs - 330) / 40, 0, 1))
    a[..., 3] = (a[..., 3] * (1 - t * t * (3 - 2 * t))).astype(np.uint8)
    head = Image.fromarray(a, "RGBA")
    hb = head.getchannel("A").getbbox()
    head = head.crop(hb)
    head = head.resize((HEAD_WIDTH, round(head.height * HEAD_WIDTH / head.width)), Image.Resampling.LANCZOS)
    save(head, out, HEAD_NAME, HEAD_NAME in PHONE)

    if args.preview:
        preview(args.preview, cave, finals, jaw_im, hinge, head)


def stack(body: Image.Image, jaw: Image.Image | None, hinge, angle: float) -> Image.Image:
    """The client's draw order: jaw rotated about the hinge, then the body over it."""
    out = Image.new("RGBA", body.size, (0, 0, 0, 0))
    if jaw is not None:
        out.alpha_composite(rotate_jaw(jaw, hinge, angle))
    out.alpha_composite(body)
    return out


def purple(w: int, h: int) -> Image.Image:
    yy = np.linspace(0, 1, h)[:, None]
    xx = np.linspace(0, 1, w)[None, :]
    r = np.clip(np.sqrt((xx - 0.5) ** 2 + (yy - 0.35) ** 2) * 1.3, 0, 1)[..., None]
    c0, c1 = np.array([0x3A, 0x11, 0x75]), np.array([0x25, 0x09, 0x4F])
    return Image.fromarray((c0 * (1 - r) + c1 * r).astype(np.uint8), "RGB").convert("RGBA")


def preview(path: str, cave: Image.Image, finals, jaw: Image.Image, hinge, head: Image.Image) -> None:
    """Contact sheet on the theme purple."""
    W, M = 1800, 20
    cw = (W - 5 * M) // 4
    ch = round(cw * finals[0].height / finals[0].width)
    sw = (W - 3 * M) // 2
    sh = round(sw * cave.height / cave.width)
    zw = (W - 6 * M) // 5
    zh = round(zw * 0.78)
    H = 4 * 34 + sh + 2 * ch + zh + 6 * M
    sheet = purple(W, H)
    d = ImageDraw.Draw(sheet)
    y = M

    def label(text):
        nonlocal y
        d.text((M, y + 8), text, fill=(255, 210, 63, 255))
        y += 34

    label("1. Scene: cave.webp with dragon-healthy + dragon-jaw (shut)   |   same, jaw open -25deg")
    for k, ang in enumerate((0, -25)):
        sc = cave.resize((sw, sh), Image.Resampling.LANCZOS).convert("RGBA")
        dw = round(sw * 0.72)
        dh = round(dw * finals[0].height / finals[0].width)
        f = dw / finals[0].width
        dr = stack(finals[0].resize((dw, dh), Image.Resampling.LANCZOS), jaw.resize((dw, dh), Image.Resampling.LANCZOS), (hinge[0] * f, hinge[1] * f), ang)
        sc.alpha_composite(dr, ((sw - dw) // 2, sh - dh - round(sh * 0.03)))
        sheet.alpha_composite(sc, (M + k * (sw + M), y))
    y += sh + M
    label("2. The four stages on one canvas (swap in place): healthy | wounded | badly wounded | slain   (standing ones with the jaw shut)")
    for k, im in enumerate(finals):
        sheet.alpha_composite(stack(im, jaw if k < STANDING else None, hinge, 0).resize((cw, ch), Image.Resampling.LANCZOS), (M + k * (cw + M), y))
    y += ch + M
    label("3. Alignment: healthy outline (red line) drawn over each stage | the standing bodies alone have the jaw cut out")
    edge = np.asarray(finals[0].getchannel("A").point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.FIND_EDGES)) > 0
    edge = np.asarray(Image.fromarray(edge.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    for k, im in enumerate(finals):
        a = np.asarray(stack(im, jaw if k < STANDING else None, hinge, 0)).copy()
        if k == 0:
            a = np.asarray(im).copy()
        else:
            a[edge] = (255, 40, 40, 255)
        sheet.alpha_composite(Image.fromarray(a, "RGBA").resize((cw, ch), Image.Resampling.LANCZOS), (M + k * (cw + M), y))
    y += ch + M
    label("4. Head close-up: jaw 0 | -12deg | -25deg | the jaw layer alone (jaw + inner-mouth flap), hinge = yellow dot   |   dragon-head.webp")
    zx, zy = int(hinge[0] - 250), int(hinge[1] - 200)
    box = (max(0, zx), max(0, zy), max(0, zx) + 400, max(0, zy) + 312)
    for k, ang in enumerate((0, -12, -25)):
        z = stack(finals[0], jaw, hinge, ang).crop(box).resize((zw, zh), Image.Resampling.LANCZOS)
        sheet.alpha_composite(z, (M + k * (zw + M), y))
    jz = jaw.crop(box).resize((zw, zh), Image.Resampling.LANCZOS)
    jd = ImageDraw.Draw(jz)
    hx, hy = (hinge[0] - box[0]) * zw / 400, (hinge[1] - box[1]) * zw / 400
    jd.ellipse((hx - 6, hy - 6, hx + 6, hy + 6), fill=(255, 210, 63, 255), outline=(0, 0, 0, 255))
    sheet.alpha_composite(jz, (M + 3 * (zw + M), y))
    hs = head.copy()
    hs.thumbnail((zw, zh))
    sheet.alpha_composite(hs, (M + 4 * (zw + M), y))
    sheet.convert("RGB").save(path)
    print(path)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Turns the Showdown art in scripts/showdown-art/ into the WebPs the client loads from
src/client/shared/duel/ (phone copies in duel/phone/). Needs Pillow, numpy and ffmpeg (for
the clips). The WebPs are committed, so a normal build does not run this.

    python3 scripts/showdown-art.py [preview.png]
    python3 scripts/showdown-art.py --src DIR --out DIR [preview.png]

The prompts, the style line and the technical rules are in "Showdown Art Brief.md" (repo
root); the delivery notes (per-pose head measurements, which takes were kept, what each
clip shows) are in scripts/showdown-art/manifest.md. scripts/showdown-art/previews/ is
review material from the artist and is not read here; nor is scripts/showdown-art/phone/
(the phone copies are made from the keyed projector files, like the other modes).

This writes:
  street-1/2/3, high-noon   the panel backgrounds, opaque 1280x720              (+ phone)
  town-wide                 the title/podium background, opaque 1920x1080
  body-<pose>               the 8 headless gunslinger poses on ONE shared box (same crop for
                            every pose and every clip frame), feet on the bottom edge (+ phone)
  body-tip-hand             the raised hand/arm of body-tip that covers the head, same box,
                            drawn over the avatar                                 (+ phone)
  hat-brown/black/white/sheriff  the four hats, one scale                         (+ phone)
  muzzle-flash, gun-smoke, dust-puff, bullet-streak   effects keyed by brightness (+ phone)
  tumbleweed                the still (phones roll it in CSS)                     (+ phone)
  sheriff-star, wanted-frame                                                      (+ phone)
  phone/phone-holster       phone only: the holster close-up
  clip-draw-fire/stagger/holster-spin/walk   projector sprite sheets (12 fps), every frame
                            cropped to the shared body box, a 2 px transparent gutter
  clip-hat-fly, clip-tumbleweed   projector sprite strips, each frame centred on the object
  meta.ts                   every number the client needs (box, head per pose, muzzle, hat
                            placement, clip layouts and per-frame head/object tracks), in %
  manifest.md               files, sizes, anchors and layer order for people

Keying: green (#00ff00) screens by how far green sticks out above red and blue (the bodies
are brown, so nothing on them is green), with the rim un-mixed from the key; black screens
(muzzle flash, gun smoke, dust, bullet streak) by brightness, colour un-premultiplied, so
they look like added light with normal blending.
"""
import argparse
import csv
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC_DEFAULT = HERE / "showdown-art"
OUT_DEFAULT = ROOT / "src/client/shared/duel"

QUALITY = 84
PHONE_QUALITY = 80
BG_QUALITY = 80
SHEET_QUALITY = 72

POSES = {  # client pose id -> source file
    "idle": "body-idle",
    "ready": "body-ready",
    "draw": "body-draw",
    "fire": "body-fire",
    "stagger": "body-stagger",
    "tip": "body-tip",
    "walk1": "body-walk-1",
    "walk2": "body-walk-2",
}
HATS = {"brown": "hat", "black": "hat-black", "white": "hat-white", "sheriff": "hat-sheriff"}
STREETS = ["street-1", "street-2", "street-3", "high-noon"]
CHAR_CLIPS = ["draw-fire", "stagger", "holster-spin", "walk"]
OBJ_CLIPS = ["hat-fly", "tumbleweed"]
CLIP_STEP = 2  # 24 fps -> 12 fps
CLIP_FPS = 24 // CLIP_STEP
CHAR_SHEET_SCALE = 0.5  # of the canvas
OBJ_SHEET_SCALE = 0.6
GUTTER = 2
SHEET_COLS = 8
BOX_PAD = 6  # canvas px of air round the union of every pose and clip frame (not below the feet)
HEAD_REGION = (540, 120, 660, 240)  # where to look for the mannequin ball (canvas px)
# The avatar's face is a 100x100 viewBox with the head centred on (50, 56) and 30 units wide
# each side (avatar-art.tsx). It is drawn AVATAR_K times the ball's radius so it covers the
# whole egg-shaped ball, a little bobble-headed like the avatars everywhere else.
AVATAR_K = 1.45
AVATAR_HEAD_CY = 0.56
EFFECT_FIT = {"muzzle-flash": 512, "gun-smoke": 400, "dust-puff": 560, "bullet-streak": 720, "tumbleweed": 256}
# Drawn size of each effect on the duelist box, in canvas px (the body is ~500 px tall).
EFFECT_DRAW_W = {"muzzle-flash": 210, "gun-smoke": 190, "dust-puff": 360, "tumbleweed": 150}


# ---- keying ----------------------------------------------------------------------------

def key_green(im: Image.Image) -> Image.Image:
    """Flat #00ff00 -> RGBA. Alpha from how much green sticks out above red and blue; the
    soft rim is un-mixed from the key and despilled, so no green fringe."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    samples = np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4], rgb[3, w // 2], rgb[h // 2, 3], rgb[h // 2, -4]])
    key = np.median(samples, axis=0)
    spill = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    k = key[1] - max(key[0], key[2])
    # Linear in the mix: fully solid once green no longer sticks out (greys and the pale ball
    # sit at about 0); a 50/50 blur of skin over the key comes out near 0.5, not solid.
    alpha = np.clip((k * 0.92 - spill) / (k * 0.92 - 8), 0, 1)
    alpha[alpha < 0.04] = 0
    a = np.maximum(alpha, 0.3)[..., None]
    fixed = np.clip((rgb - key * (1 - alpha[..., None])) / a, 0, 255)
    rim = alpha < 0.98
    rgb = np.where(rim[..., None], fixed, rgb)
    # Despill: solid pixels may not be greener than their red or blue; the soft rim (motion
    # blur on the clips' hands) may not be greener than the mean of red and blue, a bit warm.
    lim = np.maximum(rgb[..., 0], rgb[..., 2])
    lim = np.where(rim, np.minimum(lim, (rgb[..., 0] + rgb[..., 2]) / 2 + 12), lim)
    rgb[..., 1] = np.minimum(rgb[..., 1], lim)
    rgb[alpha == 0] = 0
    return Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), "RGBA")


def key_glow(im: Image.Image) -> Image.Image:
    """Black screen -> alpha from brightness, colour un-premultiplied (looks like added light)."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    floor = max(np.percentile(rgb.max(-1), 20), 0.03)
    a = np.clip((rgb.max(-1) - floor) / (1 - floor), 0, 1)
    a = np.clip(a * 1.2, 0, 1)
    col = np.clip((rgb - floor * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0, 1)
    col[a < 0.01] = 0
    a[a < 0.01] = 0
    return Image.fromarray((np.dstack([col, a]) * 255).round().astype(np.uint8), "RGBA")


def alpha_of(im: Image.Image) -> np.ndarray:
    return np.asarray(im.getchannel("A")).astype(np.float32) / 255


def bbox(a: np.ndarray, thresh: float = 0.1) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(a > thresh)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def trim(im: Image.Image, pad: int = 3) -> tuple[Image.Image, tuple[int, int]]:
    x0, y0, x1, y1 = bbox(alpha_of(im), 0.02)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    return im.crop((x0, y0, min(im.width, x1 + pad), min(im.height, y1 + pad))), (x0, y0)


def scaled(im: Image.Image, s: float) -> Image.Image:
    return im if s == 1 else im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)


def fit(im: Image.Image, side: int) -> tuple[Image.Image, float]:
    s = min(1.0, side / max(im.size))
    return scaled(im, s), s


# ---- measuring -------------------------------------------------------------------------

def ball(body: Image.Image) -> dict:
    """The featureless mannequin ball: low-saturation (pale grey to warm grey in its shadow)
    pixels connected to the head spot. Centroid, and half its height (r) and width (rx)."""
    rgb = np.asarray(body.convert("RGB")).astype(np.float32)
    a = alpha_of(body)
    hi, lo = rgb.max(-1), rgb.min(-1)
    grey = ((hi - lo) / np.maximum(hi, 1) < 0.36) & (hi > 70) & (a > 0.6)
    x0, y0, x1, y1 = HEAD_REGION
    region = np.zeros_like(grey)
    region[y0:y1, x0:x1] = True
    grey &= region
    seed = np.zeros_like(grey)
    sy, sx = 177, 600
    seed[sy - 3 : sy + 4, sx - 3 : sx + 4] = True
    m = seed & grey
    while True:  # flood fill by repeated dilation inside the grey mask
        grown = m.copy()
        grown[1:] |= m[:-1]
        grown[:-1] |= m[1:]
        grown[:, 1:] |= m[:, :-1]
        grown[:, :-1] |= m[:, 1:]
        grown &= grey
        if (grown == m).all():
            break
        m = grown
    ys, xs = np.nonzero(m)
    return {"x": float(xs.mean()), "y": float(ys.mean()), "r": (ys.max() - ys.min() + 1) / 2, "rx": (xs.max() - xs.min() + 1) / 2,
            "top": int(ys.min()), "bottom": int(ys.max()), "left": int(xs.min()), "right": int(xs.max()), "mask": m}


def soles(body: Image.Image) -> int:
    return bbox(alpha_of(body), 0.5)[3] - 1


def muzzle(fire: Image.Image, head: dict) -> tuple[float, float]:
    """The revolver's tip: the rightmost solid pixel in the arm's band, right of the head."""
    a = alpha_of(fire)
    band = a[int(head["y"]) : int(head["y"]) + 90]
    ys, xs = np.nonzero(band > 0.5)
    x = xs.max()
    tip = ys[xs >= x - 2]
    return float(x), float(tip.mean() + int(head["y"]))


def bright_core(im: Image.Image, frac: float = 0.985) -> tuple[float, float]:
    """Centroid of the brightest pixels (the flash core)."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    lum = rgb.mean(-1)
    ys, xs = np.nonzero(lum >= np.quantile(lum, frac))
    return float(xs.mean()), float(ys.mean())


# ---- clips -----------------------------------------------------------------------------

def clip_frames(mp4: Path, tmp: Path) -> list[tuple[int, Image.Image]]:
    """Every CLIP_STEP-th source frame (0, 2, 4, ...), keyed. Returns (source frame, image)."""
    d = tmp / mp4.stem
    d.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-vf", f"select=not(mod(n\\,{CLIP_STEP}))", "-fps_mode", "passthrough", str(d / "%03d.png")], check=True)
    out = []
    for i, f in enumerate(sorted(d.glob("*.png"))):
        k = np.asarray(key_green(Image.open(f))).copy()
        k[:4], k[-4:], k[:, :4], k[:, -4:] = 0, 0, 0, 0  # stray encoder rows at the frame edge
        out.append((i * CLIP_STEP, Image.fromarray(k, "RGBA")))
    return out


def head_track(csv_path: Path) -> dict[int, tuple[float, float] | None]:
    out = {}
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            out[int(row["frame"])] = (float(row["x"]), float(row["y"])) if row["x"] else None
    return out


def sheet(cells: list[Image.Image], cols: int, gutter: int) -> tuple[Image.Image, dict]:
    cw, ch = cells[0].size
    step_w, step_h = cw + 2 * gutter, ch + 2 * gutter
    cols = min(cols, len(cells))
    rows = -(-len(cells) // cols)
    out = Image.new("RGBA", (cols * step_w, rows * step_h), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.alpha_composite(c, ((i % cols) * step_w + gutter, (i // cols) * step_h + gutter))
    return out, {"cols": cols, "rows": rows, "cellW": cw, "cellH": ch, "gutter": gutter, "w": out.width, "h": out.height}


# ---- output ----------------------------------------------------------------------------

class Writer:
    def __init__(self, out: Path):
        self.out = out
        self.files: dict[str, tuple[int, int, int]] = {}  # rel path -> (w, h, bytes)
        out.mkdir(parents=True, exist_ok=True)
        (out / "phone").mkdir(exist_ok=True)

    def save(self, im: Image.Image, name: str, phone: bool | Image.Image = False, projector: bool = True, quality: int = QUALITY) -> None:
        if projector:
            self._write(im, name, quality)
        if phone is not False:
            small = phone if isinstance(phone, Image.Image) else im.resize((round(im.width / 2), round(im.height / 2)), Image.Resampling.LANCZOS)
            self._write(small, "phone/" + name, PHONE_QUALITY)

    def _write(self, im: Image.Image, rel: str, quality: int) -> None:
        dest = self.out / f"{rel}.webp"
        im.save(dest, "WEBP", quality=quality, method=6, alpha_quality=90)
        self.files[rel] = (im.width, im.height, dest.stat().st_size)
        print(f"{dest.relative_to(ROOT) if dest.is_relative_to(ROOT) else dest}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.0f} KB")


def pct(v: float, total: float) -> float:
    return round(v / total * 100, 2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=SRC_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("preview", nargs="?")
    args = ap.parse_args()
    src, out = args.src, args.out
    w = Writer(out)
    for old in list(out.glob("*.webp")) + list((out / "phone").glob("*.webp")):
        old.unlink()

    # -- backgrounds
    for name in STREETS:
        w.save(Image.open(src / f"{name}.jpg").convert("RGB"), name, phone=True, quality=BG_QUALITY)
    w.save(Image.open(src / "town-wide.jpg").convert("RGB"), "town-wide", quality=BG_QUALITY)

    # -- bodies: key, measure
    bodies = {p: key_green(Image.open(src / f"{f}.jpg")) for p, f in POSES.items()}
    heads = {p: ball(b) for p, b in bodies.items()}
    sole = {p: soles(b) for p, b in bodies.items()}
    tip_muzzle = muzzle(bodies["fire"], heads["fire"])

    # -- clips: key every frame
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        clips = {c: clip_frames(src / "clips" / f"clip-{c}.mp4", tmp) for c in CHAR_CLIPS + OBJ_CLIPS}
    # The walk loops: its last source frame is its first, so drop it.
    if clips["walk"][-1][0] == 48:
        clips["walk"] = clips["walk"][:-1]
    tracks = {c: head_track(src / "clips" / f"clip-{c}-head.csv") for c in CHAR_CLIPS + OBJ_CLIPS}

    # -- the shared duelist box: every pose and every character clip frame
    union = np.zeros((720, 1280), np.float32)
    for b in bodies.values():
        union = np.maximum(union, alpha_of(b))
    for c in CHAR_CLIPS:
        for _, f in clips[c]:
            union = np.maximum(union, alpha_of(f))
    ux0, uy0, ux1, uy1 = bbox(union, 0.15)
    feet = max(sole.values())
    box = (ux0 - BOX_PAD, uy0 - BOX_PAD, ux1 + BOX_PAD, feet + 1)
    BW, BH = box[2] - box[0], box[3] - box[1]
    print(f"duelist box {box} = {BW}x{BH}; union bottom {uy1 - 1}, stills' sole line {feet}")
    to_box = lambda x, y: (pct(x - box[0], BW), pct(y - box[1], BH))

    for p, f in POSES.items():
        w.save(bodies[p].crop(box), f"body-{p}", phone=True)

    # -- the tip hand: the raised arm pixels left of (in front of) the head, not the ball
    tip = bodies["tip"]
    th = heads["tip"]
    ta = np.asarray(tip).copy()
    H, W = ta.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy, r = th["x"], th["y"], th["r"]
    av_half = AVATAR_K * r / 0.3 / 2  # half the avatar box (canvas px)
    near = (np.abs(xx - cx) < av_half + 8) & (yy > cy - av_half * 1.2 - 8) & (yy < cy + av_half)
    ball_grown = np.asarray(Image.fromarray((th["mask"] * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    arm = ((yy < cy + 0.45 * r) & (xx < cx - 0.25 * r)) | (xx < cx - 1.25 * r)
    keep = near & arm & ~ball_grown
    soft = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    ta[..., 3] = (ta[..., 3].astype(np.float32) * soft).round().astype(np.uint8)
    ta[ta[..., 3] == 0] = 0
    w.save(Image.fromarray(ta, "RGBA").crop(box), "body-tip-hand", phone=True)

    # -- hats: one scale, placed like the hat in the first frame of clip-hat-fly
    hf0 = clips["hat-fly"][0][1]
    hx0, hy0, hx1, hy1 = bbox(alpha_of(hf0), 0.3)
    hat_w = hx1 - hx0
    head0 = (600.0, 177.0)  # the clip was made with the hat on the delivery's single head spot
    hats = {}
    for hid, f in HATS.items():
        im, _ = trim(key_green(Image.open(src / f"{f}.jpg")), 0)
        hats[hid] = im
    s = hat_w / hats["brown"].width
    hat_geom = {}
    for hid, im in hats.items():
        im = scaled(im, s)
        # Same width-scale for all four; bottom-centre on the brown hat's bottom-centre.
        left = (hx0 + hx1) / 2 - im.width / 2 - head0[0]
        top = hy1 - im.height - head0[1]
        hat_geom[hid] = {"dx": left, "dy": top, "w": im.width, "h": im.height}
        w.save(im, f"hat-{hid}", phone=True)

    # -- effects on black
    fx_anchor = {}
    for name in ["muzzle-flash", "gun-smoke", "dust-puff", "bullet-streak"]:
        raw = Image.open(src / f"{name}.jpg")
        keyed = key_glow(raw)
        im, (ox, oy) = trim(keyed, 2)
        if name == "muzzle-flash":
            # The core sits a little in front of the muzzle (the delivery notes say so): the
            # anchor is 8% of the flash's width behind its core.
            ax, ay = bright_core(raw)
            ax -= 0.08 * im.width
        elif name == "bullet-streak":
            a = alpha_of(keyed)
            ys, xs = np.nonzero(a > 0.5)
            ax = float(xs.max())
            ay = float(ys[xs >= ax - 6].mean())
        elif name == "gun-smoke":
            x0, y0, x1, y1 = bbox(alpha_of(keyed), 0.1)
            ax, ay = x0 + (x1 - x0) * 0.2, (y0 + y1) / 2  # puffs out of the barrel at its left end
        else:  # dust-puff: bottom centre
            x0, y0, x1, y1 = bbox(alpha_of(keyed), 0.1)
            ax, ay = (x0 + x1) / 2, y1
        im, sc = fit(im, EFFECT_FIT[name])
        fx_anchor[name] = {"x": pct((ax - ox) * sc, im.width), "y": pct((ay - oy) * sc, im.height), "w": im.width, "h": im.height}
        w.save(im, name, phone=True)

    # -- pieces on green
    tw, _ = trim(key_green(Image.open(src / "tumbleweed.jpg")), 2)
    tw, _ = fit(tw, EFFECT_FIT["tumbleweed"])
    w.save(tw, "tumbleweed", phone=True)
    star, _ = trim(key_green(Image.open(src / "sheriff-star.jpg")), 2)
    star, _ = fit(star, 320)
    w.save(star, "sheriff-star", phone=True)
    frame, _ = trim(key_green(Image.open(src / "wanted-frame.jpg")), 2)
    frame, _ = fit(frame, 640)
    w.save(frame, "wanted-frame", phone=True)
    holster, _ = trim(key_green(Image.open(src / "phone-holster.jpg")), 2)
    holster, _ = fit(holster, 640)
    w.save(holster, "phone-holster", phone=holster, projector=False)

    # -- character clip sheets
    clip_meta = {}
    for c in CHAR_CLIPS:
        cells = [scaled(f.crop(box), CHAR_SHEET_SCALE) for _, f in clips[c]]
        sh, lay = sheet(cells, SHEET_COLS, GUTTER)
        track = []
        last = (600.0, 177.0)
        for n, _ in clips[c]:
            pt = tracks[c].get(n) or last
            last = pt
            track.append(list(to_box(*pt)))
        clip_meta[c] = {**lay, "frames": len(cells), "fps": CLIP_FPS, "head": track}
        w.save(sh, f"clip-{c}", quality=SHEET_QUALITY)

    # -- object clip strips: each frame centred on the object's centroid
    obj_meta = {}
    for c in OBJ_CLIPS:
        frames = [(n, f) for n, f in clips[c] if (alpha_of(f) > 0.3).sum() > 400]
        cents, ext = [], [0.0, 0.0]
        for _, f in frames:
            a = alpha_of(f)
            a[:4], a[-4:], a[:, :4], a[:, -4:] = 0, 0, 0, 0  # stray encoder rows at the frame edge
            ys, xs = np.nonzero(a > 0.3)
            mx, my = float(np.median(xs)), float(np.median(ys))
            near = np.zeros_like(a)
            near[max(0, int(my) - 160) : int(my) + 160, max(0, int(mx) - 160) : int(mx) + 160] = 1
            a *= near
            ys, xs = np.nonzero(a > 0.3)
            mx, my = float(xs.mean()), float(ys.mean())
            cents.append((mx, my))
            x0, y0, x1, y1 = bbox(a, 0.05)
            ext[0] = max(ext[0], mx - x0, x1 - mx)
            ext[1] = max(ext[1], my - y0, y1 - my)
        hw, hh = int(ext[0]) + 4, int(ext[1]) + 4
        cells = []
        for (mx, my), (_, f) in zip(cents, frames):
            cx0, cy0 = round(mx) - hw, round(my) - hh
            cell = Image.new("RGBA", (2 * hw, 2 * hh), (0, 0, 0, 0))
            cell.alpha_composite(f.crop((max(0, cx0), max(0, cy0), min(1280, cx0 + 2 * hw), min(720, cy0 + 2 * hh))), (max(0, -cx0), max(0, -cy0)))
            cells.append(scaled(cell, OBJ_SHEET_SCALE))
        sh, lay = sheet(cells, len(cells), 0)
        meta = {**lay, "frames": len(cells), "fps": CLIP_FPS}
        if c == "hat-fly":
            # Track and size on the duelist box: the clip shares the stills' canvas.
            meta["track"] = [list(to_box(mx, my)) for mx, my in cents]
            meta["size"] = [pct(2 * hw, BW), pct(2 * hh, BH)]
        obj_meta[c] = meta
        w.save(sh, f"clip-{c}", quality=SHEET_QUALITY)

    # -- numbers for the client
    poses = {}
    for p in POSES:
        hd = heads[p]
        poses[p] = {"x": to_box(hd["x"], hd["y"])[0], "y": to_box(hd["x"], hd["y"])[1], "r": pct(hd["r"], BH)}
    r_all = float(np.median([h["r"] for h in heads.values()]))
    avatar_px = AVATAR_K * r_all / 0.3  # the avatar's 100-unit box, canvas px
    hat_pct = {h: {"dx": pct(g["dx"], BW), "dy": pct(g["dy"], BH), "w": pct(g["w"], BW), "h": pct(g["h"], BH)} for h, g in hat_geom.items()}
    mz = to_box(*tip_muzzle)
    fx_draw = {k: pct(v, BW) for k, v in EFFECT_DRAW_W.items()}
    fx_draw["bullet-streak-h"] = pct(14, BH)
    meta = {
        "box": {"w": BW, "h": BH, "canvas": list(box)},
        "poses": poses,
        "avatar": {"w": pct(avatar_px, BW), "h": pct(avatar_px, BH), "cy": AVATAR_HEAD_CY},
        "muzzle": {"x": mz[0], "y": mz[1]},
        "hats": hat_pct,
        "effects": {k: {"x": v["x"], "y": v["y"], "w": v["w"], "h": v["h"]} for k, v in fx_anchor.items()},
        "effectWidth": fx_draw,
        "clips": clip_meta,
        "objects": obj_meta,
    }
    write_meta(out, meta, w.files)
    write_manifest(out, w.files, meta, heads, sole, tip_muzzle, hat_geom, box, fx_anchor)
    total = sum(v[2] for v in w.files.values())
    print(f"total {total / 1024:.0f} KB in {len(w.files)} files")
    if args.preview:
        preview(args.preview, out, meta)


def write_meta(out: Path, meta: dict, files: dict) -> None:
    def js(v) -> str:
        return json.dumps(v, separators=(",", ": "))

    def var(rel: str) -> str:
        parts = rel.replace("/", "-").split("-")
        return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:]) + "Img"

    ids = sorted({k.removeprefix("phone/") for k in files})
    L = [
        "// Generated by scripts/showdown-art.py: do not edit. Every number is a % of the box it",
        "// names (x of the width, y of the height) unless noted. The duelist box is the shared",
        "// crop of every body pose and every character clip frame; feet sit on its bottom edge.",
        "",
    ]
    L += [f'import {var(rel)} from "./{rel}.webp";' for rel in sorted(files)]
    L += [
        "",
        "/** Every file: [width, height] of the projector copy and the phone copy (null when there is none); opaque = no alpha. */",
        "export const DUEL_FILES: Record<string, { projector: readonly [number, number] | null; phone: readonly [number, number] | null; opaque: boolean }> = {",
    ]
    for i in ids:
        p, ph = files.get(i), files.get("phone/" + i)
        opaque = i in STREETS or i == "town-wide"
        L.append(f'  "{i}": {{ projector: {f"[{p[0]}, {p[1]}]" if p else "null"}, phone: {f"[{ph[0]}, {ph[1]}]" if ph else "null"}, opaque: {str(opaque).lower()} }},')
    L += ["};", "", "export const DUEL_PROJECTOR_ART: Record<string, string> = {"]
    L += [f'  "{i}": {var(i)},' for i in ids if i in files]
    L += ["};", "", "export const DUEL_PHONE_ART: Record<string, string> = {"]
    L += [f'  "{i}": {var("phone/" + i)},' for i in ids if "phone/" + i in files]
    L += ["};", ""]
    L += [
        f"export const DUEL_BOX = {js(meta['box'])} as const;",
        "",
        "/** Mannequin head centre per pose (facing right) and its radius (% of the box height). */",
        f"export const DUEL_POSE_HEAD = {js(meta['poses'])} as const;",
        "",
        "/** The avatar's 100x100 box: width/height in % of the duelist box; its head centre (50, 56) goes on the head. */",
        f"export const DUEL_AVATAR = {js(meta['avatar'])} as const;",
        "",
        "/** The revolver's tip in the fire pose, facing right. */",
        f"export const DUEL_MUZZLE_RAW = {js(meta['muzzle'])} as const;",
        "",
        "/** Each hat's box relative to the head centre: dx/w in % of the box width, dy/h of its height. */",
        f"export const DUEL_HATS = {js(meta['hats'])} as const;",
        "",
        "/** Effect images: the anchor point in % of the image, and its pixel size. */",
        f"export const DUEL_EFFECTS = {js(meta['effects'])} as const;",
        "",
        "/** Suggested drawn width of each effect, % of the duelist box width (bullet-streak-h: its thickness, % of the height). */",
        f"export const DUEL_EFFECT_WIDTH = {js(meta['effectWidth'])} as const;",
        "",
        "/** Character clip sheets: grid of cells (cellW x cellH px plus a gutter on each side), the head track per frame in % of the duelist box. */",
        f"export const DUEL_CLIPS = {js(meta['clips'])} as const;",
        "",
        "/** Object strips: one row, no gutter, each frame centred on the object. hat-fly: track of the centre and cell size in % of the duelist box. */",
        f"export const DUEL_OBJECTS = {js(meta['objects'])} as const;",
        "",
    ]
    (out / "meta.ts").write_text("\n".join(L))
    print(out / "meta.ts")


def write_manifest(out: Path, files: dict, meta: dict, heads: dict, sole: dict, tip_muzzle, hat_geom: dict, box, fx_anchor: dict) -> None:
    BW, BH = meta["box"]["w"], meta["box"]["h"]
    L = ["# Showdown art manifest\n"]
    L.append("Made by `scripts/showdown-art.py` from the sources in `scripts/showdown-art/` (prompts in `Showdown Art Brief.md`). "
             "Phone copies (`phone/`) are half size. The client reads the numbers from `meta.ts` (generated with this file); "
             "`duel-art.tsx` draws everything. Coordinates: canvas px are the 1280×720 source canvas; box px are the duelist box "
             "(top-left origin); % is of the file or box width/height.\n")
    L.append("## Files\n")
    L.append("| File | Size | Phone copy | KB (projector + phone) |")
    L.append("|---|---|---|---|")
    names = sorted({k.removeprefix("phone/") for k in files})
    for n in names:
        p, ph = files.get(n), files.get("phone/" + n)
        kb = sum(v[2] for v in (p, ph) if v) / 1024
        L.append(f"| `{n}.webp` | {f'{p[0]}×{p[1]}' if p else '– (phone only)'} | {f'{ph[0]}×{ph[1]}' if ph else '–'} | {kb:.0f} |")
    total = sum(v[2] for v in files.values())
    L.append(f"\nTotal: {total / 1024:.0f} KB in {len(files)} files.\n")
    L.append("## The duelist box\n")
    L.append(f"Every `body-*.webp`, `body-tip-hand.webp` and every cell of the four character clip sheets is the same crop of the "
             f"source canvas: x {box[0]}–{box[2]}, y {box[1]}–{box[3]} ({BW}×{BH} px; the clip cells are {meta['clips']['walk']['cellW']}×"
             f"{meta['clips']['walk']['cellH']}, i.e. ×{CHAR_SHEET_SCALE}). So poses and clip frames swap in place. The **sole line is the bottom edge** "
             f"(stills' lowest boot row y {max(sole.values())} on the canvas): draw the box at the height you want with its bottom on the ground.\n")
    L.append("Faces right. Mirror the whole box (`scaleX(-1)`) to face left; the avatar is counter-flipped so it reads the right way.\n")
    L.append(f"**In the client** (`duel-art.tsx`) the Duelist box is the full 1280×720 canvas (16:9) with this crop placed back at "
             f"({box[0]}, {box[1]}); the exported DUEL_HEAD / DUEL_MUZZLE / DUEL_FEET_Y are % of that canvas box: head ≈ (46.9%, 24.6%), "
             f"soles on y = {box[3] / 720 * 100:.1f}%. The % values in the tables below are of the trimmed box (as in meta.ts).\n")
    L.append("### Head per pose (mannequin ball: centroid, half its height)\n")
    L.append("| Pose | File | Canvas (x, y) r | Box px | % of box (x, y), r % of height | Sole line (canvas y) |")
    L.append("|---|---|---|---|---|---|")
    for p, f in POSES.items():
        h = heads[p]
        pp = meta["poses"][p]
        L.append(f"| {p} | `body-{p}.webp` (from `{f}.jpg`) | ({h['x']:.1f}, {h['y']:.1f}) r {h['r']:.1f} | ({h['x'] - box[0]:.1f}, {h['y'] - box[1]:.1f}) | "
                 f"({pp['x']}, {pp['y']}) r {pp['r']} | {sole[p]} |")
    L.append("\nThe delivery said (600, 177) r 32 for every pose; the measurements above agree to a couple of px (the ball is egg-shaped, "
             "so r is half its height; it is about " + f"{np.median([h['rx'] for h in heads.values()]):.0f}" + " px across half-width).\n")
    av = meta["avatar"]
    L.append(f"**Avatar**: the avatar's 100×100 box is drawn {av['w']}% of the box width × {av['h']}% of its height "
             f"({AVATAR_K}× the ball's radius for the avatar's 30-unit head radius), with its point (50, 56) on the head centre. "
             "It covers the whole ball.\n")
    L.append(f"**Muzzle** (body-fire, facing right): canvas ({tip_muzzle[0]:.0f}, {tip_muzzle[1]:.0f}) = box "
             f"({meta['muzzle']['x']}%, {meta['muzzle']['y']}%). Mirror x for a left-facing duelist.\n")
    L.append("**Hats**: one scale for all four, placed like the brown hat in frame 0 of `clip-hat-fly.mp4` (the clip starts with the hat on the head). "
             "Offsets from the head centre:\n")
    L.append("| Hat | Canvas px (dx, dy, w×h) | % of box (dx, dy, w, h) |")
    L.append("|---|---|---|")
    for hid, g in hat_geom.items():
        hp = meta["hats"][hid]
        L.append(f"| `hat-{hid}.webp` | ({g['dx']:.0f}, {g['dy']:.0f}, {g['w']}×{g['h']}) | ({hp['dx']}, {hp['dy']}, {hp['w']}, {hp['h']}) |")
    L.append("\n## Layer order (back to front)\n")
    L.append("street (or high-noon) → dust puff → body-<pose> (or the clip sheet frame) → avatar → hat → body-tip-hand (tip pose only) → "
             "gun smoke → muzzle flash → bullet streak → flying hat → tumbleweed (in front of the duelists, near the ground).\n")
    L.append("## Effects\n")
    L.append("Keyed by brightness on black: alpha = brightness, colour un-premultiplied, so normal blending looks like added light "
             "(`mix-blend-mode: screen` is a touch brighter). Anchor in % of the file:\n")
    L.append("| File | Anchor | What the anchor is | Suggested width on the box |")
    L.append("|---|---|---|---|")
    what = {"muzzle-flash": "the flash core: put it on the muzzle", "gun-smoke": "where the puff leaves the barrel",
            "dust-puff": "bottom centre: on the ground", "bullet-streak": "the bright tip (right end): leads"}
    for k, v in fx_anchor.items():
        wdt = meta["effectWidth"].get(k)
        L.append(f"| `{k}.webp` | ({v['x']}%, {v['y']}%) | {what[k]} | {f'{wdt}% of the box width' if wdt else 'from → to'} |")
    L.append("\n## Clips (projector only, 12 fps)\n")
    L.append(f"Every second frame of the 24 fps clips, keyed. Character sheets: {SHEET_COLS} columns, {GUTTER} px transparent gutter "
             "round each cell; cell i is at x = (i % cols)·(cellW + 2g) + g, y = ⌊i / cols⌋·(cellH + 2g) + g. The head track is the "
             "artist's `<clip>-head.csv`, mapped into the box (%).\n")
    L.append("| Sheet | Pixels | Frames | Cell | Notes |")
    L.append("|---|---|---|---|---|")
    notes = {"draw-fire": "idle → draw → fire, recoil, holds the fire pose", "stagger": "idle → stagger → back to idle",
             "holster-spin": "fire → spin → holstered idle", "walk": "seamless loop (the source's last frame = first is dropped)"}
    for c, m in meta["clips"].items():
        L.append(f"| `clip-{c}.webp` | {m['w']}×{m['h']} | {m['frames']} | {m['cellW']}×{m['cellH']} | {notes[c]} |")
    for c, m in meta["objects"].items():
        extra = ("one row; each cell centred on the hat; track + cell size on the duelist box in meta.ts (starts on the head)"
                 if c == "hat-fly" else "one row; each cell centred on the tumbleweed; roll it across in CSS, no bounce in the source")
        L.append(f"| `clip-{c}.webp` | {m['w']}×{m['h']} | {m['frames']} | {m['cellW']}×{m['cellH']} | {extra} |")
    L.append("\nPhones never load the clips: they swap poses and animate the still hat and tumbleweed in CSS.\n")
    L.append("## Not used\n")
    L.append("`hat-bullet-hole.jpg` and `alternates/body-stagger-lean.jpg` (the clip's stagger matches the delivered pose), "
             "`scripts/showdown-art/phone/` (made here from the keyed files instead), `previews/` and the `*-strip.png` review strips.\n")
    (out / "manifest.md").write_text("\n".join(L))
    print(out / "manifest.md")


# ---- preview: keyed assets, anchors, a duel with real avatars ------------------------------

def preview(path: str, out: Path, meta: dict) -> None:
    def img(n: str) -> Image.Image:
        return Image.open(out / f"{n}.webp").convert("RGBA")

    BW, BH = meta["box"]["w"], meta["box"]["h"]
    avatars = sorted((ROOT / "src/client/shared/avatar").glob("*.webp"))
    faces = [a for a in avatars if a.stem in ("cat", "fox", "kid2", "robot", "panda", "frog", "lion", "kid4")]

    def duelist(pose: str, face: Path, hat: str | None, mirror: bool, body: Image.Image | None = None, head=None) -> Image.Image:
        c = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
        c.alpha_composite(body if body is not None else img(f"body-{pose}"))
        hx, hy = head if head else (meta["poses"][pose]["x"], meta["poses"][pose]["y"])
        hx, hy = hx / 100 * BW, hy / 100 * BH
        aw = round(meta["avatar"]["w"] / 100 * BW)
        av = Image.open(face).convert("RGBA").resize((aw, aw), Image.Resampling.LANCZOS)
        if mirror:
            av = av.transpose(Image.Transpose.FLIP_LEFT_RIGHT)  # pre-flip, so it ends up unflipped
        c.alpha_composite(av, (round(hx - aw / 2), round(hy - aw * meta["avatar"]["cy"])))
        if hat:
            g = meta["hats"][hat]
            hw, hh = round(g["w"] / 100 * BW), round(g["h"] / 100 * BH)
            c.alpha_composite(img(f"hat-{hat}").resize((hw, hh)), (round(hx + g["dx"] / 100 * BW), round(hy + g["dy"] / 100 * BH)))
        if pose == "tip" and body is None:
            c.alpha_composite(img("body-tip-hand"))
        return c.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if mirror else c

    rows = []
    # 1. every pose on mid grey with head circles and the muzzle
    cells = []
    for p in POSES:
        c = Image.new("RGBA", (BW, BH), (128, 128, 128, 255))
        c.alpha_composite(img(f"body-{p}"))
        d = ImageDraw.Draw(c)
        hx, hy, r = meta["poses"][p]["x"] / 100 * BW, meta["poses"][p]["y"] / 100 * BH, meta["poses"][p]["r"] / 100 * BH
        d.ellipse((hx - r, hy - r, hx + r, hy + r), outline=(255, 0, 0, 255), width=2)
        if p == "fire":
            mx, my = meta["muzzle"]["x"] / 100 * BW, meta["muzzle"]["y"] / 100 * BH
            d.ellipse((mx - 5, my - 5, mx + 5, my + 5), outline=(0, 255, 255, 255), width=2)
        d.line((0, BH - 1, BW, BH - 1), fill=(255, 255, 0, 255))
        cells.append(c)
    rows.append(cells)
    # 2. with avatars and hats, plus the hand overlay alone
    hats = [None, "brown", "black", "white", "sheriff", "brown", None, "black"]
    cells = [duelist(p, faces[i % len(faces)], hats[i], i % 2 == 1) for i, p in enumerate(POSES)]
    hand = Image.new("RGBA", (BW, BH), (60, 60, 160, 255))
    hand.alpha_composite(img("body-tip-hand"))
    cells.append(hand)
    rows.append(cells)
    # 3. a duel on the street + effects
    street = img("street-1").copy()
    L = duelist("fire", faces[0], "brown", False)
    R = duelist("stagger", faces[2], None, True)
    s = 0.62
    L, R = L.resize((round(BW * s), round(BH * s))), R.resize((round(BW * s), round(BH * s)))
    gy = 690
    lx, rx = 120, 1280 - 120 - R.width
    street.alpha_composite(L, (lx, gy - L.height))
    street.alpha_composite(R, (rx, gy - R.height))
    def fx(name: str, px: float, py: float, width_pct: float, flip=False):
        e = img(name)
        ww = round(width_pct / 100 * BW * s)
        e = e.resize((ww, max(1, round(e.height * ww / e.width))))
        if flip:
            e = e.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        an = meta["effects"][name]
        ax = (100 - an["x"]) if flip else an["x"]
        street.alpha_composite(e, (round(px - ax / 100 * e.width), round(py - an["y"] / 100 * e.height)))
    mx = lx + meta["muzzle"]["x"] / 100 * L.width
    my = gy - L.height + meta["muzzle"]["y"] / 100 * L.height
    fx("muzzle-flash", mx, my, meta["effectWidth"]["muzzle-flash"])
    fx("gun-smoke", mx + 10, my - 20, meta["effectWidth"]["gun-smoke"])
    fx("dust-puff", rx + R.width / 2, gy, meta["effectWidth"]["dust-puff"])
    st = img("bullet-streak")
    sw = 420
    st = st.resize((sw, max(2, round(st.height * sw / st.width))))
    street.alpha_composite(st, (round(mx + 40), round(my - st.height / 2)))
    hf = meta["objects"]["hat-fly"]
    strip = img("clip-hat-fly")
    i = 6
    cell = strip.crop((i * hf["cellW"], 0, (i + 1) * hf["cellW"], hf["cellH"]))
    cw = round(hf["size"][0] / 100 * R.width)
    cell = cell.resize((cw, round(cell.height * cw / cell.width))).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    tx, ty = hf["track"][i]
    street.alpha_composite(cell, (round(rx + (100 - tx) / 100 * R.width - cell.width / 2), round(gy - R.height + ty / 100 * R.height - cell.height / 2)))
    tws = img("clip-tumbleweed")
    tm = meta["objects"]["tumbleweed"]
    t = tws.crop((0, 0, tm["cellW"], tm["cellH"]))
    street.alpha_composite(t, (600, gy - t.height + 10))
    # 4. clip frames with the avatar on the head track
    clip_cells = []
    for c in CHAR_CLIPS:
        m = meta["clips"][c]
        sh = img(f"clip-{c}")
        for fi in (0, m["frames"] // 3, (2 * m["frames"]) // 3, m["frames"] - 1):
            gx = (fi % m["cols"]) * (m["cellW"] + 2 * m["gutter"]) + m["gutter"]
            gy2 = (fi // m["cols"]) * (m["cellH"] + 2 * m["gutter"]) + m["gutter"]
            body = sh.crop((gx, gy2, gx + m["cellW"], gy2 + m["cellH"])).resize((BW, BH))
            cc = Image.new("RGBA", (BW, BH), (110, 90, 70, 255))
            cc.alpha_composite(duelist("idle", faces[(fi + len(c)) % len(faces)], "white" if c == "walk" else None, False, body=body, head=m["head"][fi]))
            clip_cells.append(cc)
    rows_h = 300
    W = 1800
    sheet_ = Image.new("RGBA", (W, 2000), (40, 30, 30, 255))
    y = 10
    for cells in rows:
        x = 10
        for c in cells:
            t = c.copy()
            t.thumbnail((10000, rows_h))
            sheet_.alpha_composite(t, (x, y))
            x += t.width + 8
        y += rows_h + 10
    st2 = street.copy()
    st2.thumbnail((W - 20, 10000))
    sheet_.alpha_composite(st2, (10, y))
    y += st2.height + 10
    x = 10
    for c in clip_cells:
        t = c.copy()
        t.thumbnail((10000, 200))
        if x + t.width > W:
            x = 10
            y += 210
        sheet_.alpha_composite(t, (x, y))
        x += t.width + 6
    y += 210
    sheet_.crop((0, 0, W, y)).convert("RGB").save(path)
    print(path)


if __name__ == "__main__":
    main()

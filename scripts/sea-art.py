#!/usr/bin/env python3
"""Cuts the painted Submarine Squad pictures in scripts/sea-art/ into the WebPs the
client loads from src/client/shared/sea/. Needs Pillow and numpy. The WebPs are
committed, so a normal build does not run this.

    python3 scripts/sea-art.py [preview.png]

Sources are the Imagine generations (flat magenta backgrounds). This keys that
magenta, flips the submarine so it faces right, splits the anglerfish's lower jaw
off so it can hinge, and makes each seabed tile sideways without a mirror seam.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/sea-art"
OUT = ROOT / "src/client/shared/sea"

# Lower jaw, including its teeth, as fractions of fish-full.jpg (1280x720).
# The first point is the hinge.
JAW = [
    (0.625, 0.705),
    (0.575, 0.770),
    (0.535, 0.845),
    (0.575, 0.915),
    (0.680, 0.900),
    (0.780, 0.800),
    (0.875, 0.675),
    (0.855, 0.590),
    (0.790, 0.515),
    (0.735, 0.555),
    (0.680, 0.640),
]
MOUTH = (36, 12, 16, 255)


def chroma(im: Image.Image) -> Image.Image:
    """Drop the flat magenta background. Soft edge, with the magenta spill pulled out of the rim."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    samples = np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4], rgb[3, rgb.shape[1] // 2]])
    key = np.median(samples, axis=0)
    dist = np.sqrt(((rgb - key) ** 2).sum(-1))
    alpha = np.clip((dist - 36) / (88 - 36), 0, 1)
    # Unmix only the semi-transparent rim. A hard floor on the divisor stops a soft
    # glow (the lure) from blowing out into a neon disc where it met the magenta.
    fringe = (alpha > 0.05) & (alpha < 0.92)
    fixed = np.clip((rgb - key * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 0.35), 0, 255)
    rgb = np.where(fringe[..., None], fixed, rgb)
    rgb[alpha < 0.05] = 0
    alpha[alpha < 0.05] = 0
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def crop(im: Image.Image, pad: int = 2) -> Image.Image:
    box = im.getchannel("A").getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit(im: Image.Image, max_side: int) -> Image.Image:
    scale = min(1.0, max_side / max(im.size))
    if scale == 1:
        return im
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)


def save(im: Image.Image, name: str) -> None:
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=86, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size / 1024:.0f} KB")


def load(name: str) -> Image.Image:
    return chroma(Image.open(SRC / f"{name}.jpg"))


def polygon_mask(size: tuple[int, int], pts: list[tuple[float, float]]) -> np.ndarray:
    w, h = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([(x * w, y * h) for x, y in pts], fill=255)
    return np.asarray(mask) > 0


def split_fish(fish: Image.Image) -> tuple[Image.Image, Image.Image, tuple[float, float]]:
    """Body keeps a dark mouth where the jaw was. Jaw is the lower jaw alone, same canvas."""
    arr = np.asarray(fish).copy()
    poly = polygon_mask(fish.size, JAW)
    solid = poly & (arr[..., 3] > 40)
    jaw = np.zeros_like(arr)
    jaw[solid] = arr[solid]
    # Mouth cavity is exactly the jaw's own pixels, so at rest the jaw covers it
    # and the fish looks uncut. Opening the jaw reveals that dark flesh.
    arr[solid] = MOUTH
    body = Image.fromarray(arr, "RGBA")
    jaw_im = Image.fromarray(jaw, "RGBA")
    # One crop for both, so the hinge stays aligned.
    union = Image.fromarray(np.maximum(arr[..., 3], jaw[..., 3]), "L")
    box = union.getbbox()
    assert box
    hinge_px = (JAW[0][0] * fish.width, JAW[0][1] * fish.height)
    body, jaw_im = body.crop(box), jaw_im.crop(box)
    hinge = ((hinge_px[0] - box[0]) / body.width, (hinge_px[1] - box[1]) / body.height)
    return body, jaw_im, hinge


def seamless_sand(im: Image.Image) -> Image.Image:
    """A soft seabed that repeats. The join blends both the colour and the dune
    line, so the loop has no vertical cut."""
    im = crop(im, 0)
    arr = np.asarray(im).astype(np.float32)
    margin = max(8, arr.shape[1] // 40)
    arr = arr[:, margin:-margin]
    height, width, _ = arr.shape
    overlap = width // 3
    left, mid, right = arr[:, :overlap], arr[:, overlap : width - overlap], arr[:, width - overlap :]

    def skyline(part: np.ndarray) -> np.ndarray:
        opaque = part[:, :, 3] > 16
        has = opaque.any(axis=0)
        first = opaque.argmax(axis=0)
        first[~has] = height - 1
        return first.astype(np.float32)

    sky_l, sky_r = skyline(left), skyline(right)
    fade = np.linspace(0.0, 1.0, overlap, dtype=np.float32)
    fade = fade * fade * (3 - 2 * fade)
    sky = np.rint(sky_r * (1 - fade) + sky_l * fade).astype(np.int32)
    rows = np.arange(height)[:, None]
    cols = np.arange(overlap)[None, :]
    depth = rows - sky[None, :]
    y_r = np.clip(sky_r[None, :].astype(np.int32) + depth, 0, height - 1)
    y_l = np.clip(sky_l[None, :].astype(np.int32) + depth, 0, height - 1)
    cols = np.broadcast_to(cols, (height, overlap))
    blended = right[y_r, cols] * (1 - fade)[None, :, None] + left[y_l, cols] * fade[None, :, None]
    blended[rows < sky[None, :]] = 0
    out = np.concatenate([mid, blended], axis=1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def tile_floor(im: Image.Image, seed: int) -> Image.Image:
    """Loop the strip left-to-right. A ragged wipe joins the ends, so the dunes
    don't meet their own mirror in the middle of the screen."""
    im = crop(im, 0)
    im = fit(im, 1800)
    arr = np.asarray(im).astype(np.float32)
    # The picture's side edges are the chroma rim. Join the interior instead.
    margin = max(6, arr.shape[1] // 30)
    arr = arr[:, margin:-margin]
    height, width = arr.shape[:2]
    overlap = max(48, width // 6)
    left, mid, right = arr[:, :overlap], arr[:, overlap : width - overlap], arr[:, width - overlap :]
    rng = np.random.default_rng(seed)
    coarse = rng.random((max(8, height // 20), 8)).astype(np.float32)
    noise = np.asarray(
        Image.fromarray((coarse * 255).astype(np.uint8), "L").resize((overlap, height), Image.Resampling.BICUBIC),
        dtype=np.float32,
    ) / 255.0
    across = np.linspace(0.0, 1.0, overlap)[None, :]
    center = 0.42 + (noise - 0.5) * 0.5
    weight = np.clip((across - (center - 0.12)) / 0.24, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    blended = right * (1 - weight[..., None]) + left * weight[..., None]
    out = np.concatenate([mid, blended], axis=1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def blue_centers(im: Image.Image) -> list[tuple[float, float, float]]:
    """Porthole glass: dark blue blobs. Returns (cx%, cy%, r%) of each, left to right."""
    arr = np.asarray(im)
    r, g, b, a = (arr[..., i].astype(np.int16) for i in range(4))
    glass = (a > 200) & (b > r + 25) & (b > g + 10) & (b < 160) & (r < 90)
    seen = np.zeros(glass.shape, bool)
    found = []
    h, w = glass.shape
    ys, xs = np.nonzero(glass)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        pts = []
        while stack:
            cy, cx = stack.pop()
            pts.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and glass[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pts) < 40:
            continue
        py = np.mean([p[0] for p in pts])
        px = np.mean([p[1] for p in pts])
        rad = np.sqrt(len(pts) / np.pi)
        found.append((100 * px / w, 100 * py / h, 100 * rad / w))
    return sorted(found)


def bright_spot(im: Image.Image, pred) -> tuple[float, float]:
    arr = np.asarray(im)
    mask = pred(arr) & (arr[..., 3] > 200)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return (0, 0)
    return (100 * xs.mean() / im.width, 100 * ys.mean() / im.height)


def preview(path: str, sub: Image.Image, prop: Image.Image, body: Image.Image, jaw: Image.Image, hinge, floors, props) -> None:
    """A rough level-1 and level-5 frame, plus the jaw shut and wide open."""
    W, H = 1100, 620
    scene = Image.new("RGBA", (W, H), (126, 200, 227, 255))
    floor = floors[0].resize((W, round(W * floors[0].height / floors[0].width)), Image.Resampling.LANCZOS)
    scene.alpha_composite(floor, (0, H - floor.height))
    kelp = fit(props["kelp"], 220)
    scene.alpha_composite(kelp, (80, H - kelp.height - 10))
    ring = fit(props["ring"], 90)
    scene.alpha_composite(ring, (420, H - ring.height - 18))
    boat = fit(props["boat"], 260)
    scene.alpha_composite(boat, (700, H - boat.height - 8))
    sub_s = fit(sub, 340)
    scene.alpha_composite(sub_s, (560, 250))
    fish = composite_jaw(body, jaw, hinge, 0)
    fish = fit(fish, 460)
    scene.alpha_composite(fish, (40, 120))
    scene.convert("RGB").save(path)
    print(path)
    # Jaw poses beside each other.
    sheet = Image.new("RGBA", (body.width, body.height * 3), (20, 40, 70, 255))
    for i, angle in enumerate((-18, 0, 28)):
        sheet.alpha_composite(composite_jaw(body, jaw, hinge, angle), (0, i * body.height))
    jaw_path = str(Path(path).with_name("jaw-poses.png"))
    fit(sheet, 900).convert("RGB").save(jaw_path, quality=85)
    print(jaw_path)


def composite_jaw(body: Image.Image, jaw: Image.Image, hinge, angle_cw: float) -> Image.Image:
    """angle_cw matches CSS rotate(): positive swings the jaw open (clockwise)."""
    cx, cy = hinge[0] * jaw.width, hinge[1] * jaw.height
    spun = jaw.rotate(-angle_cw, resample=Image.Resampling.BICUBIC, center=(cx, cy))
    out = body.copy()
    out.alpha_composite(spun)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    sub = crop(load("sub-hull").transpose(Image.FLIP_LEFT_RIGHT))
    sub = fit(sub, 1000)
    prop = crop(load("sub-prop"))
    prop = fit(prop, 320)

    fish = load("fish-full")
    body, jaw, hinge = split_fish(fish)
    scale = min(1.0, 1100 / body.width)
    if scale != 1:
        size = (round(body.width * scale), round(body.height * scale))
        body = body.resize(size, Image.Resampling.LANCZOS)
        jaw = jaw.resize(size, Image.Resampling.LANCZOS)

    floors = [seamless_sand(load("floor-1"))] + [tile_floor(load(f"floor-{i}"), seed=3 + i * 5) for i in range(2, 6)]
    prop_names = ["kelp", "ring", "boat", "pirate", "cave", "hulk", "liner"]
    sprites = {name: fit(crop(load(name)), 1000) for name in prop_names}

    save(sub, "sub-hull")
    save(prop, "sub-prop")
    save(body, "fish-body")
    save(jaw, "fish-jaw")
    for i, floor in enumerate(floors, 1):
        save(floor, f"floor-{i}")
    for name, im in sprites.items():
        save(im, name)

    ports = blue_centers(sub)
    print(f"portholes (x%, y%, r%): {[(round(p, 1) for p in port) for port in ports]}")
    print("portholes", [(round(a, 1), round(b, 1), round(c, 1)) for a, b, c in ports])

    arr = np.asarray(sub)
    # Prop shaft: leftmost opaque column, its vertical centre.
    cols = np.nonzero((arr[..., 3] > 128).any(axis=0))[0]
    shaft_x = int(cols.min())
    shaft_rows = np.nonzero(arr[:, shaft_x : shaft_x + 8, 3] > 128)[0]
    print(f"shaft left {100 * shaft_x / sub.width:.1f}%  y {100 * shaft_rows.mean() / sub.height:.1f}%")

    lure = bright_spot(
        body,
        lambda a: (a[..., 0] > 180) & (a[..., 1] > 170) & (a[..., 2] < 140) & (a[..., 1] > a[..., 2] + 40),
    )
    eye = bright_spot(
        body,
        lambda a: (a[..., 0] > 180) & (a[..., 1] > 180) & (a[..., 2] > 180),
    )
    print(f"hinge {100 * hinge[0]:.1f}% {100 * hinge[1]:.1f}%")
    print(f"lure {lure[0]:.1f}% {lure[1]:.1f}%")
    print(f"eye  {eye[0]:.1f}% {eye[1]:.1f}%")

    if len(sys.argv) > 1:
        preview(sys.argv[1], sub, prop, body, jaw, hinge, floors, sprites)


if __name__ == "__main__":
    main()

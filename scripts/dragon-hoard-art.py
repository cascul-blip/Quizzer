#!/usr/bin/env python3
"""Batch 2 of the Dragon's Hoard art: everything except the cave and the dragon (those are
dragon-art.py). Same sources folder (scripts/dragon-art/), same output folder. Needs Pillow
and numpy; reuses the green-screen keyer from dragon-art.py.

    python3 scripts/dragon-hoard-art.py [preview.png]
    python3 scripts/dragon-hoard-art.py --src DIR --out DIR [preview.png]
    python3 scripts/dragon-hoard-art.py --shield-only [preview-shield.png]

This writes (projector, plus phone/ copies at half size where the spec says phone):
  rune-shield.webp            the Shield of Faith (Ephesians 6:16): a gold shield with a
                              glowing cross and a soft gold halo; the file name stays
                              rune-shield so the client needs no change          (+ phone)
  hoard-full/half/scattered   the three hoard sizes on ONE shared canvas (same bottom
                              centre), so they swap in place
  team-pile.webp              coins on a cloth with a pennant: the cloth and pennant are
  team-pile-cloth.webp        translucent shading; the -cloth mask is white where the team
                              colour goes (same scheme as fight/castle-cloth-0.webp)
  banner.webp, banner-cloth   the team banner, same scheme                       (+ phone)
  chest-closed/open.webp      shared canvas, the base lines up                   (+ phone)
  loot-<id>.webp              8 square icons (bats recoloured from purple to sooty brown so
                              they read on the purple screen)
  (coins, big-pile, lucky-charm, grab, trap,
                              dragon-scale, bats, jackpot)                       (+ phone)
  jackpot-pile.webp           the big glowing jackpot heap

TINTING (team-pile, banner): draw the -cloth mask filled with the team colour, then the
picture on top at the same box. In SVG, like CastleTower in fight-art.tsx:
    <mask id="m"><image href={clothImg} .../></mask>
    <rect ... fill={teamColor} mask="url(#m)"/>
    <image href={bannerImg} .../>
In HTML/CSS: a div with background:teamColor; mask-image:url(banner-cloth.webp);
mask-size:100% 100%, with an <img src=banner.webp> stacked on it at the same size.

Sources (Grok Imagine, 1280x720 JPG; flat green #00ff00 backgrounds unless noted). Prompts:
shield-of-faith.jpg (builds rune-shield.webp; the halo is added here, not generated):
  "The Shield of Faith: a single large round-topped heater shield seen straight on, polished
   gold with a raised white-gold cross filling the centre of the shield, soft warm holy light
   glowing from the cross, a thin ornate gold rim with simple elegant engraved borders,
   gentle and reverent, protective, not a weapon, no spikes, no swords, centred and fully
   visible with plenty of empty space around it, bold painted cartoon game asset, soft
   painterly shading, clean dark outlines, warm golden (#ffd23f) light, isolated on a
   perfectly flat plain pure green (#00ff00) background, no glow on the background, no
   shadow, no text, no runes, no letters"
v1-rune-shield.jpg is the earlier circle of runes (black background), kept for reference.
hoard-full.jpg:
  "A large mountain of treasure: a big heaped pile of shiny gold coins with goblets, a
   jewelled crown, red rubies, green emeralds and purple amethysts, a few gold chains, seen
   from the side and a little above, wide and fairly low pile, centred with lots of empty
   space around it, bold painted cartoon game asset, soft painterly shading, clean dark
   outlines, warm golden light, isolated on a perfectly flat plain pure green (#00ff00)
   background, no shadow, no floor, no text"
hoard-half.jpg (image-to-image from hoard-full.jpg):
  "Edit this image: the same treasure pile in the same painted cartoon style, same position,
   same centre and same bottom edge, same width at the base, but now only half as tall: a
   lower, smaller heap of gold coins with only a couple of gems and one goblet left, no
   crown, the coins spread in the same footprint. Same flat pure green background, same
   lighting, same outlines, no text."
hoard-scattered.jpg (image-to-image from hoard-full.jpg):
  "Edit this image: the same gold coins and gems in the same painted cartoon style, same
   centre, same bottom edge and roughly the same width, but the pile has burst and is now
   scattered: a very low flat spread of loose gold coins strewn across the ground in a wide
   shallow layer, small clumps of coins, a few scattered rubies, emeralds and amethysts, a
   toppled goblet, coins rolling outward, no tall heap, no crown. Same flat pure green
   background, same lighting, same outlines, no text."
team-pile.jpg:
  "A medium heap of shiny gold coins piled on top of a spread-out square cloth in a single
   bright flat magenta colour (#ff00ff), the magenta cloth's corners and edges clearly
   visible around the bottom of the heap, and a small magenta triangular pennant flag on a
   thin wooden stick planted in the top of the coin heap, seen from the side and a little
   above, centred with lots of empty space around it, bold painted cartoon game asset, soft
   painterly shading, clean dark outlines, warm golden light, isolated on a perfectly flat
   plain pure green (#00ff00) background, no shadow, no text"
banner.jpg:
  "A tall hanging medieval team banner: a long vertical cloth banner in a single bright flat
   magenta colour (#ff00ff) with a swallowtail notched bottom edge, hanging from a
   horizontal gold-capped wooden pole with gold rope tassels at both ends, a thin gold trim
   border along the cloth edges, a simple gold dragon emblem in the middle of the cloth,
   straight front view, the whole banner visible and centred, bold painted cartoon game
   asset, soft shading folds in the cloth, clean dark outlines, isolated on a perfectly flat
   plain pure green (#00ff00) background, no shadow, no text"
chest-closed.jpg:
  "A sturdy wooden treasure chest, closed, seen from the front and a little above in
   three-quarter view, dark red-brown wooden planks, thick gold metal bands and corners, a
   gold lock plate with a keyhole, rounded lid, centred with lots of empty space around it,
   bold painted cartoon game asset, soft painterly shading, clean dark outlines, warm golden
   light, isolated on a perfectly flat plain pure green (#00ff00) background, no shadow, no
   floor, no text"
chest-open.jpg (image-to-image from chest-closed.jpg):
  "Edit this image: the exact same treasure chest in the same place, same size, same angle
   and same painted cartoon style, with the base of the chest unchanged, but now the lid is
   swung wide open upward and back, showing the inside of the lid, and the chest is filled
   to the brim with glowing gold coins and a few gems with a warm golden glow shining up out
   of it. Same flat pure green background, same outlines, no shadow, no text."
jackpot-pile.jpg (the first try had a yellow glow and emeralds that keyed badly; it is
rejected-jackpot-pile-green-glow.jpg; add any glow in CSS, e.g. drop-shadow(0 0 24px #ffd23f)):
  "A spectacular jackpot treasure pile: a tall pointed heap of shiny gold coins crowned with a
   golden crown and a jewelled golden goblet on top, big red rubies, blue sapphires and purple
   amethysts, gold bars, a few small white star twinkles right on the gold, seen from the
   side, compact and tall, centred with lots of empty space around it, bold painted cartoon
   game asset, soft painterly shading, bright golden highlights, clean thick dark outlines,
   no glow or light rays in the background, no green gems, isolated on a perfectly flat
   plain pure green (#00ff00) background, no shadow, no floor, no text"
loot-sheet-1.jpg (2x2, one generation so the set matches):
  "A set of four separate game item icons arranged in a neat 2 by 2 grid, each icon centred
   in its own quarter of the picture with wide empty space between them, none touching: top
   left a small stack of three shiny gold coins; top right a big heaped pile of many gold
   coins; bottom left a lucky charm: a shiny golden horseshoe with a red ruby and sparkles;
   bottom right a grab: a golden armoured gauntlet hand snatching a handful of gold coins.
   All four in exactly the same style, same size and same lighting: bold painted cartoon
   game icons, soft painterly shading, clean thick dark outlines, warm gold and red colours,
   isolated on a perfectly flat plain pure green (#00ff00) background, no shadows, no text"
loot-sheet-2.jpg (same wording, with): "top left a trap called the dragon's last breath: a
   big swirling orange and red fireball of dragon fire with a few blackened coins; top right
   a single large shiny red dragon scale with a golden rim, shaped like a small shield;
   bottom left three cute cartoon purple bats flying close together in a tight cluster;
   bottom right a jackpot: an overflowing treasure chest with a golden crown on top, gems and
   bright sparkles."
"""
import argparse
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("dragon_art", HERE / "dragon-art.py")
da = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(da)

SRC_DEFAULT = HERE / "dragon-art"
OUT_DEFAULT = HERE.parent / "src/client/shared/dragon"

# ---- names and sizes: change these when the client wants other ones -------------------
RUNE = ("shield-of-faith", "rune-shield", 640)  # (source, output, size of the square canvas)
SHIELD_FILL = 0.80  # the shield's height as a share of the canvas; the rest is halo
SHIELD_GLOW = [(26, 0.95, "#ffd23f"), (9, 0.6, "#fff4c2")]  # (blur radius px, strength, colour), outer first
HOARD = [("hoard-full", "hoard-full"), ("hoard-half", "hoard-half"), ("hoard-scattered", "hoard-scattered")]
HOARD_WIDTH = 1000
TEAM_PILE = ("team-pile", "team-pile", 640)  # (source, output, max side); mask is <output>-cloth
BANNER = ("banner", "banner", 640)  # height
CHEST = [("chest-closed", "chest-closed"), ("chest-open", "chest-open")]
CHEST_SIZE = 512  # max side of the shared canvas
JACKPOT = ("jackpot-pile", "jackpot-pile", 720)
ICON = 256  # square canvas
ICON_FILL = 0.88  # the icon's longer side as a share of the canvas
LOOT_SHEETS = {  # source -> ids, in reading order (top left, top right, bottom left, bottom right)
    "loot-sheet-1": ["coins", "big-pile", "lucky-charm", "grab"],
    "loot-sheet-2": ["trap", "dragon-scale", "bats", "jackpot"],
}
LOOT_PREFIX = "loot-"
PHONE = {"rune-shield", "banner", "banner-cloth", "chest-closed", "chest-open"} | {LOOT_PREFIX + i for ids in LOOT_SHEETS.values() for i in ids}
TEAM_COLORS = ["#e21b3c", "#1368ce", "#c98a00", "#26890c"]
QUALITY = 86


def save(im: Image.Image, out: Path, name: str) -> None:
    da.save(im, out, name, name in PHONE)


def keyed(src: Path, stem: str) -> Image.Image:
    return tame_glow(da.chroma(Image.open(src / f"{stem}.jpg")))


def crop(im: Image.Image, pad: int = 4) -> Image.Image:
    box = im.getchannel("A").getbbox()
    assert box
    return im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))


def fit(im: Image.Image, max_side: int) -> Image.Image:
    s = max_side / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.Resampling.LANCZOS) if s < 1 else im


def glow_key(im: Image.Image) -> Image.Image:
    """Black background -> alpha from brightness, colour un-premultiplied. Looks like an
    additive glow over anything, without needing a blend mode."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    floor = np.percentile(rgb.max(-1), 20)  # the not-quite-black background
    a = np.clip((rgb.max(-1) - floor) / (1 - floor), 0, 1)
    a = np.clip(a * 1.25, 0, 1) ** 0.9
    col = np.clip((rgb - floor * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3), 0, 1)
    out = np.dstack([col, a])
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def magenta(rgb: np.ndarray) -> np.ndarray:
    """0..1 how much a pixel is the magenta team cloth (red and blue both well above green)."""
    hi, lo = rgb.max(-1), rgb.min(-1)
    sat = (hi - lo) / np.maximum(hi, 1e-6)
    return np.clip((np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]) / 0.25, 0, 1) * np.clip((sat - 0.3) / 0.3, 0, 1)


def tintable(im: Image.Image) -> tuple[Image.Image, Image.Image]:
    """(picture with the cloth turned into translucent dark shading, white cloth mask), as
    fight-castle.py does it."""
    a = np.asarray(im).astype(np.float64) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    cloth = magenta(rgb) * (alpha > 0.5)
    cloth = np.asarray(Image.fromarray((cloth * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float64) / 255 * (alpha > 0.02)
    hi = rgb.max(-1)
    bright = np.percentile(hi[cloth > 0.8], 90) if (cloth > 0.8).any() else 1
    shade = 1 - np.clip(hi / bright, 0, 1)
    out_a = ((1 - cloth) + cloth * shade) * alpha
    premult = (1 - cloth)[..., None] * rgb * alpha[..., None]
    pic = np.dstack([premult / np.maximum(out_a, 1e-6)[..., None], out_a])
    mask = np.dstack([np.ones_like(rgb), cloth * alpha])
    to = lambda x: Image.fromarray(np.round(np.clip(x, 0, 1) * 255).astype(np.uint8), "RGBA")
    return to(pic), to(mask)


def tinted(pic: Image.Image, mask: Image.Image, color: str) -> Image.Image:
    cell = Image.new("RGBA", pic.size, (0, 0, 0, 0))
    cell.paste(Image.new("RGBA", pic.size, color), (0, 0), mask.getchannel("A"))
    cell.alpha_composite(pic)
    return cell


def shared_canvas(ims: list[Image.Image], width: int | None) -> list[Image.Image]:
    """Crop every picture to one union box (they were generated in the same frame)."""
    union = np.maximum.reduce([np.asarray(i.getchannel("A")) for i in ims])
    box = Image.fromarray(union).getbbox()
    assert box
    box = (max(0, box[0] - 4), max(0, box[1] - 4), min(ims[0].width, box[2] + 4), min(ims[0].height, box[3] + 4))
    out = [i.crop(box) for i in ims]
    if width:
        s = width / max(out[0].size) if width < max(out[0].size) else 1
        out = [o.resize((round(o.width * s), round(o.height * s)), Image.Resampling.LANCZOS) for o in out]
    return out


def base_box(im: Image.Image, share: float = 0.35) -> tuple[int, int, int]:
    """(left, right, bottom) of the lowest `share` of a picture's height: the chest's base."""
    a = np.asarray(im.getchannel("A")) > 128
    rows = np.nonzero(a.any(1))[0]
    top, bottom = rows.min(), rows.max()
    cut = round(bottom - (bottom - top) * share)
    cols = np.nonzero(a[cut:].any(0))[0]
    return int(cols.min()), int(cols.max()), int(bottom)


def align_chests(closed: Image.Image, opened: Image.Image) -> list[Image.Image]:
    """Scale and shift the open chest so its base sits exactly on the closed chest's base."""
    pad = 300  # room for the lid swinging up past the closed chest's frame
    big = Image.new("RGBA", (closed.width + 2 * pad, closed.height + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(closed, (pad, pad))
    closed = big
    l0, r0, b0 = base_box(closed)
    l1, r1, b1 = base_box(opened)
    s = (r0 - l0) / (r1 - l1)
    o = opened.resize((round(opened.width * s), round(opened.height * s)), Image.Resampling.LANCZOS)
    l1, r1, b1 = base_box(o)
    canvas = Image.new("RGBA", closed.size, (0, 0, 0, 0))
    canvas.paste(o, (l0 - l1, b0 - b1), o)
    print(f"chest-open scaled x{s:.3f}, moved {l0 - l1},{b0 - b1} px to sit on the closed chest's base")
    return [closed, canvas]


def quadrants(im: Image.Image) -> list[Image.Image]:
    w, h = im.size
    return [im.crop((x, y, x + w // 2, y + h // 2)) for y in (0, h // 2) for x in (0, w // 2)]


RECOLOR = {"bats": "warm"}  # icons whose purple would vanish on the purple theme


def recolor_warm(im: Image.Image) -> Image.Image:
    """Purple bats -> sooty brown-grey bats with warm rims, so they read on the purple screen."""
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    purple = (b > g + 15) & (r > g)
    lum = (0.3 * r + 0.59 * g + 0.11 * b)
    lum = np.clip(lum * 1.25 + 18, 0, 255)
    warm = np.stack([lum * 1.08, lum * 0.86, lum * 0.66], -1)
    a[..., :3][purple] = np.clip(warm[purple], 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def icon(im: Image.Image) -> Image.Image:
    im = crop(im, 2)
    s = ICON * ICON_FILL / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    out.alpha_composite(im, ((ICON - im.width) // 2, (ICON - im.height) // 2))
    return out


def tame_glow(im: Image.Image) -> Image.Image:
    """The jackpot's yellow glow sat on green, so its halo keys to a yellow-green haze.
    Pull green down to red's level in the faint, semi-transparent part of it."""
    a = np.asarray(im).astype(np.float32)
    # Yellow-green (bright red, green above it) is glow-on-green; emeralds have little red.
    fix = (a[..., 1] > a[..., 0]) & (a[..., 0] > 120)
    a[..., 1][fix] = a[..., 0][fix] * 0.97
    a[..., 2][fix] = np.minimum(a[..., 2][fix], a[..., 0][fix] * 0.5)
    # What's left of a glow after despill is a see-through olive haze: fade it out. Gold
    # keeps red well above green, so it isn't touched.
    olive = (a[..., 1] >= a[..., 0] * 0.9) & (a[..., 2] < a[..., 1] * 0.6) & (a[..., 3] < 250) & (a[..., 1] < 170)
    a[..., 3][olive] *= 0.15
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def build_shield(src: Path) -> Image.Image:
    """The shield keyed off green, centred on a square canvas, with a soft gold halo behind it
    so it reads over the dragon and matches the glow of the treasure."""
    shield = crop(keyed(src, RUNE[0]), 2)
    size = RUNE[2]
    s = size * SHIELD_FILL / shield.height
    shield = shield.resize((round(shield.width * s), round(shield.height * s)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pos = ((size - shield.width) // 2, (size - shield.height) // 2)
    sil = Image.new("L", (size, size), 0)
    sil.paste(shield.getchannel("A"), pos)
    for radius, strength, colour in SHIELD_GLOW:
        halo = np.asarray(sil.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255
        halo = np.clip(halo * 1.6, 0, 1) * strength
        layer = Image.new("RGBA", (size, size), colour)
        layer.putalpha(Image.fromarray((halo * 255).astype(np.uint8)))
        canvas.alpha_composite(layer)
    canvas.alpha_composite(shield, pos)
    return canvas


def preview_shield(path: str, shield: Image.Image, out_dir: Path) -> None:
    """Shield alone at full size on purple | over the dragon in the cave | phone size."""
    M = 20
    cave = Image.open(out_dir / "cave.webp").convert("RGBA")
    d = Image.open(out_dir / "dragon-healthy.webp")
    jaw = Image.open(out_dir / f"{da.JAW_NAME}.webp")
    dragon = Image.new("RGBA", d.size, (0, 0, 0, 0))
    dragon.alpha_composite(jaw)
    dragon.alpha_composite(d)
    scene = cave.copy()
    dw = round(scene.width * 0.72)
    dragon = dragon.resize((dw, round(dw * d.height / d.width)), Image.Resampling.LANCZOS)
    scene.alpha_composite(dragon, ((scene.width - dw) // 2, scene.height - dragon.height - 20))
    # Roughly where the client would raise it: in front of the dragon's head.
    sh = shield.resize((340, 340), Image.Resampling.LANCZOS)
    scene.alpha_composite(sh, (150, 120))
    phone = shield.resize((shield.width // 2, shield.height // 2), Image.Resampling.LANCZOS)
    W = M + shield.width + M + scene.width + M
    H = 34 + max(shield.height + 34 + phone.height, scene.height) + 2 * M
    sheet = da.purple(W, H)
    dr = ImageDraw.Draw(sheet)
    dr.text((M, M), "rune-shield.webp 640x640 on purple (actual size)", fill=(255, 210, 63, 255))
    dr.text((2 * M + shield.width, M), "over dragon-healthy + jaw in cave.webp (1344x768, shield at 340 px)", fill=(255, 210, 63, 255))
    sheet.alpha_composite(shield, (M, M + 34))
    dr.text((M, M + 34 + shield.height + 8), "phone/rune-shield.webp 320x320 (actual size)", fill=(255, 210, 63, 255))
    sheet.alpha_composite(phone, (M, M + 34 + shield.height + 34))
    sheet.alpha_composite(scene, (2 * M + shield.width, M + 34))
    sheet.convert("RGB").save(path)
    print(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=SRC_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--shield-only", action="store_true", help="only rebuild rune-shield.webp (+ phone)")
    ap.add_argument("preview", nargs="?")
    args = ap.parse_args()
    src, out = args.src, args.out
    res: dict[str, Image.Image] = {}

    res[RUNE[1]] = build_shield(src)
    if args.shield_only:
        save(res[RUNE[1]], out, RUNE[1])
        if args.preview:
            preview_shield(args.preview, res[RUNE[1]], out)
        return

    for (stem, name), im in zip(HOARD, shared_canvas([keyed(src, s) for s, _ in HOARD], HOARD_WIDTH)):
        res[name] = im

    pile = fit(crop(keyed(src, TEAM_PILE[0])), TEAM_PILE[2])
    res[TEAM_PILE[1]], res[TEAM_PILE[1] + "-cloth"] = tintable(pile)

    ban = crop(keyed(src, BANNER[0]))
    ban = ban.resize((round(ban.width * BANNER[2] / ban.height), BANNER[2]), Image.Resampling.LANCZOS)
    res[BANNER[1]], res[BANNER[1] + "-cloth"] = tintable(ban)

    chests = align_chests(keyed(src, CHEST[0][0]), keyed(src, CHEST[1][0]))
    for (_, name), im in zip(CHEST, shared_canvas(chests, CHEST_SIZE)):
        res[name] = im

    res[JACKPOT[1]] = fit(crop(keyed(src, JACKPOT[0])), JACKPOT[2])

    for sheet, ids in LOOT_SHEETS.items():
        for id_, q in zip(ids, quadrants(keyed(src, sheet))):
            ic = icon(q)
            if RECOLOR.get(id_) == "warm":
                ic = recolor_warm(ic)
            res[LOOT_PREFIX + id_] = ic

    for name, im in res.items():
        save(im, out, name)

    if args.preview:
        preview(args.preview, res, src)


def preview(path: str, res: dict[str, Image.Image], src: Path) -> None:
    W, M = 1800, 20
    sheet_rows = []

    def row(title: str, cells: list[Image.Image], h: int) -> None:
        sheet_rows.append((title, cells, h))

    out_dir = OUT_DEFAULT
    # Before / after for the wounded stages (v1 sources, if kept, run through the same steps).
    before_after = []
    if (src / "v1-dragon-wounded.jpg").exists():
        healthy = np.asarray(da.chroma(Image.open(src / "dragon-healthy.jpg")))
        jaw0 = Image.open(out_dir / f"{da.JAW_NAME}.webp")
        for stem in ("dragon-wounded", "dragon-badly-wounded"):
            v1 = np.asarray(da.chroma(Image.open(src / f"v1-{stem}.jpg")))
            v1 = da.standing_with_healthy_head(v1, healthy)
            v1, _ = da.split_jaw(v1)
            v1 = Image.fromarray(v1, "RGBA").crop((79, 6, 1201, 692))
            now = Image.open(out_dir / f"{stem}.webp")
            jn = out_dir / f"{da.JAW_NAME}-{stem.removeprefix('dragon-')}.webp"
            jaw_now = Image.open(jn) if jn.exists() else jaw0
            for body, jaw in ((v1, jaw0), (now, jaw_now)):
                c = Image.new("RGBA", body.size, (0, 0, 0, 0))
                c.alpha_composite(jaw.resize(body.size))
                c.alpha_composite(body)
                before_after.append(c)
        row("1. Wounded: batch 1 (before) | batch 2 (after)   ||   Badly wounded: before | after", before_after, 260)
    stand = []
    for n in ("dragon-healthy", "dragon-wounded", "dragon-badly-wounded", "dragon-asleep"):
        p = out_dir / f"{n}.webp"
        if p.exists():
            im = Image.open(p).convert("RGBA")
            j = out_dir / (f"{da.JAW_NAME}-badly-wounded.webp" if n == "dragon-badly-wounded" else f"{da.JAW_NAME}.webp")
            if n != "dragon-asleep" and j.exists():
                c = Image.new("RGBA", im.size, (0, 0, 0, 0))
                c.alpha_composite(Image.open(j))
                c.alpha_composite(im)
                im = c
            stand.append(im)
    row("2. Final stages: healthy | wounded | badly wounded | dragon-asleep (lobby)", stand, 260)

    # The shield (rune-shield.webp) over the dragon in the cave.
    cave = out_dir / "cave.webp"
    if cave.exists() and (out_dir / "dragon-healthy.webp").exists():
        sc = Image.open(cave).convert("RGBA").resize((672, 384))
        d = Image.open(out_dir / "dragon-healthy.webp")
        d = d.resize((480, round(480 * d.height / d.width)))
        sc.alpha_composite(d, (96, 384 - d.height - 10))
        r = res[RUNE[1]].resize((230, 230))
        sc.alpha_composite(r, (60, 80))
        row("3. rune-shield (Shield of Faith) over the dragon in the cave | on purple | on black | hoard full | half | scattered (shared canvas)", [sc, res[RUNE[1]], Image.new("RGBA", (300, 300), (0, 0, 0, 255))], 384)
        row("3b. hoard-full | hoard-half | hoard-scattered (one shared canvas, bottom-centre aligned)", [res["hoard-full"], res["hoard-half"], res["hoard-scattered"]], 240)
        blk = sheet_rows[-2][1][2]
        blk.alpha_composite(res[RUNE[1]].resize((300, 300)))
    tint_cells = []
    for c in TEAM_COLORS:
        tint_cells.append(tinted(res[BANNER[1]], res[BANNER[1] + "-cloth"], c))
    for c in TEAM_COLORS:
        tint_cells.append(tinted(res[TEAM_PILE[1]], res[TEAM_PILE[1] + "-cloth"], c))
    row("4. Tint demo in the answer colours red / blue / gold / green: banner x4 | team pile x4", tint_cells, 300)
    row("5. Untinted: banner.webp | banner-cloth.webp | team-pile.webp | team-pile-cloth.webp | chest-closed | chest-open (shared canvas) | jackpot-pile",
        [res[BANNER[1]], res[BANNER[1] + "-cloth"], res[TEAM_PILE[1]], res[TEAM_PILE[1] + "-cloth"], res["chest-closed"], res["chest-open"], res[JACKPOT[1]]], 260)
    ids = [i for v in LOOT_SHEETS.values() for i in v]
    row("6. Loot icons (256 px): " + " | ".join(ids), [res[LOOT_PREFIX + i] for i in ids], 200)
    row("7. The same, phone copies at 128 px, actual size", [res[LOOT_PREFIX + i].resize((ICON // 2, ICON // 2), Image.Resampling.LANCZOS) for i in ids], ICON // 2)

    H = sum(h + 34 + M for _, _, h in sheet_rows) + M
    sheet = da.purple(W, H)
    dr = ImageDraw.Draw(sheet)
    y = M
    for title, cells, h in sheet_rows:
        dr.text((M, y + 8), title, fill=(255, 210, 63, 255))
        y += 34
        x = M
        scaled = []
        for c in cells:
            c = c.copy()
            c.thumbnail((10000, h))
            scaled.append(c)
        extra = 0
        total = sum(c.width for c in scaled) + M * (len(scaled) - 1) + extra
        k = min(1.0, (W - 2 * M - extra) / max(1, total - extra))
        for c in scaled:
            if k < 1:
                c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.Resampling.LANCZOS)
            sheet.alpha_composite(c, (x, y))
            x += c.width + M
        y += h + M
    sheet.convert("RGB").save(path)
    print(path)


if __name__ == "__main__":
    main()

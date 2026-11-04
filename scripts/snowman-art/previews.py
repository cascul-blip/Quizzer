"""previews/*.png and phone/*.webp.  python3 src/previews.py  (after build.py)"""
import sys, math, copy; sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw
import build as Bd, rig as R, timeline as T
OUT = Bd.OUT; PREV = Bd.PREV; M = Bd.M; N = Bd.N; f26 = Bd.RB._font(26); f20 = Bd.RB._font(20)
art = Bd.load_art(); ALL = set(range(N*N)); st0 = dict(M.STYLES["a"])
def dot(d, x, y, col=(255, 210, 0), r=6): d.ellipse([x - r, y - r, x + r, y + r], fill=col, outline=(0, 0, 0), width=2)
def finish(c, st, name, zapped=()): M.player_list(c, st, zapped); M.hud(c, st); c.convert("RGB").save(PREV/name)
def ring(i): return min(i % N, i // N, N - 1 - i % N, N - 1 - i // N)
def states():
    rng = np.random.default_rng(11)
    # intact: quiz phase, targets locked (two rows frost-marked: the sweep lanes)
    c = Bd.frame_base(art); Bd.snowman(c, art, eye=0.9); marked = {v*N + u for v in (3, 4) for u in range(6, 12)} | {v*N + u for v in (8,) for u in range(0, 6)}
    Bd.board(c, ALL, marked=marked, art=art); M.pieces(c); finish(c, st0, "intact.png")
    # partial: rings 0-1 gone, ring 2 cracking & falling, right hand mid-sweep, 3 pieces hit (frost puff)
    inner = {i for i in ALL if ring(i) >= 2}; r2 = {i for i in inner if ring(i) == 2}; alive = inner - r2; fall = set(sorted(r2)[::2])
    pos = [(3, 4), (5, 7), (8, 8), (7, 4), (4, 3), (6, 5), (5, 8), (3, 6), (8, 5), (4, 5), None, (8, 3), (6, 6), None]; M.POS = pos
    st = dict(st0, phase="attack", round=8); c = Bd.frame_base(art)
    sw = T.sweep(1.30, art.RS); Bd.snowman(c, art, arms=sw["arms"], eye=1.6, skip_arm="R")
    swept = {v*N + u for v in (3, 4) for u in range(7, 10)}
    Bd.board(c, alive - swept, doomed_set=r2, fall=fall, art=art); M.pieces(c)
    ops, so, _ = Bd.arm_ops(art, 1, **sw["arms"]["R"]); Bd.draw_ops(c, art, ops); Bd.draw_ops(c, art, [so])
    hit = Image.open(OUT/"fx-frost-hit.webp").convert("RGBA")
    for (u, v) in [(7, 4), (8, 3)]:
        p = Bd.project(u + .5, v + .5); Bd.put(c, hit, p[0] - 45, p[1] - 75, 90, 90)
    sp = Image.open(OUT/"fx-snow-spray.webp").convert("RGBA"); p = T.board_pt(7.6, 4.0); Bd.put(c, sp, p[0] - 50, p[1] - 70, 110, 110)
    finish(c, st, "partial.png", zapped=("Gabe", "Isaac"))
    # gone: every tile swept away; the snowman alone in the snowy forest
    M.POS = [None]*14; st3 = dict(st0, phase="move", bar=((179, 107, 0), (255, 176, 0)), round=21); c = Bd.frame_base(art); Bd.snowman(c, art, eye=0.9); finish(c, st3, "gone.png")
def arm_at(c, S, a, scale, ox, oy, pivots=False):
    a2 = copy.copy(art); a2.RS = S; ops, so, (E, W) = Bd.arm_ops(a2, 1, **a); Bd.draw_ops(c, a2, ops, scale, ox, oy); Bd.draw_ops(c, a2, [so], scale, ox, oy)
    if pivots:
        d = ImageDraw.Draw(c)
        for p, col in ((S, (255, 210, 0)), (E, (0, 220, 255)), (W, (255, 80, 200))): dot(d, ox + scale*p[0], oy + scale*p[1], col)
def parts_sheet():
    c = Image.new("RGBA", (1920, 1080), (22, 28, 40, 255)); d = ImageDraw.Draw(c); d.text((20, 14), "Evil Snowman parts (layers share one frame; pivots: yellow = start/shoulder, cyan = end/elbow, magenta = wrist)", fill="white", font=f26)
    x = 20
    for k in ("body", "head", "hat", "scarf"):
        im = art.lay[k]; s = 460/im.height; im2 = im.resize((round(im.width*s), 460)); fr = Image.new("RGBA", im2.size, (40, 50, 66, 255)); fr.alpha_composite(im2); c.alpha_composite(fr, (x, 90)); d.text((x, 58), f"snowman-{k}", fill="white", font=f20)
        if k == "head":
            for e in art.eyes_src: dot(d, x + e[0]*s, 90 + e[1]*s, (255, 80, 40), 5)
        x += im2.width + 16
    full = Image.new("RGBA", (art.size[0], art.size[1])); [full.alpha_composite(art.lay[k]) for k in ("body", "head", "hat", "scarf")]
    s = 460/full.height; c.alpha_composite(full.resize((round(full.width*s), 460)), (x, 90)); d.text((x, 58), "stacked", fill="white", font=f20)
    x0, y = 1180, 60
    for k in Bd.PARTS:
        im = art.P[k]; d.text((x0, y), f"{k}  {im.width}x{im.height}", fill="white", font=f20); c.alpha_composite(im, (x0, y + 26))
        if k not in ("arm-elbow", "arm-shoulder"): dot(d, x0, y + 26 + im.height/2); dot(d, x0 + im.width, y + 26 + im.height/2, (0, 220, 255))
        else: dot(d, x0 + (im.width/2 if k == "arm-elbow" else 0.42*im.width), y + 26 + im.height/2)
        y += im.height + 40
        if y > 900: x0, y = 1560, 60
    fx = [("eye-glow", 100), ("target", 120), ("target-glow", 120), ("tile-doomed", 120), ("fx-snow-spray", 120), ("fx-frost-hit", 120), ("fx-swipe-trail", 60)]
    x = 20
    for k, sz in fx:
        im = Image.open(OUT/f"{k}.webp").convert("RGBA"); im = im.resize((round(im.width*sz/im.height), sz)); bg = Image.new("RGBA", im.size, (60, 80, 110, 255)); bg.alpha_composite(im)
        c.alpha_composite(bg, (x, 620)); d.text((x, 590), k, fill="white", font=f20); x += im.width + 24
    x = 20
    for k in [f"snow-{i}" for i in range(4)] + [f"ice-{i}" for i in range(4)]:
        im = Image.open(Bd.TILES/f"{k}.webp").convert("RGBA").resize((110, 110)); c.alpha_composite(im, (x, 830)); d.text((x, 800), k, fill="white", font=f20); x += 126
    c.convert("RGB").save(PREV/"parts-sheet.png")
def pose_sheet():
    c = Image.new("RGBA", (1920, 1080), (22, 28, 40, 255)); d = ImageDraw.Draw(c)
    d.text((20, 14), "Hand presets (rig.POSE) at 2.4x, and arm bends via rig.layout() - same maths as the code", fill="white", font=f26)
    for j, hp in enumerate(("open", "half", "closed", "grasp")):
        x0 = 20 + j*470; d.rectangle([x0, 60, x0 + 450, 500], outline=(80, 96, 130), width=2); kc, tc, sp, th = R.POSE[hp]
        pn = Image.new("RGBA", (446, 400), (22, 28, 40, 255)); arm_at(pn, (0, 0), dict(shoulder=0, elbow=0, wrist=0, hand=hp), 2.4, 110 - 2.4*(R.L1 + R.L2), 190, pivots=True)
        c.alpha_composite(pn, (x0 + 2, 98)); d.text((x0 + 12, 70), f"{hp}: knuckle {kc} tip {tc} spread {sp}", fill="white", font=f20)
    for j, (eb, hp, lab) in enumerate(((0, "open", "straight"), (-45, "half", "elbow -45"), (-90, "closed", "elbow -90"), (-135, "grasp", "elbow -135"), (100, "half", "elbow +100 (sweep down)"))):
        x0 = 20 + j*378; d.rectangle([x0, 530, x0 + 362, 1060], outline=(80, 96, 130), width=2); d.text((x0 + 10, 540), lab, fill="white", font=f20)
        arm_at(c, (0, 0), dict(shoulder=-20 if eb <= 0 else -60, elbow=eb, wrist=10 if eb <= 0 else 60, hand=hp), 0.85, x0 + 40, 960 if eb <= 0 else 760, pivots=True)
    c.convert("RGB").save(PREV/"pose-sheet.png")
def hand_flipbook():
    """hand-<pose>.webp: palm + claws + thumb pre-posed, 2 px/unit, pointing right. Wrist pivot = (48, 160) px. Fallback if live claws are too busy."""
    for hp in ("open", "half", "closed", "grasp"):
        a2 = copy.copy(art); a2.RS = (0, 0); ops, so, _ = Bd.arm_ops(a2, 1, shoulder=0, elbow=0, wrist=0, hand=hp)
        ops = [o for o in ops if o[0] not in ("arm-upper", "arm-fore", "arm-elbow")]; c = Image.new("RGBA", (320, 320))
        Bd.draw_ops(c, a2, ops, 2.0, 48 - 2.0*(R.L1 + R.L2), 160); Bd.save(c, OUT/f"hand-{hp}.webp", 90)
def phone():
    for f in sorted(OUT.glob("*.webp")):
        im = Image.open(f); im = im.resize((max(1, im.width//2), max(1, im.height//2)), Image.LANCZOS); Bd.save(im, Bd.PHONE/f.name, 80)
if __name__ == "__main__":
    hand_flipbook(); states(); parts_sheet(); pose_sheet(); phone(); print("ok")

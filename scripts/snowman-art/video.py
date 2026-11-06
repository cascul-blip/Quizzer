"""Renders video/sweep.mp4, video/idle-loop.mp4 and previews/sweep-keyframes.png.  python3 src/video.py"""
import sys, math, subprocess, shutil, json; sys.dont_write_bytecode = True
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import build as Bd, timeline as T, rig as R
OUT = Bd.OUT; VID = OUT/"video"; VID.mkdir(exist_ok=True); TMP = Path("/tmp/snowfr")
art = Bd.load_art(); spray = Image.open(OUT/"fx-snow-spray.webp").convert("RGBA")
M = Bd.M; K, OX, OY = Bd.K, Bd.OX, Bd.OY
M.POS = [(2, 9), (5, 7), (9, 10), (7, 6), (3, 3), (10, 7), (6, 10), (1, 6), (8, 8), (4, 5), None, (9, 1), (6, 6), None]
SW = T.swept_tiles(); CT = {i: T.contact_time(i) for i in SW}
ALL = set(range(Bd.N*Bd.N))
def hud_layer(phase):
    c = Image.new("RGBA", (M.W, M.H)); st = dict(M.STYLES["a"], phase=phase); M.player_list(c, st); M.hud(c, st); return c
def board_layer(skip):
    c = Image.new("RGBA", (M.W, M.H)); Bd.board(c, ALL - set(skip), art=art); return c
def tipT(st):
    a = st["arms"]["R"]; ops, E, W, h = R.layout(art.RS, a["shoulder"], a["elbow"], a["wrist"], a["hand"]); return ops[-3][3]
def render(st, bl, hud, t=None, sweeping=False, tips=None):
    c = Bd.frame_base(art)
    Bd.snowman(c, art, arms=st["arms"], eye=st["eye"], head_dy=st["head_dy"], breathe=st["breathe"], skip_arm="R" if st.get("over_board") else None)
    c.alpha_composite(bl)
    if sweeping:
        moving = {}; live = []
        for i in SW:
            age = t - CT[i]
            if age < 0: live.append(i)
            elif age < T.TILE_FX_T: moving[i] = T.tile_motion(age, i // Bd.N - T.SWEEP_ROWS[0])
        lay = Image.new("RGBA", c.size); Bd.board(lay, live, doomed_set=[i for i in live if CT[i] - t < 0.35], art=art, moving=moving, shadow=False)
        # the board() call redraws the outline; fine. Frost marks on tiles still waiting (target lock)
        for i in live:
            if t < T.KEY["reach"] + 0.05 or CT[i] - t >= 0.35: Bd.mark_tile(lay, art, i, 0.9)
        c.alpha_composite(lay)
    M.pieces(c)
    if st.get("over_board"):
        ops, so, _ = Bd.arm_ops(art, 1, **st["arms"]["R"]); Bd.draw_ops(c, art, ops); Bd.draw_ops(c, art, [so])
    if sweeping and tips:
        tr = Image.new("RGBA", c.size); d = ImageDraw.Draw(tr); pts = [(OX + K*x, OY + K*y) for (tt, x, y) in tips if t - 0.22 <= tt <= t]
        for j in range(1, len(pts)):
            f = j/len(pts); d.line([pts[j - 1], pts[j]], fill=(225, 240, 255, int(200*f)), width=int(10 + 36*f))
        c.alpha_composite(tr.filter(ImageFilter.GaussianBlur(5)))
        rng = np.random.default_rng(5); sp = Image.new("RGBA", c.size)
        for (tt, x, y) in tips:
            if not (T.KEY["reach"] + 0.03 < tt < T.KEY["sweep_end"]): rng.random(6); continue
            r = rng.random(6); age = t - tt
            if not (0 <= age < 0.55): continue
            px = x + 30*age*(r[0] - 0.2)*3 + 40*age; py = y - 60*age*(0.5 + r[1]) + 90*age*age; s = (40 + 40*r[2])*(0.7 + 1.8*age)
            im = spray.rotate(r[3]*360).resize((max(1, int(s*K)), max(1, int(s*K)))); a = 1 - age/0.55
            im.putalpha(im.getchannel("A").point(lambda v, a=a: int(min(255, v*a*1.1)))); sp.alpha_composite(im, (int(OX + K*px - im.width/2), int(OY + K*py - im.height/2)))
        c.alpha_composite(sp)
    c.alpha_composite(hud); return c
def encode(name, n, crf=21):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(T.FPS), "-i", str(TMP/"f%04d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(VID/name)], check=True)
def main():
    shutil.rmtree(TMP, ignore_errors=True); TMP.mkdir()
    # ---- sweep ----
    hud = hud_layer("attack"); bl = board_layer(SW); n = int(T.KEY["end"]*T.FPS) + 1; tips = []; keys = {}
    for f in range(n):
        t = f/T.FPS; st = T.sweep(t, art.RS)
        if T.KEY["reach"] <= t <= T.KEY["sweep_end"] + 0.02: p = tipT(st); tips.append((t, p[0], p[1] + 6))
        c = render(st, bl, hud, t, True, tips)
        c.convert("RGB").save(TMP/f"f{f:04d}.png")
        for kn, kt in (("idle", 0), ("wind-up", T.KEY["windup"]), ("reach", T.KEY["reach"]), ("sweep 40%", 1.16), ("sweep 80%", 1.52), ("close + lift", T.KEY["close"])):
            if abs(t - kt) < 0.5/T.FPS: keys[kn] = (t, c.convert("RGB"))
    encode("sweep.mp4", n)
    sh = Image.new("RGB", (1920, 3*360 + 40*3), (14, 18, 28)); d = ImageDraw.Draw(sh); fnt = Bd.RB._font(26)
    for j, (kn, (t, im)) in enumerate(keys.items()):
        x, y = (j % 2)*960, (j // 2)*400; sh.paste(im.resize((960, 540)).crop((0, 60, 960, 420)), (x, y + 40)); d.text((x + 12, y + 6), f"{kn}  t={t:.2f}s", fill="white", font=fnt)
    sh.save(OUT/"previews"/"sweep-keyframes.png")
    # ---- idle loop ----
    shutil.rmtree(TMP); TMP.mkdir(); hud = hud_layer("quiz"); bl = board_layer([]); n = int(T.IDLE_T*T.FPS)
    for f in range(n): st = T.idle(f/T.FPS); render(st, bl, hud).convert("RGB").save(TMP/f"f{f:04d}.png")
    encode("idle-loop.mp4", n, 22)
    shutil.rmtree(TMP)
if __name__ == "__main__": main()

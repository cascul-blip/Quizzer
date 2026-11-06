"""Evil Snowman (Robot Attack reskin) final art build.  python3 src/build.py   (rebuilds everything except the videos; see video.py)"""
import sys, math, json, importlib.util; sys.dont_write_bytecode = True
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
HERE = Path(__file__).parent; SRC = HERE/"sources"; OUT = HERE.parent; TILES = OUT/"tiles"; PREV = OUT/"previews"; PHONE = OUT/"phone"
for d in (TILES, PREV, PHONE): d.mkdir(exist_ok=True)
sys.path.insert(0, str(HERE)); sys.path.insert(1, "/workspace/quizzer-art/robot/final/src")
spec = importlib.util.spec_from_file_location("robot_build", "/workspace/quizzer-art/robot/final/src/build.py"); RB = importlib.util.module_from_spec(spec); spec.loader.exec_module(RB)
import rig as R
A = RB.A; M = RB.M; K, OX, OY = RB.K, RB.OX, RB.OY; N, project, quad, tile_box, EDGE = RB.N, RB.project, RB.quad, RB.tile_box, RB.EDGE
BACKDROP = RB.BACKDROP
def save(im, p, q=88): im.save(p, "WEBP", quality=q, method=6)
def rgba(rgb, al): return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(al, 0, 1)*255]).astype(np.uint8), "RGBA")
def tight(im): return im.crop(im.getchannel("A").getbbox())

# ---------------- body layers ----------------
BODY_H = 600.0; BODY_Y = 40.0
def body_layers():
    rgb, al = A.key_green(SRC/"body.jpg"); ys, xs = np.nonzero(al > 0.5)
    x0, y0, x1, y1 = xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7; rgb, al = rgb[y0:y1, x0:x1], al[y0:y1, x0:x1]
    Hh, Ww = al.shape; yy = np.mgrid[0:Hh, 0:Ww][0]; L = rgb @ [0.3, 0.59, 0.11]; dark = (L < 75) & (al > 0.3)
    dk = ndimage.binary_closing((L < 100) & (al > 0.3) & (yy < 0.30*Hh), iterations=3); lab, _ = ndimage.label(dk)
    top = np.unique(lab[: int(0.06*Hh)]); top = top[top > 0]; hm = np.isin(lab, top)
    cols = np.where(hm.any(0), Hh - 1 - np.argmax(hm[::-1], 0), -1)                      # brim bottom per column
    cols = ndimage.median_filter(cols, 9); hat = (yy <= cols[None, :]) & (al > 0.05)
    sc = dark & (yy > 0.29*Hh) & (yy < 0.72*Hh); lab, n = ndimage.label(ndimage.binary_closing(sc, iterations=3))
    sz = ndimage.sum(sc, lab, range(1, n + 1)); scarf = np.isin(lab, [i + 1 for i in np.nonzero(sz > 0.15*sz.max())[0]])
    scarf = ndimage.binary_fill_holes(ndimage.binary_closing(scarf, iterations=5)) & (al > 0.05)
    neck = int(np.percentile(np.nonzero(scarf)[0], 8))                      # scarf top
    head = (yy < neck + 0.06*Hh) & ~hat & (al > 0.05) & ~scarf
    soft = lambda m: np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), float)/255
    L_hat, L_scarf = soft(hat)*al, soft(scarf)*al
    L_head = np.clip(soft(head | ((yy < neck + 0.10*Hh) & ~hat)) - L_hat*0, 0, 1)*al*(1 - soft(hat)*0.0)
    L_head = np.where(hat, 0, L_head)*(1 - L_scarf*0)
    L_body = np.where(yy < neck, 0, al)                                     # body: scarf line down (scarf pixels kept underneath)
    lay = {"body": rgba(rgb, L_body), "head": rgba(rgb, L_head), "hat": rgba(rgb, L_hat), "scarf": rgba(rgb, L_scarf), "full": rgba(rgb, al)}
    # eyes: brightest warm blobs in the face
    warm = (rgb[..., 0] - rgb[..., 2])*(rgb[..., 0] > 150)*(yy < neck)*(~hat); warm = ndimage.gaussian_filter(warm, 3)
    w2 = warm.copy(); e1 = np.unravel_index(w2.argmax(), w2.shape); w2[max(0, e1[0] - 40):e1[0] + 40, max(0, e1[1] - 40):e1[1] + 40] = 0; e2 = np.unravel_index(w2.argmax(), w2.shape)
    eyes = sorted([(int(e1[1]), int(e1[0])), (int(e2[1]), int(e2[0]))])
    # shoulders: middle ball sides at 0.50 of the height
    row = np.nonzero(al[int(0.47*Hh)] > 0.5)[0]; sh = (int(row.min() + 0.12*(row.max() - row.min())), int(row.max() - 0.12*(row.max() - row.min())), int(0.47*Hh))
    return lay, eyes, sh, (Ww, Hh), neck
def body_place(size): w = BODY_H*size[0]/size[1]; return dict(x=600 - w/2, y=BODY_Y, w=w, h=BODY_H)
def bpt(BP, size, px, py): return (BP["x"] + px/size[0]*BP["w"], BP["y"] + py/size[1]*BP["h"])

# ---------------- arm & hand parts ----------------
PARTS = {  # component bbox centre (sheet px) -> name, target size (w,h) px, rotate
    "arm-upper": ((408, 117), (384, 0)), "arm-fore": ((910, 141), (352, 0)), "arm-elbow": ((305, 330), (112, 112)),
    "arm-shoulder": ((640, 333), (192, 0)), "hand-palm": ((960, 340), (176, 0)), "claw-prox": ((326, 556), (128, 0)),
    "claw-dist": ((659, 560), (128, 0)), "thumb": ((976, 565), (112, 0))}
def parts():
    rgb, al = A.key_green(SRC/"parts.jpg"); lab, n = ndimage.label(al > 0.3); objs = ndimage.find_objects(lab); P = {}
    for name, ((cx, cy), (tw, th)) in PARTS.items():
        i = lab[cy, cx]
        if i == 0:
            d = [(abs((s[1].start + s[1].stop)/2 - cx) + abs((s[0].start + s[0].stop)/2 - cy), k + 1) for k, s in enumerate(objs)]; i = min(d)[1]
        s = objs[i - 1]; m = ndimage.binary_dilation(lab[s] == i, iterations=2); im = rgba(rgb[s], al[s]*m)
        if name == "claw-dist":          # chord base->tip horizontal; base = lowest-left blob end
            a = np.asarray(im)[..., 3] > 80; ys, xs = np.nonzero(a); b = (xs[ys > ys.max() - 12].mean(), ys.max() - 6); t = (xs.max(), ys[xs > xs.max() - 6].mean())
            ang = math.degrees(math.atan2(t[1] - b[1], t[0] - b[0])); im = tight(im.rotate(ang, expand=True, resample=Image.BICUBIC))
            a = np.asarray(im)[..., 3] > 80; col = np.nonzero(a[:, :max(4, im.width//12)].any(1))[0]; by = col.mean()   # base centre row
            pad = int(abs(im.height - 2*by)) + 2; c = Image.new("RGBA", (im.width, im.height + pad)); c.paste(im, (0, pad if by < im.height/2 else 0)); im = c
        if name == "arm-shoulder": im = tight(im)
        im = tight(im); w = tw; h = th or round(im.height*tw/im.width); P[name] = im.resize((w, h), Image.LANCZOS)
    return P

def make_glow(S, col, inner=(255, 245, 225)):
    y, x = np.mgrid[0:S, 0:S]; r = np.hypot(x - S/2 + .5, y - S/2 + .5)/(S/2); a = np.clip(1 - r, 0, 1)**2.2
    c = np.zeros((S, S, 4)); core = np.clip(1 - r/0.25, 0, 1)[..., None]; c[..., :3] = np.array(col)*(1 - core) + np.array(inner)*core; c[..., 3] = a*255
    return Image.fromarray(c.astype(np.uint8), "RGBA")

# ---------------- backdrop ----------------
def backdrop():
    im = Image.open(SRC/"backdrop-raw.jpg").convert("RGB").resize((1920, 1080), Image.LANCZOS); W, H = im.size; a = np.asarray(im).astype(float)
    Lm = a @ [0.3, 0.59, 0.11]; band = Lm[int(H*.55):int(H*.75)].mean(0); k = np.convolve(band, np.ones(61)/61, "same")
    Lx = int(W*.04 + np.argmin(k[int(W*.04):int(W*.25)])); Rx = int(W*.75 + np.argmin(k[int(W*.75):int(W*.97)]))
    xs = np.interp(np.arange(W), [0, 0.16*W, W/2, 0.84*W, W - 1], [0, Lx, W/2, Rx, W - 1]); x0 = np.floor(xs).astype(int).clip(0, W - 2); f = (xs - x0)[None, :, None]
    a = a[:, x0]*(1 - f) + a[:, x0 + 1]*f
    yy, xx = np.mgrid[0:H, 0:W]; g = np.exp(-(((xx - W*.5)/(W*.13))**2 + ((yy - H*.31)/(H*.20))**2))
    a = 255 - (255 - a)*(1 - 0.55*g[..., None]*np.array([0.80, 0.88, 1.0]))
    o = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(2, 60, 2))
    save(o, OUT/"backdrop.webp", 90); return o.convert("RGBA")

# ---------------- tiles (packed snow / blue ice) ----------------
def flat(tone, var, S=160):
    rng = np.random.default_rng(300 + var*7 + (0 if tone == "light" else 50)); nz = RB.noise
    base = np.array([196, 206, 222] if tone == "light" else [74, 96, 128], float)*(0.95 + 0.03*var)
    m = (nz(rng, S, S, 18, 4)*0.6 + nz(rng, S, S, 4)*0.4)[..., None]; s = rng.random((S, S))[..., None]
    t = base*(0.86 + 0.26*m)
    if tone == "light": t = np.where(s > 0.992, t + 40, t); t = np.where(s < 0.006, t*0.7, t)
    else:
        cr = np.abs(np.sin(nz(rng, S, S, 40, 6)*11 + np.linspace(0, 4, S)[None, :]))[..., None] < 0.05; t = np.where(cr, t*1.35 + 25, t)
    return np.clip(t, 0, 255)
def build_tiles(scene):
    PX = 2; flats = {(t, v): flat(t, v) for t in ("light", "dark") for v in range(4)}
    for (t, v), a in flats.items(): save(Image.fromarray(a.astype(np.uint8)), TILES/f"{'snow' if t == 'light' else 'ice'}-{v}.webp", 88)
    AW, AH = 1200, 860; Wp, Hp = AW*PX, AH*PX; y, x = np.mgrid[0:Hp, 0:Wp].astype(np.float32); ax, ay = x/PX, y/PX
    z = RB.H0/np.maximum(ay - RB.HOR, 1e-3); v = N - (z - 1)*N/RB.DEPTH; u = (ax - RB.CX)*z/RB.TILE + N/2
    inside = (u >= 0) & (u < N) & (v >= 0) & (v < N) & (ay > RB.HOR); ui, vi = np.clip(u.astype(int), 0, N - 1), np.clip(v.astype(int), 0, N - 1); fx, fy = u - ui, v - vi
    S = 160; tex = np.zeros((Hp, Wp, 3), np.float32); rng = np.random.default_rng(3); ch = rng.integers(0, 4, N*N); rot = rng.integers(0, 4, N*N)
    for i in range(N*N):
        tu, tv = i % N, i // N; t = np.rot90(flats[("light" if (tu + tv) % 2 == 0 else "dark", int(ch[i]))], int(rot[i])); m = inside & (ui == tu) & (vi == tv)
        tex[m] = t[np.clip((fy[m]*S).astype(int), 0, S - 1), np.clip((fx[m]*S).astype(int), 0, S - 1)]
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)); grout = edge < 0.02
    hi = ((fx < 0.055) | (fy < 0.055)) & ~grout; lo = ((fx > 0.945) | (fy > 0.945)) & ~grout
    tex = np.where(hi[..., None], tex*1.12 + 30, tex); tex = np.where(lo[..., None], tex*0.62, tex); tex = np.where(grout[..., None], np.array([18, 24, 36], np.float32), tex)
    ys = np.clip(RB.FAR_Y*PX - (np.arange(Hp) - RB.FAR_Y*PX)*0.55, 0, Hp - 1).astype(int)
    refl = np.asarray(Image.fromarray(scene[ys].astype(np.uint8)).filter(ImageFilter.GaussianBlur(9)), np.float32)*np.array([0.85, 0.95, 1.1])
    kk = (0.42 - 0.25*np.clip(v/N, 0, 1))[..., None]; ice = np.array([(((i % N) + i // N) % 2) for i in range(N*N)])[vi*N + ui][..., None]
    kk = kk*(0.45 + 0.9*ice); tex = tex*(1 - kk) + np.clip(refl, 0, 255)*kk*1.1
    tex = np.clip(tex, 0, 255).astype(np.uint8); meta = {}
    for i in range(N*N):
        tu, tv = i % N, i // N; x0, y0, x1, y1 = tile_box(i); crop = tex[y0*PX:y1*PX, x0*PX:x1*PX]
        mk = Image.new("L", ((x1 - x0)*PX*4, (y1 - y0)*PX*4)); ImageDraw.Draw(mk).polygon([((px - x0)*PX*4, (py - y0)*PX*4) for px, py in quad(tu, tv)], fill=255)
        im = Image.fromarray(crop, "RGB").convert("RGBA"); im.putalpha(mk.resize(((x1 - x0)*PX, (y1 - y0)*PX), Image.LANCZOS)); save(im, TILES/f"t-{i:03d}.webp", 85); meta[i] = [x0, y0, x1 - x0, y1 - y0]
    json.dump(meta, open(TILES/"tiles.json", "w")); return meta

def doomed(S=160, seed=5):
    rng = np.random.default_rng(seed); Z = S*4; im = Image.new("RGBA", (Z, Z)); d = ImageDraw.Draw(im)
    for _ in range(7):
        x, y = Z/2 + rng.normal(0, Z*0.08), Z/2 + rng.normal(0, Z*0.08); ang = rng.uniform(0, 2*math.pi); pts = [(x, y)]
        for _ in range(9): ang += rng.normal(0, 0.5); st = Z*rng.uniform(0.04, 0.08); x += st*math.cos(ang); y += st*math.sin(ang); pts.append((x, y))
        for wid, col in ((Z*0.035, (12, 22, 44, 255)), (Z*0.013, (190, 235, 255, 255))): d.line(pts, fill=col, width=round(wid), joint="curve")
    gl = im.getchannel("A").filter(ImageFilter.GaussianBlur(Z*0.02)); g = Image.new("RGBA", (Z, Z), (120, 200, 255, 0)); g.putalpha(gl.point(lambda v: int(v*0.55))); g.alpha_composite(im)
    return g.resize((S, S), Image.LANCZOS)
def target_mark(S=256, glow=False):
    """Frost-rim tile highlight (replaces the reticle): drawn in the reticle bbox, preserveAspectRatio none."""
    Z = S*2; y, x = np.mgrid[0:Z, 0:Z]/Z; e = np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y)); rng = np.random.default_rng(9)
    n = np.asarray(Image.fromarray((rng.random((Z//8, Z//8))*255).astype(np.uint8)).resize((Z, Z), Image.BICUBIC), float)/255
    if glow: a = np.clip(1 - e/0.30, 0, 1)**1.6*0.85 + 0.10; col = (120, 200, 255)
    else: a = (np.clip(1 - np.abs(e - 0.07)/0.035, 0, 1)*(0.7 + 0.5*n) + np.clip(1 - e/0.05, 0, 1)*0.5).clip(0, 1); col = (235, 248, 255)
    im = np.zeros((Z, Z, 4)); im[..., :3] = col; im[..., 3] = a*255
    o = Image.fromarray(im.astype(np.uint8), "RGBA")
    if not glow:  # dark outline for contrast on snow
        ol = o.getchannel("A").filter(ImageFilter.MaxFilter(5)); base = Image.new("RGBA", (Z, Z), (20, 40, 80, 0)); base.putalpha(ol.point(lambda v: int(v*0.7))); base.alpha_composite(o); o = base
    return o.resize((S, S), Image.LANCZOS)
def spray(S=256, seed=2):
    rng = np.random.default_rng(seed); Z = S*2; im = Image.new("RGBA", (Z, Z)); d = ImageDraw.Draw(im)
    for _ in range(140):
        r = abs(rng.normal(0, 0.22))*Z; t = rng.uniform(0, 2*math.pi); x, y = Z/2 + r*math.cos(t), Z/2 + r*math.sin(t)*0.8; s = rng.uniform(2, 12)*(1 - min(r/Z/0.6, 0.9))
        d.ellipse([x - s, y - s, x + s, y + s], fill=(240, 248, 255, int(rng.uniform(120, 255))))
    puff = make_glow(Z, (220, 235, 255), (255, 255, 255)); puff.putalpha(puff.getchannel("A").point(lambda v: int(v*0.55))); puff.alpha_composite(im.filter(ImageFilter.GaussianBlur(1)))
    return puff.resize((S, S), Image.LANCZOS)
def trail(Wd=512, Ht=128):
    y, x = np.mgrid[0:Ht, 0:Wd]; u = x/Wd; v = (y - Ht/2)/(Ht/2); w = 0.15 + 0.85*u; a = np.clip(1 - np.abs(v)/w, 0, 1)**1.5*u**1.3
    im = np.zeros((Ht, Wd, 4)); im[..., :3] = np.array([210, 232, 255]); im[..., 3] = a*230; return Image.fromarray(im.astype(np.uint8), "RGBA")

# ---------------- scene rendering ----------------
class Art:
    def __init__(s, P, lay, eyes, sh, size, bd, doom=None, mark=None):
        s.P, s.lay, s.eyes_src, s.size, s.bd, s.doom, s.mark = P, lay, eyes, size, bd, doom, mark
        s.BP = body_place(size); s.eyes = [bpt(s.BP, size, *e) for e in eyes]
        s.RS = bpt(s.BP, size, sh[1], sh[2]); s.LS = R.mirror_pt(s.RS); s.glow = make_glow(128, (255, 70, 30))
REST_R = dict(shoulder=0, elbow=-60, wrist=15, hand="half")      # right arm idle (left arm = mirror, hand open)
REST_L = dict(shoulder=-5, elbow=-60, wrist=15, hand="open")
def arm_ops(art, side, shoulder, elbow, wrist, hand):
    hp = R.POSE[hand] if isinstance(hand, str) else hand; ops, E, W, h = R.layout(art.RS, shoulder, elbow, wrist, hp); out = []
    for op in ops:
        if op[0] in ("seg", "dist"):
            _, nm, a, b, hh = op; img = art.P[nm]; L = math.dist(a, b); deg = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            if op[0] == "dist" or nm in ("thumb",): hh = L*img.height/img.width
            flip = (math.cos(math.radians(deg)) < 0) if nm.startswith("arm") else False
            o = ["x", a[0], a[1], deg, flip, 0, -hh/2, L, hh]
        else:
            _, nm, cc, sz, ang = op; o = ["x", cc[0], cc[1], ang, False, -sz/2, -sz/2, sz, sz]
        if side < 0: o[1] = 2*R.CXM - o[1]; o[3] = 180 - o[3]; o[4] = not o[4]
        out.append((nm, tuple(o)))
    sd = art.P["arm-shoulder"]; sw = H_SH = R.H*1.55; shh = sw*sd.height/sd.width
    o = ["x", art.RS[0], art.RS[1], shoulder, False, -0.42*sw, -shh/2, sw, shh]
    if side < 0: o[1] = 2*R.CXM - o[1]; o[3] = 180 - o[3]; o[4] = True
    return out, ("arm-shoulder", tuple(o)), (E, W)
def draw_ops(c, art, ops, scale=K, ox=OX, oy=OY):
    for nm, o in ops: A.blit(c, art.P[nm], o, scale, ox, oy)
def put(c, im, x, y, w, h, scale=K, ox=OX, oy=OY):
    im = im.resize((max(1, round(w*scale)), max(1, round(h*scale))), Image.LANCZOS); px, py = round(ox + scale*x), round(oy + scale*y)
    if px < 0 or py < 0: im = im.crop((max(0, -px), max(0, -py), im.width, im.height)); px, py = max(px, 0), max(py, 0)
    if im.width > 0 and im.height > 0: c.alpha_composite(im, (px, py))
def snowman(c, art, t=0.0, arms=None, eye=1.0, scale=K, ox=OX, oy=OY, skip_arm=None, head_dy=0.0, breathe=0.0):
    """arms: {'R': dict(shoulder,elbow,wrist,hand), 'L': ...}. skip_arm: side drawn later (over the board)."""
    BP = art.BP; arms = arms or {"R": REST_R, "L": REST_L}
    put(c, art.lay["body"], BP["x"] - BP["w"]*breathe/2, BP["y"] - BP["h"]*breathe, BP["w"]*(1 + breathe), BP["h"]*(1 + breathe), scale, ox, oy)
    sh_ops = []
    for side, key_ in ((-1, "L"), (1, "R")):
        if skip_arm == key_: continue
        ops, so, _ = arm_ops(art, side, **arms[key_]); draw_ops(c, art, ops, scale, ox, oy); sh_ops.append(so)
    for lay in ("head", "hat", "scarf"):
        dy = head_dy if lay in ("head", "hat") else head_dy*0.4
        put(c, art.lay[lay], BP["x"], BP["y"] + dy - BP["h"]*breathe, BP["w"], BP["h"], scale, ox, oy)
    draw_ops(c, art, sh_ops, scale, ox, oy)
    if skip_arm:   # its shoulder still sits on the body
        _, so, _ = arm_ops(art, 1 if skip_arm == "R" else -1, **arms[skip_arm]); draw_ops(c, art, [so], scale, ox, oy)
    eyes_glow(c, art, eye, scale, ox, oy, head_dy - BP["h"]*breathe)
def eyes_glow(c, art, k, scale=K, ox=OX, oy=OY, dy=0):
    g = Image.new("RGBA", c.size)
    for (x, y) in art.eyes:
        r = 13*(0.8 + 0.4*k); im = art.glow.resize((max(1, round(2*r*scale)), max(1, round(2*r*scale))), Image.LANCZOS)
        im.putalpha(im.getchannel("A").point(lambda v: int(min(255, v*(0.5 + 0.5*k))))); g.alpha_composite(im, (round(ox + scale*(x - r)), round(oy + scale*(y + dy - r))))
    c.alpha_composite(g)
def tile_img(i, cache={}):
    if i not in cache: cache[i] = Image.open(TILES/f"t-{i:03d}.webp").convert("RGBA")
    return cache[i]
META = None
def board(c, alive, marked=(), doomed_set=(), fall=(), art=None, moving=None, shadow=True):
    """moving: {i: (dx, dy, deg, alpha)} tiles being swept (drawn displaced)."""
    global META; META = META or json.load(open(TILES/"tiles.json")); sx = lambda x: OX + K*x; sy = lambda y: OY + K*y
    fl, fr, nl, nr = project(0, 0), project(N, 0), project(0, N), project(N, N)
    if shadow:
        sh = Image.new("RGBA", c.size); ds = ImageDraw.Draw(sh)
        ds.polygon([(sx(fl[0]) - 30, sy(fl[1]) - 26), (sx(fr[0]) + 30, sy(fr[1]) - 26), (sx(nr[0]) + 40, sy(nr[1]) + 40), (sx(nl[0]) - 40, sy(nl[1]) + 40)], fill=(0, 6, 20, 120))
        c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22)))
    if any(i // N == N - 1 for i in alive): ImageDraw.Draw(c).polygon([(sx(nl[0]), sy(nl[1])), (sx(nr[0]), sy(nr[1])), (sx(nr[0]), sy(nr[1] + EDGE)), (sx(nl[0]), sy(nl[1] + EDGE))], fill=(22, 30, 46))
    moving = moving or {}
    for i in sorted(set(alive) | set(doomed_set)):
        if i in moving: continue
        x, y, w, h = META[str(i)]; dy = 40 if i in fall else 0; im = tile_img(i)
        if i in fall: a = np.asarray(im, np.float32).copy(); a[..., 3] *= 0.45; im = Image.fromarray(a.astype(np.uint8))
        put(c, im, x, y + dy, w, h)
        if i in doomed_set and art is not None:
            u, v = i % N, i // N; q = [(sx(px), sy(py + dy)) for px, py in quad(u, v)]; ov = Image.new("RGBA", c.size); ImageDraw.Draw(ov).polygon(q, fill=(110, 190, 255, 70 if i not in fall else 30)); c.alpha_composite(ov)
            put(c, art.doom, x, y + dy, w, h)
    ImageDraw.Draw(c).polygon([(sx(p[0]), sy(p[1])) for p in (fl, fr, nr, nl)], outline=(170, 205, 235), width=3)
    if art is not None and art.mark is not None:
        for i in marked: mark_tile(c, art, i)
    for i, (dx, dy, deg, al) in sorted(moving.items(), key=lambda kv: kv[0]):
        x, y, w, h = META[str(i)]; im = tile_img(i).resize((round(w*K), round(h*K)), Image.LANCZOS).rotate(deg, expand=True, resample=Image.BICUBIC)
        a = np.asarray(im, np.float32).copy(); a[..., 3] *= al; im = Image.fromarray(a.astype(np.uint8)); cx, cy = sx(x + w/2 + dx), sy(y + h/2 + dy)
        l = Image.new("RGBA", c.size); l.paste(im, (round(cx - im.width/2), round(cy - im.height/2))); c.alpha_composite(l)
def mark_box(u, v):
    a, b, p0, p1 = project(u + .08, v + .08), project(u + .92, v + .92), project(u + .08, v + .92), project(u + .92, v + .08)
    x0 = min(a[0], p0[0]); return x0, a[1], max(p1[0], b[0]) - x0, b[1] - a[1]
def mark_tile(c, art, i, k=1.0):
    u, v = i % N, i // N; q = [(OX + K*px, OY + K*py) for px, py in quad(u, v)]; ov = Image.new("RGBA", c.size); ImageDraw.Draw(ov).polygon(q, fill=(90, 170, 255, int(40*k))); c.alpha_composite(ov)
    x, y, w, h = mark_box(u, v); g = art.mark
    if k < 1: g = g.copy(); g.putalpha(g.getchannel("A").point(lambda p: int(p*k)))
    put(c, g, x, y, w, h)

def load_art():
    lay, eyes, sh, size, neck = body_layers(); P = {k: Image.open(OUT/f"{k}.webp").convert("RGBA") for k in PARTS}
    for k in ("body", "head", "hat", "scarf"): lay[k] = Image.open(OUT/f"snowman-{k}.webp").convert("RGBA")
    m = Image.open(OUT/"target-glow.webp").convert("RGBA"); m.alpha_composite(Image.open(OUT/"target.webp").convert("RGBA"))
    return Art(P, lay, eyes, sh, size, Image.open(OUT/"backdrop.webp").convert("RGBA"), Image.open(OUT/"tile-doomed.webp").convert("RGBA"), m)
def frame_base(art):
    c = Image.new("RGBA", (M.W, M.H), (6, 10, 20, 255)); put(c, art.bd, **BACKDROP); return c

if __name__ == "__main__":
    lay, eyes, sh, size, neck = body_layers()
    for k in ("body", "head", "hat", "scarf"): save(lay[k], OUT/f"snowman-{k}.webp", 90)
    P = parts()
    for k, im in P.items(): save(im, OUT/f"{k}.webp", 90)
    save(make_glow(128, (255, 70, 30)), OUT/"eye-glow.webp", 90)
    bd = backdrop()
    save(doomed(), OUT/"tile-doomed.webp"); save(target_mark(), OUT/"target.webp"); save(target_mark(glow=True), OUT/"target-glow.webp")
    save(spray(), OUT/"fx-snow-spray.webp"); save(trail(), OUT/"fx-swipe-trail.webp")
    hit = spray(192, seed=7); save(hit, OUT/"fx-frost-hit.webp")
    art = Art(P, lay, eyes, sh, size, bd)
    sc = Image.new("RGBA", (2400, 1720), (6, 10, 20, 255)); put(sc, bd, **BACKDROP, scale=2, ox=0, oy=0); snowman(sc, art, scale=2, ox=0, oy=0)
    build_tiles(np.asarray(sc.convert("RGB")).astype(np.float32))
    json.dump(dict(size=size, eyes=eyes, shoulder_src=sh, neck=neck, BODY=art.BP, RS=art.RS, LS=art.LS, eyes_arena=art.eyes), open(HERE/"geom.json", "w"), indent=1)
    print("built", size, eyes, sh, art.BP, art.RS)

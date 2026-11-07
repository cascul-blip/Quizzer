#!/usr/bin/env python3
"""Prepare generated Toybox PNGs as aligned, articulated runtime WebPs. Needs Pillow/numpy.

Run from the repository root. Source pixels are preserved; preparation only crops, aligns,
resamples and separates animation layers. Prompts and original PNGs live beside this script.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/siege-christmas-art"
OUT = ROOT / "src/client/shared/siege/christmas"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "phone").mkdir(exist_ok=True)
RESAMPLE = Image.Resampling.LANCZOS
manifest = {}

def load(name):
    return Image.open(SRC / f"{name}.png").convert("RGBA")

def bounds(im):
    a = np.asarray(im)[..., 3] > 24
    ys, xs = np.nonzero(a)
    return int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)

def save(im, name):
    im.save(OUT / f"{name}.webp", quality=90, method=6)

def fit(im, size):
    im = im.crop(bounds(im))
    scale = min((size[0]-4)/im.width, (size[1]-4)/im.height)
    im = im.resize((max(1, round(im.width*scale)), max(1, round(im.height*scale))), RESAMPLE)
    out = Image.new("RGBA", size)
    out.alpha_composite(im, ((size[0]-im.width)//2, (size[1]-im.height)//2))
    return out

def base(im, separate_weapon=False):
    a = np.asarray(im)[..., 3] > 128
    ys = np.nonzero(a.any(1))[0]
    bottom = int(ys[-1]); window = int((bottom-ys[0])*.13)
    if separate_weapon:
        # A low hammer can share a row with the base without belonging to it.
        # Measure contiguous opaque runs, not the span across disconnected objects.
        runs = []
        for y in range(bottom, max(0, bottom-window), -1):
            edges = np.diff(np.r_[False, a[y], False].astype(np.int8))
            for left, right in zip(np.nonzero(edges == 1)[0], np.nonzero(edges == -1)[0]):
                runs.append((int(right-left-1), float((left+right-1)/2), y))
        width, cx, cy = max(runs)
        return cx, float(cy), float(width)
    for _ in range(3):
        rows = []
        for y in range(bottom, max(0, bottom-window), -1):
            xs = np.nonzero(a[y])[0]
            if len(xs): rows.append((int(xs[-1]-xs[0]), (xs[0]+xs[-1])/2, y))
        width, cx, cy = max(rows)
        window = max(2, int(width*.17))
    return float(cx), float(cy), float(width)

def poses(name, names, size, anchor, base_width, separate_weapon=False):
    sheet = load(name)
    parts = [sheet.crop((i*sheet.width//len(names), 0, (i+1)*sheet.width//len(names), sheet.height)) for i in range(len(names))]
    # One common base width and anchor avoids a size/position jump when switching attack poses.
    boxes = [bounds(p) for p in parts]
    bases = [base(p, separate_weapon) for p in parts]
    scales = []
    for (x0,y0,x1,y1),(cx,cy,bw) in zip(boxes,bases):
        limits = [base_width/bw, (anchor[0]-2)/max(1,cx-x0), (size[0]-anchor[0]-2)/max(1,x1-cx), (anchor[1]-2)/max(1,cy-y0), (size[1]-anchor[1]-2)/max(1,y1-cy)]
        scales.append(min(limits)*bw)
    common_width = min(scales)
    results = []
    for part, (cx,cy,bw), outname in zip(parts,bases,names):
        scale = common_width/bw
        resized = part.resize((round(part.width*scale),round(part.height*scale)),RESAMPLE)
        offset = (round(anchor[0]-cx*scale),round(anchor[1]-cy*scale))
        out = Image.new("RGBA",size)
        out.alpha_composite(resized,offset)
        save(out,outname)
        results.append((out,scale,offset,part))
    manifest[name] = {"size":size,"anchor":anchor,"baseWidth":common_width}
    return results

def articulated(name, size, anchor, base_width, hip, pieces, pivots):
    full, scale, offset, source = poses(name,[name],size,anchor,base_width)[0]
    a = np.asarray(source)
    masks = {}
    for part, points in pieces.items():
        mask = Image.new("L",source.size)
        ImageDraw.Draw(mask).polygon([(round(x*source.width),round(y*source.height)) for x,y in points],fill=255)
        masks[part] = np.asarray(mask)>0
    upper = np.logical_or.reduce(list(masks.values()))
    yy = np.arange(source.height)[:,None]/source.height
    masks["legs"] = (yy >= hip) & ~upper
    masks["body" if name == "knight" else "torso"] = (yy < hip) & ~upper
    # A small overlap at cuts keeps moving wooden joints connected without leaving slivers.
    for part, mask in masks.items():
        if part in ("body","torso","legs"):
            mask = np.asarray(Image.fromarray(mask.astype("uint8")*255).filter(ImageFilter.MaxFilter(13)))>0
        rgba = a.copy(); rgba[...,3] = np.where(mask,a[...,3],0)
        layer = Image.fromarray(rgba).resize((round(source.width*scale),round(source.height*scale)),RESAMPLE)
        out = Image.new("RGBA",size); out.alpha_composite(layer,offset)
        save(out,f"{name}-{part}")
    manifest[name]["pivots"] = {key:[round(x*source.width*scale+offset[0],2),round(y*source.height*scale+offset[1],2)] for key,(x,y) in pivots.items()}
    return full

# Warp only the background's horizontal strips so its separators match the existing hit grid.
board = load("board").convert("RGB").resize((1344,768),RESAMPLE)
source_lines = [0,76,181,296,417,555,713,768]
target_lines = [0,58,160,270,390,521,664,768]
aligned = Image.new("RGB",board.size)
for a,b,c,d in zip(source_lines,source_lines[1:],target_lines,target_lines[1:]):
    aligned.paste(board.crop((0,a,1344,b)).resize((1344,d-c),RESAMPLE),(0,c))
save(aligned,"board")
# The high-camera castle is authored on the FULL board frame, not fitted to its visible bounds.
# Register ground contacts to the actual back/front borders. The old portrait fit preserved a
# shallow camera angle and left the far tower's base inside the board. No sideways skew is used.
BOARD_SIZE = (1344,768)
castle_source = load("castle-camera-v5").resize(BOARD_SIZE,RESAMPLE)
castle_alpha = np.asarray(castle_source)[...,3] > 128
near_ground = int(np.nonzero(castle_alpha.any(1))[0][-1])
castle_registration = {}
for src,dst in [("castle-camera-v5","castle-wall"),("castle-camera-cracked-v5","castle-wall-cracked"),("castle-camera-fallen-v5","castle-wall-fallen")]:
    source = load(src).resize(BOARD_SIZE,RESAMPLE)
    far,near = 82,near_ground  # visible ground contacts on the authored 45-degree view
    if dst == "castle-wall-fallen":
        # Everything in the low ruins lies on the ground: retain their full projected depth.
        occupied = (np.asarray(source)[...,3] > 128).sum(1) >= 3
        rows = np.nonzero(occupied)[0]
        far,near = int(rows[0]),int(rows[-1])
    scale = (664-58)/(near-far)
    offset = round(58-far*scale)
    registered = Image.new("RGBA",BOARD_SIZE)
    registered.alpha_composite(source.resize((1344,round(768*scale)),RESAMPLE),(0,offset))
    save(registered.crop((0,0,360,768)),dst)
    castle_registration[dst] = {"sourceGround": [far,near], "boardGround": [58,664], "scaleY":scale,"offsetY":offset}
manifest["castle"] = {"canvas": [360,768], "registration":castle_registration}

knight = articulated("knight",(200,240),(99,205),133,.65,{
    "head":[(.23,0),(.67,0),(.67,.40),(.59,.414),(.40,.41),(.31,.395),(.31,.25),(.23,.25)],
    "sword-arm":[(0,0),(.23,0),(.23,.25),(.32,.36),(.41,.41),(.41,.47),(.35,.51),(.12,.48),(0,.39)],
    "shield-arm":[(.60,.405),(.69,.37),(1,.25),(1,.72),(.68,.72),(.63,.54),(.59,.48)],
},{"body":(.50,.64),"head":(.50,.40),"sword":(.374,.445),"shield":(.625,.445)})
giant = articulated("giant",(420,520),(226,440),310,.55,{
    "head":[(.43,.02),(.66,.02),(.68,.17),(.64,.29),(.61,.40),(.45,.41),(.43,.31),(.42,.20)],
    "right-arm":[(0,.29),(.32,.29),(.42,.23),(.45,.30),(.42,.37),(.35,.42),(.31,.50),(.25,.56),(.25,.70),(0,.70)],
    "left-arm":[(.70,.20),(.82,.20),(1,.20),(1,.50),(.88,.53),(.80,.45),(.71,.36),(.68,.30)],
},{"torso":(.57,.55),"head":(.54,.31),"right":(.39,.285),"left":(.75,.26)})
archer = poses("archer",["archer-ready","archer-draw"],(180,220),(82,188),122)[0][0]
wall = poses("wall",["stone-wall","stone-wall-cracked"],(200,180),(91,135),172)[0][0]
poses("goblin",["goblin-walk","goblin-attack"],(210,220),(130,185),91)
poses("wolf",["wolf-run","wolf-leap"],(220,160),(113,123),140)
# Extra room on the left keeps the lowered hammer inside the canvas at the walking scale.
poses("troll",["troll-walk","troll-smash"],(330,300),(200,252),182,separate_weapon=True)

sheet=load("props")
props=[("lv2-pennant-archer",(64,96)),("lv2-pennant-knight",(64,96)),("lv2-wall-course",(130,53)),("lv3-wall-spikes",(110,79)),("coin",(64,64)),("heart",(64,64)),("arrow",(64,16)),("dust-puff",(160,120))]
for i,(name,size) in enumerate(props):
    x=i%4;y=i//4
    tile=sheet.crop((x*sheet.width//4,y*sheet.height//2,(x+1)*sheet.width//4,(y+1)*sheet.height//2))
    save(fit(tile,size),name)
save(fit(sheet.crop((sheet.width//4,0,sheet.width//2,sheet.height//2)),(96,160)),"banner-cloth")
# Existing level-three glow supplies the gold upgrade treatment; no mismatched Classic base rims.
for name,size in [("archer",(180,220)),("knight",(200,240)),("wall",(200,180))]:
    save(Image.new("RGBA",size),f"lv3-trim-{name}")
for name,im in [("knight",knight),("archer",archer),("stone-wall",wall)]:
    save(fit(im,(128,128)),f"phone/{name}-icon")
for name in ("coin","heart"):
    save(Image.open(OUT/f"{name}.webp"),f"phone/{name}")
(OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(f"Prepared {len(list(OUT.rglob('*.webp')))} Toybox assets in {OUT}")

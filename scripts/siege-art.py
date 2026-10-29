#!/usr/bin/env python3
"""Kingdom Siege art pipeline: generated sources in scripts/siege-art/ -> WebP in siege/ and siege/phone/.

    python3 scripts/siege-art.py [preview.png]     (run from the siege/ folder; needs Pillow and numpy)

Style C (tabletop miniatures), from mockup C1, the bright daytime meadow. Every figure is a painted
2D sprite of a hand-painted miniature on a round base, lit from the upper left like the board.
Sources are generated on a flat magenta screen (the dust puff on green); this script keys them,
lines every pose up on its base, scales each figure to its spec size, cuts the knight and the giant
into pieces, measures the board's lane squares, and writes manifest.md and the preview.

Prompts (GenerateImage; every source was generated at the tool's full size, 1280x720, 720x1280,
1024x1024 or 1152x864, and only scaled DOWN here, except the board and the castle strip, which the
tool cannot make at 768 px tall: they are scaled up 1.05x and 0.6x-of-a-1280-tall source respectively):
"""

PROMPTS = {  # castle v1 prompts (brown brick, round turret, iron banner arms) were replaced by v2; the v1 sources (scripts/siege-art/v1-castle*.jpg) and layout-reference.jpg / style-reference.jpg were removed; recover them from commit 2a65a3c
    "board": "Empty tabletop miniatures game board diorama, 16:9, seen from a slightly tilted high angle straight on from the front (camera centred, looking slightly down, lanes perfectly horizontal and parallel). Five equal-width straight horizontal grass lanes run the full width of the board from left edge to right edge, separated by four low straight borders of small stacked grey stones with little hedge tufts, plus a stone border along the top and bottom edges. Each lane is divided into 8 square grass plots in a subtle checkerboard of slightly lighter and darker flocked meadow grass, like a game board. Hand-painted static grass flock, tiny yellow and white flowers, a few pebbles. Bright daytime, warm sunlight from the upper left, soft tilt-shift blur at the far top edge. Absolutely empty: no figures, no miniatures, no castle, no buildings, no people, no text. Semi-realistic painterly diorama style matching the reference image. [reference: mockups/src-c1-alt.jpg]",
    "castle": "Edit of image 1 (two passes). Pass 1 [references: v1-castle.jpg for layout, mockups/castle-reference.png for style, saved as mockups/castle-v2-try2.jpg]: Restyle of image 1: keep exactly the same composition, silhouette, framing, size and camera angle as the castle wall in image 1, on the same flat pure magenta (#FF00FF) background, with its right edge in the same place and the wall running from the top edge to the bottom edge of the frame, but build it in the style of the castle in image 2: a hand-painted tabletop miniature / model kit castle of light warm-grey stone made of big chunky rectangular blocks, crisp square crenellations, a little moss at the base, glossy varnish, warm sunlight from the upper left. Replace the round turret with plain flat wall. Remove all iron poles and arms. Turn the small chapel at the top into a square corner tower with crenellations and a small arched window, topped by a pointed blue slate spire with a gold cross. Hang three blue heraldic banners with a white border and a large gold cross flat against the wall's big front face near its right edge, at the top, middle and bottom, each from a short rod fixed to the wall. Plain magenta to the right. No ground, no figures, no text, nothing pagan. Pass 2 (this file) [references: castle-v2-try2.jpg, mockups/castle-reference.png]: keep exactly the same composition, silhouette, framing, camera angle, wall outline, right edge, spire tower and the three banners in the same places on flat magenta; only rebuild the stonework from much BIGGER chunky model-kit stone blocks (about 12 to 14 courses over the full height, bevelled edges, deep mortar gaps) in LIGHT GREY stone (not brown, not tan), dry-brushed highlights, big crisp square merlons, a little moss low on the wall, glossy varnish, warm upper-left sunlight. No iron poles, no round turret, no ground, no figures, no text. [9:16; the script then greys the tan cast a little: CASTLE_GRADE]",
    "castle-cracked": "The same castle wall as the reference image, battle-damaged: keep exactly the same composition, framing, camera angle, silhouette, outline, right edge, stone blocks, colours and lighting, on the same flat pure magenta (#FF00FF) background, so it lines up pixel for pixel with the reference. Now the wall is cracked and battered: several long deep cracks through the big grey stone blocks of the front face, chipped and broken blocks, two or three crenellations knocked off leaving gaps, a few blocks missing showing darker holes, some fallen stone fragments at the foot. The small spire tower with the gold cross is intact. The three blue banners with gold crosses still hang flat on the face in the same places but slightly torn and frayed at the bottom. Hand-painted tabletop miniature style, glossy varnish. No fire, no smoke, no figures, no text, plain magenta around the wall. [9:16; reference: castle.jpg]",
    "castle-fallen": "The same castle wall as the reference image after it has completely collapsed: same framing, same camera angle, same big chunky light-grey model-kit stone blocks, colours and lighting, on the same flat pure magenta (#FF00FF) background. Now only a low ruined stump of wall and a big sloping pile of tumbled grey stone blocks, broken crenellations and stone dust fills the bottom half of the frame, spreading across the same width as the wall's footprint; a few blocks lie scattered. The small spire tower with its slate-blue spire and gold cross is still standing on its own near the upper left, undamaged. No banners at all. Hand-painted tabletop miniature diorama style, glossy varnish. No figures, no fire, no smoke, no text, plain magenta above and right of the rubble. [9:16; reference: castle.jpg]",
    "banner-cloth": "A single hand-painted tabletop miniature cloth banner, front view, flat and centred on a flat pure magenta (#FF00FF) background with wide margins: a tall rectangular blue-and-white heraldic banner hanging straight down from a short horizontal wooden crossbar rod with small gold finials at both ends, the cloth royal blue with a white border, a large gold cross in the middle, and a swallow-tailed bottom edge, with gentle soft folds. Painted cloth with visible brushwork, slightly glossy varnish, warm sunlight from the upper left. Matches the banners on the castle in the reference image. No pole below, no wall, no text. [9:16; reference: mockups/src-c1.jpg]",
    "knight": "Hand-painted fantasy tabletop miniature figure of a knight on a round sculpted base, isolated on a flat pure magenta (#FF00FF) background, full figure centred with margin around it. Seen from a slightly high front three-quarter angle like a miniature on a game board (the round base reads as an ellipse), the knight faces and steps toward the right of the image. Steel plate armour with blue-and-white surcoat bearing a small gold cross, closed great helm with a blue plume. Pose built for cut-out animation: both arms held clearly away from the body with magenta visible between arms and torso - his sword arm raised out and up holding a longsword pointing up and back, his shield arm held forward to the right with a blue kite shield with a gold cross, legs apart in a firm stance. The base is a round dark-brown rimmed base with painted grass flock, the same style as the reference image. Visible brushwork, slightly glossy varnish, warm sunlight from the upper left. Semi-realistic and serious, not cartoonish. No text, no other objects. [1:1; reference: mockups/src-c1.jpg. The knight is the base-style reference for every other figure]",
    "archer": "Two hand-painted fantasy tabletop miniature figures of the same archer, side by side, on a flat pure magenta (#FF00FF) background, same sculpt, paint scheme, scale, round base and lighting as the knight miniature in the reference image. Both face and aim toward the right of the image, seen from the same slightly high front three-quarter angle, each standing on an identical round dark-brown rimmed base with grass flock, with plenty of magenta between them. The archer wears a forest-brown hooded leather jerkin over a blue-and-white tunic with a small gold cross, a quiver of arrows on the back, and holds a wooden longbow. Left figure: READY pose, bow held low in front, an arrow nocked but not drawn, alert. Right figure: DRAWING pose, bow raised and aimed to the right, string pulled back to the cheek. Visible brushwork, slightly glossy varnish, warm sunlight from the upper left. Semi-realistic, serious, not cartoonish. No text. [16:9; reference: knight.jpg]",
    "stone-wall": "Two hand-painted tabletop miniature terrain pieces side by side on a flat pure magenta (#FF00FF) background, same style, scale, round base and lighting as the knight miniature in the reference image, seen from the same slightly high front three-quarter angle, with plenty of magenta between them. Each is a short defensive wall block of stacked grey dry-stone blocks (about three courses high, slightly wider than tall, its long face turned toward the viewer) standing on an identical round dark-brown rimmed base with grass flock. Left: INTACT, solid and neat, a little moss. Right: the SAME wall block, identical shape and position on its base, but CRACKED and battered: deep cracks, chipped corners, two stones knocked loose, a few fragments on the base. Visible brushwork, slightly glossy varnish, warm sunlight from the upper left. No text, no figures. [16:9; reference: knight.jpg]",
    "level-details": "Sheet of five separate small hand-painted tabletop miniature accessory pieces, evenly spaced in a row with lots of flat pure magenta (#FF00FF) background between them, same painting style, stone colours and warm upper-left lighting as the reference image, seen from the same slightly high front angle. No bases under these pieces. 1) A small swallow-tailed blue-and-white pennant with a gold cross on a short thin wooden staff with a gold tip, pennant fluttering to the right. 2) A slightly larger rectangular blue banner with a gold cross on a tall thin wooden pole with a gold finial, the kind a knight wears strapped to his back. 3) A single straight row of grey dry-stone blocks, one course, about five blocks long, matching the stone wall in the reference, with a little moss. 4) A straight row of five dark iron spikes on a short wooden beam, spikes pointing up and slightly forward, battered metal. 5) An empty ornate gold ring band (not used: the Lv 3 gold trim is the figure's own base rim re-painted gold, below). Visible brushwork, slightly glossy varnish. No text, no figures. [16:9; reference: stone-wall.jpg]",
    "goblin": "Two hand-painted fantasy tabletop miniature figures of the same goblin, side by side on a flat pure magenta (#FF00FF) background with plenty of magenta between them, same sculpt and paint scheme, same scale, same round dark-brown rimmed base with grass flock, same slightly high front three-quarter camera angle and warm upper-left lighting as the knight miniature in the reference. Both face and move toward the LEFT of the image. A wiry olive-green goblin with pointed ears, leather scraps, a crude iron helmet and a small round wooden buckler, a menacing but not gory classic fantasy goblin. Left figure: WALKING pose, mid-stride, spear held upright. Right figure: ATTACKING pose, lunging to the left and thrusting the spear forward to the left. Visible brushwork, slightly glossy varnish. Semi-realistic and serious, not cartoonish, nothing demonic, no blood, no text. [16:9; reference: knight.jpg]",
    "wolf": "Two hand-painted fantasy tabletop miniature figures of the same grey wolf, side by side on a flat pure magenta (#FF00FF) background with plenty of magenta between them, same sculpt and paint, same scale, each on an identical oval dark-brown rimmed base with grass flock (wider than tall, like a cavalry base), same slightly high three-quarter camera angle and warm upper-left lighting as the knight miniature in the reference. Both wolves face and move toward the LEFT of the image, seen mostly in side profile. A lean shaggy grey-brown wild wolf with amber eyes, a natural classic fantasy wolf, fierce but not gory, nothing demonic, no blood. Left figure: RUNNING pose, mid-gallop, paws touching the base. Right figure: LEAPING pose, body stretched in a jump to the left, front paws forward, rear paws just leaving the base, supported by a small sculpted rock on the base. Visible brushwork, slightly glossy varnish, semi-realistic. No text. [16:9; reference: knight.jpg]",
    "troll": "Two hand-painted fantasy tabletop miniature figures of the same troll, side by side on a flat pure magenta (#FF00FF) background with plenty of magenta between them, same sculpt and paint, same scale, each on an identical large round dark-brown rimmed base with grass flock, same slightly high front three-quarter camera angle and warm upper-left lighting as the knight miniature in the reference. Both face and move toward the LEFT of the image. A huge hulking classic fantasy cave troll with mottled grey-green warty skin, a heavy brow, small tusks, a ragged leather loincloth and belt, carrying a big knotted wooden club; brutish and menacing but not gory, nothing demonic, no blood. Left figure: WALKING pose, lumbering stride, club resting over its shoulder. Right figure: SMASHING pose, club raised high over its head with both hands, about to bring it down to the left. Visible brushwork, slightly glossy varnish, semi-realistic and serious. Keep the whole club inside the frame. No text. [16:9; reference: knight.jpg. Only the left (walking) figure is used]",
    "troll-smash": "The same troll miniature as the right-hand figure in the reference image (identical sculpt, skin, loincloth, club, base and painting style, same camera angle and warm upper-left lighting), alone and centred on a flat pure magenta (#FF00FF) background, in a much stronger SMASHING pose: it leans forward to the left and swings the big knotted club down hard toward the ground in front of it on the left with both hands, the club head low near the base edge on the left, shoulders hunched, mouth open in a roar. Same round dark-brown rimmed base with grass flock. Facing left. Brutish but not gory, nothing demonic, no blood. Whole figure and club inside the frame with margin. No text. [1:1; reference: troll.jpg]",
    "giant": "Hand-painted fantasy tabletop miniature of a hill giant, a large boss figure, alone and centred on a flat pure magenta (#FF00FF) background with margin all around, on a large round dark-brown rimmed base with grass flock and a few rocks, same painting style, base style, slightly high front three-quarter camera angle and warm upper-left lighting as the knight miniature in the reference. The giant faces and strides toward the LEFT of the image. A towering classic fantasy hill giant: weathered tan skin, wild braided brown beard and hair, heavy brow, a rough fur cloak over one shoulder, leather kilt with iron-studded belt, bracers, bare muscular arms, and a huge club made from a tree trunk banded with iron. Pose built for cut-out animation: both arms held clearly away from the torso with magenta visible between arms and body; the club arm extended out and down to the left side holding the club angled down, the other arm bent out to the right side with an open hand; legs apart in a wide stomping stance. Imposing and serious, not cartoonish, nothing demonic, no horns, no blood. Visible brushwork, slightly glossy varnish. No text. [1:1; reference: knight.jpg]",
    "icons": "Three separate hand-painted game icons in the style of painted tabletop miniature props, evenly spaced in a row with wide flat pure magenta (#FF00FF) background between and around them, warm sunlight from the upper left, visible brushwork and slightly glossy varnish, semi-realistic. 1) A single thick gold coin seen face-on, stamped with a small cross, worn gold with a bright rim highlight. 2) A single solid heart shape carved from deep red enamel set in a thin gold bezel, like a painted miniature token, face-on. 3) A single long wooden arrow lying perfectly horizontal pointing to the right, steel broadhead on the right, white-and-blue fletching on the left, thin straight shaft. No text, nothing else. [16:9; reference: level-details.jpg]",
    "dust": "A single soft puff cloud of grey dust, like the dust kicked up when a heavy stone or a miniature hits a tabletop diorama: a low, wide, billowing cloud of fine powdery grey dust with a few tiny pebbles flying out, wider than tall, flat bottom, centred on a flat pure chroma green (#00FF00) background with wide margins. Soft painterly look, warm light from the upper left. Neutral grey dust only, no fire, no smoke column, no text. [4:3]",
}

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ----------------------------------------------------------------------------------------------
# Settings
HERE = Path(__file__).resolve().parent
SRC = HERE / "siege-art"
OUT = HERE.parent  # siege/
PHONE = OUT / "phone"
QUALITY = 88

BOARD_SIZE = (1344, 768)
LANES, COLS = 5, 8
# Stone-border centre lines on the 1344x768 board (measured from the stone bands at x ~ 300-1100;
# they are level to within 3 px), top border first.
BORDERS_Y = [58, 160, 270, 390, 521, 664]
BORDER_HALF = 9  # half the visible stone band; the lane square starts this far below/above a border
# The board's right-hand edge line (the meadow beyond is not board): x = A + B * (y - 64), clipped to the image.
BOARD_RIGHT = (1262, 0.291)
CHECKER = (1.065, 0.945)  # light / dark square multipliers painted over the (flattened) grass

CASTLE_SIZE = (360, 768)
CASTLE_FACE_X = 242  # the wall face (edge toward the lanes) lands here; the crop of the 720x1280 sources is shifted to match (x 0.6)
CASTLE_GRADE = dict(max_sat=0.42, chroma=0.35, lift=1.06, tint=(1.03, 1.0, 0.95))  # tan stone -> C1 light grey
COURSE_CUT = (23.0, 0.217)  # Lv 2 course: keep the top block row, above y = 23 + 0.217·x (rotated crop, 102 px tall)
FALLEN_FADE = (300, 360)  # the rubble pile spills wider than the strip: fade it out over these x
BANNER_SIZE = (96, 160)

# Figures: source sheet, the poses on it (left to right column segments), output names, canvas size.
# Every pose of one figure is scaled so its base is the same width, lined up on the base centre and
# put on one shared canvas sized to the spec.
FIGURES = {
    "archer": dict(poses=[("archer", 0, "archer-ready"), ("archer", 1, "archer-draw")], size=(180, 220)),
    "stone-wall": dict(poses=[("stone-wall", 0, "stone-wall"), ("stone-wall", 1, "stone-wall-cracked")], size=(200, 180)),
    "goblin": dict(poses=[("goblin", 0, "goblin-walk"), ("goblin", 1, "goblin-attack")], size=(150, 180)),
    "wolf": dict(poses=[("wolf", 0, "wolf-run"), ("wolf", 1, "wolf-leap")], size=(220, 160)),
    "troll": dict(poses=[("troll", 0, "troll-walk"), ("troll-smash", 0, "troll-smash")], size=(280, 300)),
    "knight": dict(poses=[("knight", 0, "knight")], size=(200, 240)),
    "giant": dict(poses=[("giant", 0, "giant")], size=(420, 520)),
}
SHADOW_ALPHA = 0.30  # baked soft contact shadow under every base, offset down-right (light from upper left)
RIM_H = 0.13  # base rim height as a fraction of the base width (all bases share one sculpt)

# Cut-out pieces, in the source image's pixels. Each piece is a polygon of the source; "fill" polygons
# are painted in (colour spread from the surrounding body) on the layer underneath so nothing opens up
# when a piece swings. Layer order = list order (first is drawn first, at the back).
CUTOUTS = {
    "knight": dict(
        hip_y=566,  # body above, legs and base below (with an overlap under the body's soft edge)
        pieces=[
            ("knight-legs", "legs", (512, 820)),  # pivot: base centre (= the figure's anchor)
            ("knight-body", "body", (512, 560)),  # pivot: hips
            ("knight-head", [(410, 150), (618, 150), (618, 300), (600, 330), (592, 364), (498, 366), (488, 336), (484, 296), (410, 266)], (542, 360)),
            ("knight-sword-arm", [(195, 40), (335, 40), (335, 286), (400, 296), (470, 312), (482, 336), (478, 372), (466, 404), (420, 412), (345, 442), (285, 446), (238, 360), (195, 200)], (458, 362)),
            ("knight-shield-arm", [(578, 352), (602, 326), (650, 330), (735, 342), (735, 618), (660, 618), (600, 568), (578, 470)], (612, 364)),
        ],
        fill=[  # polygons on the body layer to paint in
            [(486, 318), (596, 318), (594, 372), (486, 372)],          # neck under the helmet
            [(574, 350), (604, 340), (606, 560), (574, 560)],  # torso side under the shield
            [(430, 336), (484, 330), (484, 412), (440, 412)],          # shoulder under the sword arm
        ],
    ),
    "giant": dict(
        hip_y=598,
        pieces=[
            ("giant-legs", "legs", (516, 873)),
            ("giant-torso", "body", (520, 598)),
            ("giant-head", [(436, 92), (604, 92), (606, 200), (590, 252), (566, 296), (520, 306), (466, 290), (414, 306), (410, 200), (428, 140)], (516, 286)),
            ("giant-right-arm", [(92, 428), (290, 330), (330, 300), (370, 284), (398, 296), (402, 345), (403, 400), (382, 430), (372, 470), (352, 546), (300, 640), (230, 792), (92, 792)], (374, 330)),
            ("giant-left-arm", [(624, 214), (700, 224), (736, 290), (766, 338), (800, 352), (806, 470), (806, 560), (746, 562), (690, 532), (684, 500), (700, 460), (698, 402), (686, 372), (660, 332), (632, 302), (620, 250)], (650, 248)),
        ],
        fill=[
            [(440, 224), (474, 206), (566, 206), (602, 224), (606, 250), (570, 300), (520, 312), (415, 306), (424, 250)],   # chest and fur under the head (not above the shoulders)
            [(370, 286), (404, 286), (404, 412), (370, 412)],               # side under the club arm
            [(614, 214), (656, 224), (676, 300), (692, 380), (640, 380), (614, 300)],  # side under the left arm
            [(686, 440), (722, 440), (748, 560), (686, 560)],               # cloak behind the left hand
        ],
    ),
}

# Level details: (source sheet segment, output name, target width, rotation in degrees (counter-clockwise),
# and where it attaches). Attach points are measured on the output canvases in main().
DETAILS = {
    "lv2-pennant-archer": dict(seg=0, w=64, h=96),
    "lv2-pennant-knight": dict(seg=1, w=64, h=96),
    "lv2-wall-course": dict(seg=2),   # sized to the wall block's top in main()
    "lv3-wall-spikes": dict(seg=3),
}
ICON_SIZE = 64
ARROW_SIZE = (64, 16)
DUST_SIZE = (160, 120)
PHONE_ICONS = {"archer-icon": "archer-ready", "knight-icon": "knight", "stone-wall-icon": "stone-wall"}
PHONE_ICON = 128

# ----------------------------------------------------------------------------------------------
# Keying


def blur(a: np.ndarray, r: int) -> np.ndarray:
    """Box blur, twice (about Gaussian), of a 2-D float array, radius r px."""
    r = max(1, int(r))
    for _ in range(2):
        for ax in (0, 1):
            pad = [(r + 1, r) if i == ax else (0, 0) for i in range(2)]
            c = np.cumsum(np.pad(a, pad, mode="edge"), axis=ax)
            a = (c[2 * r + 1:] - c[:-2 * r - 1]) if ax == 0 else (c[:, 2 * r + 1:] - c[:, :-2 * r - 1])
            a = a / (2 * r + 1)
    return a


def mask_img(m: np.ndarray) -> Image.Image:
    return Image.fromarray((m * 255).astype(np.uint8))


def key_field(rgb: np.ndarray) -> np.ndarray:
    """The screen colour at every pixel (the magenta drifts a little across each source)."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    sure = (g < 30) & (r > 120) & (r - b > 40)
    gs = 32
    gh, gw = (h + gs - 1) // gs, (w + gs - 1) // gs
    grid = np.zeros((gh, gw, 3)); have = np.zeros((gh, gw), bool)
    for i in range(gh):
        for j in range(gw):
            m = sure[i * gs:(i + 1) * gs, j * gs:(j + 1) * gs]
            if m.sum() > gs * gs * 0.3:
                grid[i, j] = np.median(rgb[i * gs:(i + 1) * gs, j * gs:(j + 1) * gs][m], axis=0)
                have[i, j] = True
    while not have.all():
        g2, new = grid.copy(), have.copy()
        for i in range(gh):
            for j in range(gw):
                if have[i, j]:
                    continue
                acc = [grid[ii, jj] for ii in range(i - 1, i + 2) for jj in range(j - 1, j + 2)
                       if 0 <= ii < gh and 0 <= jj < gw and have[ii, jj]]
                if acc:
                    g2[i, j] = np.mean(acc, 0); new[i, j] = True
        grid, have = g2, new
    return np.asarray(Image.fromarray(np.clip(grid, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)).astype(np.float32)


def background_region(strict: np.ndarray) -> np.ndarray:
    """Key-coloured areas big enough to be background (not specks): eroded seeds grown back."""
    cur = np.asarray(mask_img(strict).filter(ImageFilter.MinFilter(7))) > 0
    for _ in range(400):
        grown = (np.asarray(mask_img(cur).filter(ImageFilter.MaxFilter(9))) > 0) & strict
        if (grown == cur).all():
            break
        cur = grown
    return cur


def border_connected(mask: np.ndarray) -> np.ndarray:
    m = mask_img(mask).convert("L")
    h, w = mask.shape
    seeds = [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)] + \
            [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]
    for p in seeds:
        if m.getpixel(p) == 255:
            ImageDraw.floodfill(m, p, 128)
    return np.asarray(m) == 128


def key_magenta(im: Image.Image, holes: str = "key", despill: bool = False) -> Image.Image:
    """Magenta screen -> RGBA.
    * background = the key colour, or the key colour darker/lighter (its cast shadows), in regions
      too big to be a speck; holes='fill' keeps enclosed areas solid (the red heart);
    * alpha ramps with the distance from the key, only along the background's edge;
    * the edge takes its colour from the solid figure just inside it, so the rim carries no magenta
      (and no over-corrected green either); thin bits with no solid neighbour are un-mixed and greyed."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    key = key_field(rgb)
    t = (rgb * key).sum(-1) / ((key ** 2).sum(-1) + 1)
    res = np.sqrt(((rgb - t[..., None] * key) ** 2).sum(-1))
    dist = np.sqrt(((rgb - key) ** 2).sum(-1))
    shade = (res < 16) & (t > 0.45)
    alpha = np.clip((dist - 40) / 60, 0, 1)
    alpha[shade] = 0
    bg = background_region((dist < 30) | shade)
    if holes == "fill":
        bg = border_connected(bg)
    near = np.asarray(mask_img(bg).filter(ImageFilter.MaxFilter(13))) > 0
    small = (dist < 30) & ~bg
    if holes == "fill":
        small &= False
    sn = np.asarray(mask_img(small).filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.where(bg | small, 0.0, np.where(near | sn, alpha, 1.0))
    solid_b = np.asarray(mask_img(alpha >= 0.97).filter(ImageFilter.MinFilter(5))) > 0
    solid = solid_b.astype(np.float32)
    out = rgb.copy()
    num = rgb * solid[..., None]
    acc_n = np.zeros_like(num); acc_d = np.zeros_like(solid)
    for rad in (1, 3, 6):
        n = np.dstack([blur(num[..., i], rad) for i in range(3)])
        d = blur(solid, rad)
        take = (acc_d < 1e-3) & (d > 1e-3)
        acc_n[take] = n[take]; acc_d[take] = d[take]
    edge = (~solid_b) & (alpha > 0) & (acc_d > 1e-3)
    out[edge] = acc_n[edge] / acc_d[edge][..., None]
    lone = (~solid_b) & (alpha > 0) & (acc_d <= 1e-3)
    if lone.any():
        a = np.maximum(alpha, 0.25)[..., None]
        um = np.clip((rgb - key * (1 - alpha[..., None])) / a, 0, 255)
        out[lone] = (um.mean(-1, keepdims=True) * 0.8 + um * 0.2)[lone]
    # leftover screen-coloured specks inside a figure (reflections of the screen): grey them
    oc = out - out.mean(-1, keepdims=True)
    kc = key - key.mean(-1, keepdims=True)
    cos = (oc * kc).sum(-1) / (np.linalg.norm(oc, axis=-1) * np.linalg.norm(kc, axis=-1) + 1e-6)
    pink = (cos > 0.97) & (np.linalg.norm(oc, axis=-1) > 30) & (holes != "fill")
    out = np.where(pink[..., None], out.mean(-1, keepdims=True), out)
    if despill:
        # castles: the painted ground fringe around the rubble is crimson-tinted; near the
        # background turn anything key-coloured into a warm stone-dust grey
        near2 = np.asarray(mask_img(bg).filter(ImageFilter.MaxFilter(61))) > 0
        low = (np.arange(rgb.shape[0]) > rgb.shape[0] * 0.5)[:, None]   # not the slate-blue spire
        purple = low & (out[..., 2] > out[..., 1] + 15)
        sp = near2 & (((cos > 0.7) & (np.linalg.norm(oc, axis=-1) > 12)) | purple)
        g = out.mean(-1, keepdims=True)
        out = np.where(sp[..., None], g * np.array([1.06, 1.0, 0.92]), out)
    alpha[alpha < 0.05] = 0
    out[alpha == 0] = 0
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")


def dust_key(im: Image.Image) -> Image.Image:
    """Grey dust on green: alpha from how much green is left over (the dust is neutral), colour
    un-mixed from the key and made a warm dusty grey, so the soft edges carry no green."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    key = np.median(np.stack([rgb[3, 3], rgb[3, -4], rgb[-4, 3], rgb[-4, -4]]), axis=0)
    excess = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    k = key[1] - max(key[0], key[2])
    alpha = np.clip(1 - excess / (k * 0.92), 0, 1)
    alpha = np.clip((alpha - 0.05) / 0.95, 0, 1)
    a = np.maximum(alpha, 0.05)[..., None]
    obj = np.clip((rgb - key * (1 - alpha[..., None])) / a, 0, 255)
    grey = obj[..., [0, 2]].mean(-1)
    out = np.dstack([grey * 1.03, grey * 0.99, grey * 0.93, alpha * 255])
    out[alpha == 0] = 0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def cross_mask(k: Image.Image) -> np.ndarray:
    """The gold cross on the spire (top of the intact wall), so the grade leaves it gold in every
    state (the three states line up, so one mask serves all)."""
    a = np.asarray(k).astype(np.int32)
    m = (a[..., 0] - a[..., 2] > 45) & (a[..., 0] > a[..., 1]) & (a[..., 3] > 128)
    m[int(k.height * 0.12):] = False
    return np.asarray(mask_img(m).filter(ImageFilter.MaxFilter(9))) > 0


def castle_grade(k: Image.Image, protect=None) -> Image.Image:
    """Pull the generated tan stone toward the C1 mockup's light grey: low-saturation warm pixels
    lose most of their chroma and are lifted a little; blue cloth, gold and moss are left alone."""
    a = np.asarray(k).astype(np.float32)
    rgb = a[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1)
    warm = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 0] >= rgb[..., 2])   # tan, and the pinkish cast off the screen
    w = (warm & (sat < CASTLE_GRADE["max_sat"])).astype(np.float32)
    if protect is not None:
        w[protect] = 0
    w = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    grey = lum[..., None] * np.array(CASTLE_GRADE["tint"], np.float32)
    toned = grey + (rgb - lum[..., None]) * CASTLE_GRADE["chroma"]
    toned = toned * CASTLE_GRADE["lift"]
    a[..., :3] = np.clip(rgb * (1 - w[..., None]) + toned * w[..., None], 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def stone_lum(k: Image.Image) -> float:
    a = np.asarray(k).astype(np.float32)
    m = a[..., 3] > 250
    return float(np.median(a[..., :3][m] @ np.array([0.299, 0.587, 0.114], np.float32)))


def match_lum(k: Image.Image, target: float) -> Image.Image:
    """The cracked wall came out a little darker than the intact one: match its median brightness."""
    g = target / max(stone_lum(k), 1)
    a = np.asarray(k).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] * g, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def find_banners(k: Image.Image):
    """Bounding boxes of the blue banner cloths painted on a wall layer, top to bottom."""
    a = np.asarray(k).astype(np.int32)
    blue = (a[..., 2] > a[..., 0] + 40) & (a[..., 2] > a[..., 1] + 20) & (a[..., 3] > 200)
    blue[: int(k.height * 0.15)] = False   # not the slate spire
    rows = np.nonzero(blue.sum(1) > 6)[0]
    groups = []
    for y in rows:
        if groups and y - groups[-1][-1] <= 8:
            groups[-1].append(y)
        else:
            groups.append([y])
    out = []
    for g in groups:
        if len(g) < 20:
            continue
        sub = blue[g[0]:g[-1] + 1]
        xs = np.nonzero(sub.any(0))[0]
        out.append((int(xs.min()), int(g[0]), int(xs.max()) + 1, int(g[-1]) + 1))
    return out


# ----------------------------------------------------------------------------------------------
# Helpers


def segments(k: Image.Image, min_w: int = 6):
    """Left-to-right column runs that hold something (the figures on a sheet)."""
    occ = (np.asarray(k)[..., 3] > 40).any(0)
    segs, start = [], None
    for x, o in enumerate(list(occ) + [False]):
        if o and start is None:
            start = x
        if not o and start is not None:
            if x - start > min_w:
                segs.append((start, x))
            start = None
    return segs


def bbox(im: Image.Image, thresh: int = 8):
    a = np.asarray(im)[..., 3] > thresh
    ys, xs = np.nonzero(a)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def base_of(im: Image.Image) -> dict:
    """The round base: its width, the centre of its footprint (bottom ellipse) and its bottom row."""
    a = np.asarray(im)[..., 3] > 128
    rows = np.nonzero(a.any(1))[0]
    top, bot = rows[0], rows[-1]
    win = int((bot - top) * 0.1)
    for _ in range(3):
        best = None
        for y in range(bot, bot - win, -1):
            xs = np.nonzero(a[y])[0]
            if len(xs) and (best is None or xs[-1] - xs[0] > best[2] - best[1]):
                best = (y, xs[0], xs[-1])
        win = int((best[2] - best[1]) * 0.2)
    y, l, r = best
    return dict(w=float(r - l), cx=(l + r) / 2, eq=float(y), bot=float(bot))


def resize(im: Image.Image, s: float) -> Image.Image:
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)


def place(canvas: Image.Image, im: Image.Image, xy):
    canvas.alpha_composite(im, (int(round(xy[0])), int(round(xy[1]))))


def poly_mask(size, poly, scale=1) -> np.ndarray:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([(x * scale, y * scale) for x, y in poly], fill=255)
    return np.asarray(m) > 127


def spread_fill(rgb: np.ndarray, known: np.ndarray, region: np.ndarray) -> np.ndarray:
    """Paint 'region' with colour spread in from the 'known' pixels around it (multi-scale)."""
    out = rgb.copy()
    k = known.astype(np.float32)
    done = np.zeros(region.shape, bool)
    for rad in (2, 4, 8, 16, 32, 64):
        n = np.dstack([blur(rgb[..., i] * k, rad) for i in range(3)])
        d = blur(k, rad)
        take = region & ~done & (d > 0.02)
        out[take] = n[take] / d[take][..., None]
        done |= take
    # a little of the original texture's grain so the fill isn't flat
    noise = (np.random.default_rng(7).standard_normal(region.shape) * 6)[..., None]
    out[region] = np.clip(out[region] + noise[region], 0, 255)
    return out


def drop_shadow(size, cx, cy, w) -> Image.Image:
    cx, cy, w = float(np.asarray(cx).ravel()[0]), float(np.asarray(cy).ravel()[0]), float(np.asarray(w).ravel()[0])
    """Soft contact shadow under a base, down and right of it (light from the upper left)."""
    W, H = size
    s = Image.new("L", (W * 2, H * 2), 0)
    a, b = w * 0.53, w * 0.19
    ox, oy = cx + w * 0.05, cy + w * 0.035
    ImageDraw.Draw(s).ellipse([(ox - a) * 2, (oy - b) * 2, (ox + a) * 2, (oy + b) * 2], fill=int(255 * SHADOW_ALPHA))
    s = s.filter(ImageFilter.GaussianBlur(float(w) * 0.1)).resize((W, H), Image.Resampling.LANCZOS)
    sh = Image.new("RGBA", size, (20, 16, 8, 0))
    sh.putalpha(s)
    return sh


def save(im: Image.Image, name: str, files: dict, phone: bool = False, note: str = ""):
    path = (PHONE if phone else OUT) / f"{name}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=QUALITY, method=6, exact=True)
    files[("phone/" if phone else "") + name] = dict(size=im.size, alpha=im.mode == "RGBA", note=note)


def gold_rim(fig: Image.Image, base: dict) -> Image.Image:
    """Lv 3 gold trim: the figure's own base rim (the band below the top face) re-painted gold,
    as an overlay on the figure's canvas. Shading comes from the painted rim underneath."""
    a = np.asarray(fig).astype(np.float32)
    H, W = a.shape[:2]
    cx, eq, w = base["cx"], base["eq"], base["w"]
    rx = w / 2
    ry = base["bot"] - eq  # the footprint ellipse's half height
    h = w * RIM_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    inside_top = ((xx - cx) / (rx - 1)) ** 2 + ((yy - (eq - h)) / ry) ** 2 <= 1
    inside_bot = ((xx - cx) / rx) ** 2 + ((yy - eq) / ry) ** 2 <= 1
    band = (inside_bot | ((yy >= eq - h) & (yy <= eq) & (np.abs(xx - cx) <= rx))) & ~inside_top & (yy >= eq - h - ry * 0.2)
    # only the smooth brown rim paint, not grass hanging over it
    rgb = a[..., :3]
    brown = (rgb[..., 0] > rgb[..., 2] + 10) & (rgb[..., 0] >= rgb[..., 1])
    m = band & brown & (a[..., 3] > 20)
    mm = np.asarray(mask_img(m).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    lum = rgb.mean(-1) / 255
    lum = np.clip((lum - lum[m].min()) / max(1e-3, (np.percentile(lum[m], 98) - lum[m].min())), 0, 1) if m.any() else lum
    dark, light = np.array([96, 62, 14]), np.array([255, 222, 120])
    g = dark + (light - dark) * (lum[..., None] ** 0.8)
    out = np.dstack([g, np.minimum(mm, a[..., 3] / 255) * 255])
    out[mm == 0] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


# ----------------------------------------------------------------------------------------------
# The board


def lane_rows():
    return [(BORDERS_Y[i] + BORDER_HALF, BORDERS_Y[i + 1] - BORDER_HALF) for i in range(LANES)]


def right_edge(y: float) -> float:
    return min(BOARD_SIZE[0], BOARD_RIGHT[0] + BOARD_RIGHT[1] * (y - 64))


def squares(x_left: float):
    """[lane][col] -> (x0, y0, x1, y1) integer rect, measured at the lane's middle row, plus centre."""
    out = []
    for (y0, y1) in lane_rows():
        ym = (y0 + y1) / 2
        xr = right_edge(ym)
        row = []
        for c in range(COLS):
            xa = x_left + (xr - x_left) * c / COLS
            xb = x_left + (xr - x_left) * (c + 1) / COLS
            row.append((round(xa), y0, round(xb), y1))
        out.append(row)
    return out


def build_board(x_left: float) -> Image.Image:
    im = Image.open(SRC / "board.jpg").convert("RGB").resize(BOARD_SIZE, Image.Resampling.LANCZOS)
    rgb = np.asarray(im).astype(np.float32)
    H, W = rgb.shape[:2]
    lum = rgb.mean(-1)
    corr = np.ones((H, W), np.float32)
    # 1. flatten the generated checker (it doesn't line up with 8 squares): per lane, per 8-row strip,
    #    divide out the column brightness variation between 9 px and 260 px wide
    for (y0, y1) in lane_rows():
        for ys in range(y0 - 6, y1 + 6, 8):
            ye = min(ys + 8, H)
            prof = lum[ys:ye].mean(0)
            def sm(p, r):
                c = np.cumsum(np.pad(p, (r + 1, r), mode="edge"))
                return (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
            ratio = np.clip(sm(prof, 130) / np.maximum(sm(prof, 4), 1), 0.85, 1.18)
            corr[ys:ye] = ratio[None, :]
    # keep the stones and hedges as painted: fade the correction out on the borders
    wy = np.ones(H, np.float32)
    for by in BORDERS_Y:
        d = np.abs(np.arange(H) - by)
        wy = np.minimum(wy, np.clip((d - BORDER_HALF + 2) / 6, 0, 1))
    corr = 1 + (corr - 1) * wy[:, None]
    # 2. paint the 8-square checker, columns following the board's slanting right edge
    chk = np.ones((H, W), np.float32)
    xx = np.arange(W, dtype=np.float32)
    for li, (y0, y1) in enumerate(lane_rows()):
        top, bot = BORDERS_Y[li], BORDERS_Y[li + 1]
        for y in range(top, bot):
            xr = right_edge(y)
            u = (xx - x_left) / (xr - x_left) * COLS  # column coordinate
            col = np.floor(u)
            f = np.where((col + li) % 2 == 0, CHECKER[0], CHECKER[1])
            # 2 px soft edge between squares
            frac = u - col
            pxw = COLS / (xr - x_left)
            e = np.clip(np.minimum(frac, 1 - frac) / (2 * pxw), 0, 1)
            f = 1 + (f - 1) * (0.5 + 0.5 * e)
            f = np.where(u < 0, 1.0, f)
            f = np.where(xx > xr, 1.0, f)
            chk[y] = f
    chk = 1 + (chk - 1) * wy[:, None]
    out = np.clip(rgb * (corr * chk)[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


# ----------------------------------------------------------------------------------------------


def main():
    preview_path = sys.argv[1] if len(sys.argv) > 1 else None
    files, info = {}, {}
    keyed = {}

    def K(name, holes="key"):
        if (name, holes) not in keyed:
            keyed[(name, holes)] = key_magenta(Image.open(SRC / f"{name}.jpg"), holes, despill=name.startswith("castle"))
        return keyed[(name, holes)]

    # --- castle ------------------------------------------------------------------------------
    # v2 (C1 model-kit look): the banners are painted onto the wall itself, no iron arms.
    # The crop is shifted so the intact wall's face lands on CASTLE_FACE_X; all three states use
    # the same crop, so they line up.
    kc = K("castle")
    a0 = np.asarray(kc)[..., 3] > 128
    r0 = np.array([np.nonzero(r)[0].max() if r.any() else 0 for r in a0])
    face_src = float(np.median(r0[int(kc.height * 0.26):]))
    sc = CASTLE_SIZE[1] / kc.height
    x0 = int(round(face_src - CASTLE_FACE_X / sc))
    cw = int(round(CASTLE_SIZE[0] / sc))

    def face_at(x):  # the face x a crop at x gives after resizing (median of the right edge)
        t = kc.crop((x, 0, x + cw, kc.height)).resize(CASTLE_SIZE, Image.Resampling.LANCZOS)
        ta = np.asarray(t)[..., 3] > 128
        return int(np.median([np.nonzero(r)[0].max() if r.any() else 0 for r in ta][200:]))
    x0 = min(range(x0 - 4, x0 + 5), key=lambda x: (abs(face_at(x) - CASTLE_FACE_X), abs(x - x0)))
    crop = (x0, 0, x0 + cw, kc.height)
    info["castle_crop"] = crop
    ref_lum = None
    protect = cross_mask(kc)
    castle = {}
    for src, out in [("castle", "castle-wall"), ("castle-cracked", "castle-wall-cracked"), ("castle-fallen", "castle-wall-fallen")]:
        k = K(src)
        if src != "castle":
            # the regenerated states lost the gold of the cross: take the intact wall's cross
            # (the spire sits on the same pixels in all three states)
            ka = np.asarray(k).copy()
            ka[protect] = np.asarray(kc)[protect]
            k = Image.fromarray(ka, "RGBA")
        k = castle_grade(k, protect)
        if src == "castle-cracked" and ref_lum is not None:
            k = match_lum(k, ref_lum)
        if src == "castle":
            ref_lum = stone_lum(k)
        k = k.crop(crop).resize(CASTLE_SIZE, Image.Resampling.LANCZOS)
        if src == "castle-fallen":
            a = np.asarray(k).astype(np.float32)
            x = np.arange(CASTLE_SIZE[0])
            fade = np.clip((FALLEN_FADE[1] - x) / (FALLEN_FADE[1] - FALLEN_FADE[0]), 0, 1)
            a[..., 3] *= fade[None, :]
            k = Image.fromarray(a.astype(np.uint8), "RGBA")
        castle[out] = k
    # the wall's face line, and the baked banners (blue cloth), measured on the layers
    a = np.asarray(castle["castle-wall"])[..., 3] > 128
    right = np.array([np.nonzero(r)[0].max() if r.any() else 0 for r in a])
    face_x = int(np.median(right[200:]))
    info["castle"] = dict(face_x=face_x, banners={n: find_banners(castle[n]) for n in ("castle-wall", "castle-wall-cracked")})
    for n, im in castle.items():
        save(im, n, files)

    # --- board -------------------------------------------------------------------------------
    x_left = CASTLE_FACE_X + 6   # fixed (the board and squares don't move if a castle is regenerated)
    board = build_board(x_left)
    save(board, "board", files)
    info["squares"] = squares(x_left)
    info["x_left"] = x_left

    # --- banner ------------------------------------------------------------------------------
    k = K("banner-cloth")
    k = k.crop(bbox(k))
    s = min(BANNER_SIZE[0] / k.width, BANNER_SIZE[1] / k.height)
    k = resize(k, s)
    ban = Image.new("RGBA", BANNER_SIZE, (0, 0, 0, 0))
    place(ban, k, ((BANNER_SIZE[0] - k.width) / 2, 0))
    rb = np.asarray(ban)[..., 3] > 128
    rod_rows = np.nonzero(rb.any(1))[0]
    info["banner"] = dict(hang=(BANNER_SIZE[0] / 2, float(rod_rows[0] + (k.height * 0.035))))
    save(ban, "banner-cloth", files)

    # --- figures -----------------------------------------------------------------------------
    figs = {}
    for fname, spec in FIGURES.items():
        poses = []
        for src, idx, out in spec["poses"]:
            k = K(src)
            x0, x1 = segments(k)[idx]
            crop = k.crop((x0, 0, x1, k.height))
            crop = crop.crop((0,) + bbox(crop)[1:2] + (crop.width,) + bbox(crop)[3:4])
            poses.append((out, crop, base_of(crop), src, x0))
        bw = poses[0][2]["w"]
        # line up on the base centre, all bases at the first pose's width
        boxes = []
        for out, crop, b, *_ in poses:
            s = bw / b["w"]
            boxes.append((-b["cx"] * s, -b["eq"] * s, (crop.width - b["cx"]) * s, (crop.height - b["eq"]) * s))
        # include the shadow: it reaches 0.58 w right and 0.23 w below the base centre
        ux0 = min(min(bx[0] for bx in boxes), -bw * 0.5)
        uy0 = min(bx[1] for bx in boxes)
        ux1 = max(max(bx[2] for bx in boxes), bw * 0.62)
        uy1 = max(max(bx[3] for bx in boxes), bw * 0.25)
        W, H = spec["size"]
        margin = 2
        scale = min((W - 2 * margin) / (ux1 - ux0), (H - 2 * margin) / (uy1 - uy0))
        # anchor in the canvas: centred horizontally on the union, bottom-aligned
        ax = (W - (ux1 - ux0) * scale) / 2 - ux0 * scale
        ay = H - margin - uy1 * scale
        entry = dict(size=(W, H), anchor=(ax, ay), base_w=bw * scale, scale=scale, poses={})
        for out, crop, b, src, x0 in poses:
            s = bw / b["w"] * scale
            im = resize(crop, s)
            canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            canvas.alpha_composite(drop_shadow((W, H), ax, ay, bw * scale))
            place(canvas, im, (ax - b["cx"] * s, ay - b["eq"] * s))
            entry["poses"][out] = dict(im=canvas, src=src, src_x0=x0, s=s, b=b, crop_top=None)
        base_px = dict(cx=ax, eq=ay, w=bw * scale, bot=ay + (poses[0][2]["bot"] - poses[0][2]["eq"]) * bw / poses[0][2]["w"] * scale)
        entry["base"] = base_px
        figs[fname] = entry

    # --- cut-outs ----------------------------------------------------------------------------
    cut_info = {}
    for fname, cs in CUTOUTS.items():
        k = K(fname)
        x0, x1 = segments(k)[0]
        e = figs[fname]
        pose = e["poses"][fname]
        crop_box = (x0, 0, x1, k.height)
        crop = k.crop(crop_box)
        top, bottom = bbox(crop)[1], bbox(crop)[3]
        # source -> canvas transform: (x - x0, y - top) * s + offset
        s = pose["s"]
        b = pose["b"]
        offx = e["anchor"][0] - b["cx"] * s
        offy = e["anchor"][1] - b["eq"] * s
        def to_canvas(p):
            return ((p[0] - x0) * s + offx, (p[1] - top) * s + offy)
        src = np.asarray(k).astype(np.float32)
        Hs, Ws = src.shape[:2]
        alpha = src[..., 3]
        upper = np.zeros((Hs, Ws), bool)
        poly_masks = {}
        for name, poly, pivot in cs["pieces"]:
            if isinstance(poly, list):
                m = poly_mask((Ws, Hs), poly) & (alpha > 0)
                poly_masks[name] = m
                upper |= m
        hip = cs["hip_y"]
        yy = np.arange(Hs)[:, None] * np.ones((1, Ws))
        layers = {}
        # legs & base: everything below the hip line not in an arm/head piece, plus 10 px of overlap above
        legs_m = (yy >= hip - 10) & ~upper
        # body: above the hip, not in the upper pieces except a 4 px band along their cut edges
        band_src = upper & (np.asarray(mask_img(~upper & (alpha > 128)).filter(ImageFilter.MaxFilter(9))) > 0) & (alpha > 250)
        body_m = (yy < hip + 6) & (~upper | band_src)
        fill_m = np.zeros((Hs, Ws), bool)
        for poly in cs["fill"]:
            fill_m |= poly_mask((Ws, Hs), poly)
        fill_m &= upper & ~band_src & (alpha > 250)
        known = (alpha > 240) & ~upper & (yy < hip)
        filled = spread_fill(src[..., :3], known | (band_src & (alpha > 240)), fill_m)
        def layer(mask, rgb=None, a=None, soft_bottom=None):
            rgb = src[..., :3] if rgb is None else rgb
            a = alpha * mask if a is None else a
            if soft_bottom is not None:
                fade = np.clip((soft_bottom - np.arange(Hs)) / 6.0, 0, 1)[:, None]
                a = a * fade
            return Image.fromarray(np.dstack([rgb, a]).astype(np.uint8), "RGBA")
        body_a = np.maximum(alpha * body_m, fill_m * 255.0)
        layers["legs"] = layer(legs_m)
        layers["body"] = layer(None, rgb=filled, a=body_a, soft_bottom=hip + 6)
        for name, poly, pivot in cs["pieces"]:
            if isinstance(poly, list):
                layers[name] = layer(poly_masks[name])
        W, H = e["size"]
        pieces = []
        for name, poly, pivot in cs["pieces"]:
            lay = layers[poly if isinstance(poly, str) else name]
            lay = lay.crop(crop_box).crop((0, top, x1 - x0, bottom))
            im = resize(lay, s)
            canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            if poly == "legs":
                canvas.alpha_composite(drop_shadow((W, H), e["anchor"][0], e["anchor"][1], e["base_w"]))
            place(canvas, im, (offx, offy))
            pv = to_canvas(pivot)
            pieces.append(dict(name=name, im=canvas, pivot=pv, kind=poly if isinstance(poly, str) else "piece"))
            save(canvas, name, files)
        cut_info[fname] = pieces
        # assembled check: pieces over each other vs the flat figure
        asm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for p in pieces:
            asm.alpha_composite(p["im"])
        e["assembled"] = asm
        flat = np.asarray(pose["im"]).astype(np.float32)
        d = np.abs(np.asarray(asm).astype(np.float32) - flat)
        info.setdefault("seam", {})[fname] = float(np.percentile(d[..., 3], 99.9)), float(d[..., 3].max())

    # --- save the figures --------------------------------------------------------------------
    for fname, e in figs.items():
        if fname in CUTOUTS:
            continue
        for out, p in e["poses"].items():
            save(p["im"], out, files)

    # --- level details -----------------------------------------------------------------------
    det = {}
    kd = K("level-details")
    segs = segments(kd)
    def seg_crop(i):
        x0, x1 = segs[i]
        c = kd.crop((x0, 0, x1, kd.height))
        return c.crop(bbox(c))
    for name in ("lv2-pennant-archer", "lv2-pennant-knight"):
        c = seg_crop(DETAILS[name]["seg"])
        W, H = DETAILS[name]["w"], DETAILS[name]["h"]
        sc = min(W / c.width, H / c.height)
        im = resize(c, sc)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        place(canvas, im, (0, H - im.height))
        # attach point: the bottom of the staff (lowest opaque pixel)
        a = np.asarray(canvas)[..., 3] > 128
        ys, xs = np.nonzero(a)
        yb = ys.max(); xb = xs[ys >= yb - 2].mean()
        det[name] = dict(im=canvas, attach=(float(xb), float(yb)))
    # wall block top line, measured on the intact block (topmost opaque row per column)
    wall = figs["stone-wall"]["poses"]["stone-wall"]["im"]
    wa = np.asarray(wall)[..., 3] > 128
    cols = [x for x in range(wall.width) if wa[:, x].any()]
    tops = {x: int(np.nonzero(wa[:, x])[0].min()) for x in cols}
    base_top = figs["stone-wall"]["base"]["eq"] - figs["stone-wall"]["base"]["w"] * 0.25
    block_cols = [x for x in cols if tops[x] < base_top - 10]
    bx0, bx1 = min(block_cols), max(block_cols)
    xl, xr = bx0 + 6, bx1 - 6
    yl, yr = tops[xl], tops[xr]
    angle = float(np.degrees(np.arctan2(yr - yl, xr - xl)))  # positive = top slopes down to the right
    top_mid = ((xl + xr) / 2, (yl + yr) / 2)
    for name, frac in (("lv2-wall-course", 1.0), ("lv3-wall-spikes", 0.82)):
        c = seg_crop(DETAILS[name]["seg"])
        sc = (bx1 - bx0) * frac / c.width
        im = resize(c, sc)
        im = im.rotate(-angle, resample=Image.Resampling.BICUBIC, expand=True)
        im = im.crop(bbox(im, 4))
        if name == "lv2-wall-course":
            # the generated row came out three blocks high: keep its top row only, cut along the
            # mortar line under it (which slopes like the wall top)
            y0, slope = COURSE_CUT
            yy, xx = np.mgrid[0:im.height, 0:im.width]
            line = y0 * im.height / 102 + slope * xx
            ca_ = np.asarray(im).astype(np.float32)
            ca_[..., 3] *= np.clip((line - yy) / 2 + 0.5, 0, 1)
            im = Image.fromarray(ca_.astype(np.uint8), "RGBA")
            im = im.crop(bbox(im, 4))
        # attach: the middle of its bottom edge
        a = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(a)
        mid = im.width / 2
        colb = ys[np.abs(xs - mid) < 3].max()
        det[name] = dict(im=im, attach=(float(mid), float(colb)))
    # where they sit on the wall canvas
    course_h = det["lv2-wall-course"]["attach"][1]
    det["lv2-wall-course"]["on"] = dict(figure="stone-wall", at=(top_mid[0], top_mid[1] + 3))
    # the course's top edge in the wall canvas, for the spikes when Lv 2 is present
    ca = np.asarray(det["lv2-wall-course"]["im"])[..., 3] > 128
    ctop = np.nonzero(ca[:, det["lv2-wall-course"]["im"].width // 2])[0].min()
    det["lv3-wall-spikes"]["on"] = dict(figure="stone-wall", at=(top_mid[0], top_mid[1] + 3 - (course_h - ctop) + 4))
    info["wall_top"] = dict(left=(xl, yl), right=(xr, yr), angle=angle, mid=top_mid)
    for name, d in det.items():
        save(d["im"], name, files)
    # gold trims
    trims = {}
    for fname, out in (("archer", "lv3-trim-archer"), ("knight", "lv3-trim-knight"), ("stone-wall", "lv3-trim-wall")):
        e = figs[fname]
        ref = e["poses"][next(iter(e["poses"]))]["im"]
        if fname == "knight":
            ref = [p for p in cut_info["knight"] if p["kind"] == "legs"][0]["im"]
        t = gold_rim(ref, e["base"])
        trims[out] = t
        save(t, out, files)

    # --- icons ---------------------------------------------------------------------------------
    ki = K("icons", "fill")
    isegs = segments(ki)
    small = {}
    for i, (name, size) in enumerate((("coin", (ICON_SIZE, ICON_SIZE)), ("heart", (ICON_SIZE, ICON_SIZE)), ("arrow", ARROW_SIZE))):
        x0, x1 = isegs[i]
        c = ki.crop((x0, 0, x1, ki.height)); c = c.crop(bbox(c))
        W, H = size
        m = 2 if name != "arrow" else 0
        sc = min((W - 2 * m) / c.width, (H - 2 * m) / c.height)
        im = resize(c, sc)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        place(canvas, im, ((W - im.width) / 2, (H - im.height) / 2))
        small[name] = canvas
        save(canvas, name, files)
        if name in ("coin", "heart"):
            save(canvas, name, files, phone=True, note="same 64x64 as the projector copy")
    dk = dust_key(Image.open(SRC / "dust.jpg"))
    dk = dk.crop(bbox(dk, 6))
    sc = min(DUST_SIZE[0] / dk.width, DUST_SIZE[1] / dk.height)
    dimg = resize(dk, sc)
    dust = Image.new("RGBA", DUST_SIZE, (0, 0, 0, 0))
    place(dust, dimg, ((DUST_SIZE[0] - dimg.width) / 2, DUST_SIZE[1] - dimg.height))
    small["dust-puff"] = dust
    save(dust, "dust-puff", files)

    # --- phone icons ---------------------------------------------------------------------------
    for icon, src_name in PHONE_ICONS.items():
        if src_name == "knight":
            im = figs["knight"]["assembled"]
        else:
            f = next(f for f in figs.values() if src_name in f["poses"])
            im = f["poses"][src_name]["im"]
        c = im.crop(bbox(im, 30))
        sc = min((PHONE_ICON - 6) / c.width, (PHONE_ICON - 6) / c.height)
        c = resize(c, sc)
        canvas = Image.new("RGBA", (PHONE_ICON, PHONE_ICON), (0, 0, 0, 0))
        place(canvas, c, ((PHONE_ICON - c.width) / 2, (PHONE_ICON - c.height) / 2))
        save(canvas, icon, files, phone=True)

    # attach points for the pennants on the figures (measured by eye on the output canvases)
    info["pennants"] = PENNANT_ATTACH
    write_manifest(files, info, figs, cut_info, det)
    if preview_path:
        preview(preview_path, board, castle, ban, figs, cut_info, det, trims, small, info)
    print("done:", len(files), "files")


# Where the Lv 2 pennants go, in the figure canvas pixels (the staff's bottom end goes here).
# Archer: on the bow's upper limb tip, per pose. Knight: behind the right shoulder, on knight-body.
PENNANT_ATTACH = {
    "archer-ready": (151, 92),   # the forward (right) bow tip; the bow is held level
    "archer-draw": (115, 4),     # the upper bow tip
    "knight-body": (114, 118),   # behind his back, between the shoulders (hidden by the body)
}


def pct(v, total):
    return f"{100 * v / total:.1f}%"


def pt(p, size):
    return f"({p[0]:.0f}, {p[1]:.0f}) px = ({pct(p[0], size[0])}, {pct(p[1], size[1])})"


def write_manifest(files, info, figs, cut_info, det):
    L = ["# Kingdom Siege art manifest", ""]
    L.append("Style C (tabletop miniatures, from mockup C1). Made by `scripts/siege-art.py` from the sources in "
             "`scripts/siege-art/` (prompts at the top of the script). Coordinates are in each file's own pixels, "
             "top-left origin; % is of that file's width/height. Projector files are in this folder, phone files in `phone/`.")
    L.append("")
    L.append("Every figure is a painted miniature on a round base, facing its direction of travel (defenders right, "
             "monsters left), lit from the upper left like the board, with a soft contact shadow baked in down-right of the base. "
             "**Anchor** = the centre of the base's footprint: put it on the centre of a lane square. Poses of one figure "
             "share one canvas and one anchor, so swapping poses moves nothing.")
    L.append("")
    L.append("## Files")
    L.append("")
    L.append("| File | Size | Alpha | Anchor (base centre) | Notes |")
    L.append("|---|---|---|---|---|")
    anchors = {}
    for fname, e in figs.items():
        for out in e["poses"]:
            anchors[out] = e["anchor"]
    for fname, pieces in cut_info.items():
        for p in pieces:
            anchors[p["name"]] = figs[fname]["anchor"]
    for name in sorted(files):
        f = files[name]
        base = name.split("/")[-1]
        anc = pt(anchors[base], f["size"]) if base in anchors and not name.startswith("phone/") else ""
        L.append(f"| `{name}.webp` | {f['size'][0]}×{f['size'][1]} | {'yes' if f['alpha'] else 'no'} | {anc} | {f['note']} |")
    L.append("")
    L.append("Base width (px) on each figure canvas, for checking the scale: " + ", ".join(
        f"{n} {e['base_w']:.0f}" for n, e in figs.items()) + ".")
    L.append("")
    # board
    L.append("## Board and lane squares")
    L.append("")
    L.append(f"`board.webp` is 1344×768, the empty C1 meadow without the castle. 5 lanes (1 = top) × 8 squares "
             f"(1 = next to the wall, 8 = the entry square at the right edge). Squares start at x = {info['x_left']} px, "
             f"just right of the castle wall's face, and end at the board's right edge (which slants: "
             f"x = {BOARD_RIGHT[0]} + {BOARD_RIGHT[1]}·(y − 64), clipped to 1344). A light/dark checker is painted "
             "on the board exactly on these squares. Each rect is [x0, y0, x1, y1) in board px, measured at the lane's "
             "middle row (so neighbouring squares tile without gaps); the stone borders sit between the lanes' y ranges.")
    L.append("")
    L.append("| Lane | y0–y1 | " + " | ".join(f"Sq {c + 1}" for c in range(COLS)) + " |")
    L.append("|---|---|" + "---|" * COLS)
    for li, row in enumerate(info["squares"]):
        y0, y1 = row[0][1], row[0][3]
        cells = [f"{r[0]}–{r[2]} (c {(r[0] + r[2]) / 2:.0f}, {(r[1] + r[3]) / 2:.0f})" for r in row]
        L.append(f"| {li + 1} | {y0}–{y1} | " + " | ".join(cells) + " |")
    L.append("")
    L.append("Same in %: lane y ranges " + "; ".join(
        f"{li + 1}: {pct(r[0][1], 768)}–{pct(r[0][3], 768)}" for li, r in enumerate(info["squares"])) + ". "
             "Square x ranges per lane in % of 1344: " + "; ".join(
        f"lane {li + 1}: " + ", ".join(f"{pct(c[0], 1344)}–{pct(c[2], 1344)}" for c in r) for li, r in enumerate(info["squares"])) + ".")
    L.append("")
    L.append(f"Suggested figure size on the board: draw figures at **scale = lane height / {FIG_DRAW_DIV}** "
             f"(lane heights {', '.join(str(r[0][3] - r[0][1]) for r in info['squares'])} px), so a far lane's figures "
             "are a little smaller; put the anchor on the square centre, 12% of the lane height lower (as in preview.png). Figures are taller than a lane and overlap the lane "
             "above, so draw lanes top to bottom (and, inside a lane, right to left is not needed: draw by y).")
    L.append("")
    # castle
    c = info["castle"]
    L.append("## Castle wall")
    L.append("")
    L.append("`castle-wall.webp`, `castle-wall-cracked.webp` (5 hearts or fewer) and `castle-wall-fallen.webp` (after the "
             "crumble) are 360×768 layers drawn at (0, 0) over the board's left edge, after the board and before the figures. "
             f"The three line up exactly. The wall's face (the edge toward the lanes) is at x = {c['face_x']} px "
             f"({pct(c['face_x'], 360)}). The rubble pile fades out over x {FALLEN_FADE[0]}–{FALLEN_FADE[1]}.")
    L.append("")
    L.append("**Banners are baked in** (since the v2 castle): the three blue banners with gold crosses are painted flat on "
             "the wall face of `castle-wall.webp` and (slightly torn) `castle-wall-cracked.webp`; `castle-wall-fallen.webp` "
             "has no banners. Draw nothing on the wall: there are no iron arms and no hang points any more. "
             "Banner cloth bounding boxes on the layers, if you want to tint or flash them (px, x0 y0 x1 y1):")
    for n, boxes in c["banners"].items():
        L.append(f"* `{n}.webp`: " + "; ".join(f"({b[0]}, {b[1]})–({b[2]}, {b[3]})" for b in boxes))
    L.append("")
    L.append(f"`banner-cloth.webp` (96×160, hanging point {pt(info['banner']['hang'], BANNER_SIZE)}) is still shipped "
             "unchanged, but it is no longer used by the wall; treat it as an optional spare (e.g. a UI or victory flourish) "
             "or ignore it.")
    L.append("")
    L.append(f"The castle layers are cut from the 720×1280 sources at x {info['castle_crop'][0]}–{info['castle_crop'][2]} "
             "(×0.6), the same crop for all three, so the face and the spire line up between states. The spire tower "
             "stands in the same place in all three states (on the fallen wall it stands alone above the rubble).")
    L.append("")
    # cutouts
    L.append("## Cut-out pieces (knight and giant)")
    L.append("")
    L.append("Every piece is on the figure's full canvas (same size, same origin), so at rest you draw them all at the "
             "same position, in the order listed (first = back), and they reassemble the figure exactly. To animate, rotate a "
             "piece about its pivot (CSS `transform-origin` at the pivot px). The layers underneath are painted in where a "
             "piece covers them, so a few degrees of swing (about ±25° for arms, ±10° for the head and body) opens no hole. "
             "The legs piece includes the base and the contact shadow. Keep the head and arms on top of the body: when "
             "the body leans, rotate the head and arms by the same angle about the body's pivot first.")
    for fname, pieces in cut_info.items():
        W, H = figs[fname]["size"]
        L.append("")
        L.append(f"### {fname} ({W}×{H}, anchor {pt(figs[fname]['anchor'], (W, H))})")
        L.append("")
        L.append("| Layer | File | Pivot | Moves |")
        L.append("|---|---|---|---|")
        moves = {"legs": "static (whole-figure bob/lunge/tip-over use the anchor)", "body": "lean"}
        for i, p in enumerate(pieces):
            what = moves.get(p["kind"], "swing / nod")
            L.append(f"| {i + 1} | `{p['name']}.webp` | {pt(p['pivot'], (W, H))} | {what} |")
    L.append("")
    L.append("Seam check (assembled pieces vs the flat figure, alpha difference): " + ", ".join(
        f"{k}: 99.9th pct {v[0]:.0f}, max {v[1]:.0f} of 255" for k, v in info["seam"].items()) + ".")
    L.append("")
    # levels
    L.append("## Level details")
    L.append("")
    wt = info["wall_top"]
    L.append("Drawn over the figure, at its canvas pixels. The Lv 3 glow is code.")
    L.append("")
    for name in ("lv2-pennant-archer", "lv2-pennant-knight"):
        d = det[name]
        L.append(f"* `{name}.webp` {d['im'].width}×{d['im'].height}: staff foot at {pt(d['attach'], d['im'].size)}.")
    pa = info["pennants"]
    L.append(f"  * archer: put the staff foot at {pt(pa['archer-ready'], figs['archer']['size'])} on `archer-ready`, "
             f"{pt(pa['archer-draw'], figs['archer']['size'])} on `archer-draw` (the bow's upper tip), drawn over the archer.")
    L.append(f"  * knight: put the staff foot at {pt(pa['knight-body'], figs['knight']['size'])} and draw it just *before* "
             "`knight-body` (it rises from behind his back); it turns with the body pivot.")
    for name in ("lv2-wall-course", "lv3-wall-spikes"):
        d = det[name]
        on = d["on"]
        L.append(f"* `{name}.webp` {d['im'].width}×{d['im'].height} (pre-tilted {wt['angle']:.1f}° to the block's top): "
                 f"its bottom-middle {pt(d['attach'], d['im'].size)} goes at {pt(on['at'], figs['stone-wall']['size'])} on the wall canvas"
                 + (" (on top of the Lv 2 course; without the course use the course's point)" if name == "lv3-wall-spikes" else "") + ".")
    L.append("* `lv3-trim-archer.webp`, `lv3-trim-knight.webp`, `lv3-trim-wall.webp`: the base rim re-painted gold, on the "
             "figure's own canvas (same size): draw at (0, 0) over the figure (over `knight-legs` for the knight). One trim "
             "fits both poses because the bases line up.")
    L.append("")
    L.append("## Small art")
    L.append("")
    L.append("* `arrow.webp` 64×16: points right; the tip is the right edge's middle. Rotate for flight.")
    L.append("* `coin.webp`, `heart.webp` 64×64 (phone copies identical).")
    L.append("* `dust-puff.webp` 160×120: its bottom-middle sits on the ground. Normal blending; fade and grow it in code.")
    L.append("")
    L.append("## Phone")
    L.append("")
    L.append("`phone/archer-icon`, `phone/knight-icon`, `phone/stone-wall-icon` (128×128, for the defender strip), "
             "`phone/coin` and `phone/heart` (64×64). "
             "The phone's lane map is drawn in code.")
    (OUT / "manifest.md").write_text("\n".join(L) + "\n")


FIG_DRAW_DIV = 130  # preview (and suggested) figure scale = lane height / this


def font(sz):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", sz)
    except OSError:
        return ImageFont.load_default()


def checker_bg(size, a=(200, 200, 200), b=(160, 160, 160), cell=8):
    W, H = size
    im = Image.new("RGB", size, a)
    d = ImageDraw.Draw(im)
    for y in range(0, H, cell):
        for x in range((y // cell) % 2 * cell, W, 2 * cell):
            d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b)
    return im.convert("RGBA")


def tile(im, label, bg="checker", scale=1.0, pad=6):
    im = resize(im, scale) if scale != 1 else im
    W, H = im.width + 2 * pad, im.height + 2 * pad + 16
    t = checker_bg((W, H)) if bg == "checker" else Image.new("RGBA", (W, H), bg)
    t.alpha_composite(im, (pad, pad + 16))
    ImageDraw.Draw(t).text((pad, 2), label, fill=(0, 0, 0) if bg == "checker" else (255, 255, 255), font=font(11))
    return t


def flow(tiles, width, gap=8, bg=(28, 28, 32, 255)):
    rows, cur, w = [], [], 0
    for t in tiles:
        if cur and w + t.width > width:
            rows.append(cur); cur, w = [], 0
        cur.append(t); w += t.width + gap
    if cur:
        rows.append(cur)
    H = sum(max(t.height for t in r) + gap for r in rows)
    out = Image.new("RGBA", (width, H), bg)
    y = 0
    for r in rows:
        x = 0
        for t in r:
            out.alpha_composite(t, (x, y)); x += t.width + gap
        y += max(t.height for t in r) + gap
    return out


def cross(d, p, c=(255, 0, 0), r=4):
    x, y = p
    d.line([(x - r, y), (x + r, y)], fill=c, width=1)
    d.line([(x, y - r), (x, y + r)], fill=c, width=1)


def preview(path, board, castle, ban, figs, cut_info, det, trims, small, info):
    W = 1344
    sections = []

    def header(text):
        h = Image.new("RGBA", (W, 26), (28, 28, 32, 255))
        ImageDraw.Draw(h).text((6, 5), text, fill=(255, 210, 63), font=font(14))
        sections.append(h)

    sq = info["squares"]
    def castle_layer(name):
        return castle[name].copy()   # banners are baked into the wall layers

    def fig_im(fname, pose):
        e = figs[fname]
        if fname in cut_info:
            return e["assembled"]
        return e["poses"][pose]["im"]

    def put_fig(scene, fname, pose, lane, col, extra=()):
        e = figs[fname]
        x0, y0, x1, y1 = sq[lane][col]
        s = (y1 - y0) / FIG_DRAW_DIV
        im = fig_im(fname, pose).copy()
        for ov in extra:
            im.alpha_composite(ov)
        im = resize(im, s)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.12
        place(scene, im, (cx - e["anchor"][0] * s, cy - e["anchor"][1] * s))

    # 1. the scene
    header("1. Board + castle-wall (banners baked in), figures on squares (scale = lane height / %d, anchor on square centre, slightly low)" % FIG_DRAW_DIV)
    scene = board.convert("RGBA")
    scene.alpha_composite(castle_layer("castle-wall"))
    placements = [  # (figure, pose, lane, col), drawn top lane first
        ("archer", "archer-draw", 0, 0), ("goblin", "goblin-walk", 0, 5), ("goblin", "goblin-walk", 0, 6),
        ("knight", "knight", 1, 1), ("goblin", "goblin-attack", 1, 2), ("wolf", "wolf-run", 1, 6),
        ("stone-wall", "stone-wall", 2, 2), ("archer", "archer-ready", 2, 0), ("troll", "troll-walk", 2, 6),
        ("giant", "giant", 3, 6), ("archer", "archer-draw", 3, 1), ("stone-wall", "stone-wall-cracked", 3, 3),
        ("knight", "knight", 4, 2), ("wolf", "wolf-leap", 4, 3), ("troll", "troll-smash", 4, 7),
    ]
    for lane in range(LANES):
        for f, p, l, c in sorted([q for q in placements if q[2] == lane], key=lambda q: -q[3]):
            put_fig(scene, f, p, l, c)
    sections.append(scene)

    # 1b. the grid
    header("1b. The 40 lane squares measured on board.webp (lane.square; red cross = square centre; Sq 8 = entry square)")
    g = board.convert("RGBA")
    g.alpha_composite(castle["castle-wall"])
    ov = Image.new("RGBA", g.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for li, row in enumerate(sq):
        for ci, (x0, y0, x1, y1) in enumerate(row):
            d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 255, 255, 200) if ci < 7 else (255, 80, 80, 230), width=1)
            d.text((x0 + 4, y0 + 3), f"{li + 1}.{ci + 1}", fill=(255, 255, 255, 255), font=font(13))
            cross(d, ((x0 + x1) / 2, (y0 + y1) / 2), (255, 40, 40, 255), 5)
    d.line([(info["castle"]["face_x"], 0), (info["castle"]["face_x"], 768)], fill=(255, 210, 63, 255), width=1)
    g.alpha_composite(ov)
    sections.append(g)

    # 2. castle states
    header("2. castle-wall / -cracked / -fallen over the board's left edge (banners baked in; yellow = face x) | banner-cloth = spare, not drawn on the wall | lose-state crumble is code")
    row = Image.new("RGBA", (W, 768), (28, 28, 32, 255))
    for i, n in enumerate(("castle-wall", "castle-wall-cracked", "castle-wall-fallen")):
        bcrop = board.convert("RGBA").crop((0, 0, 420, 768))
        bcrop.alpha_composite(castle_layer(n))
        ImageDraw.Draw(bcrop).line([(info["castle"]["face_x"], 0), (info["castle"]["face_x"], 767)], fill=(255, 210, 63, 160), width=1)
        ImageDraw.Draw(bcrop).text((6, 4), n, fill=(255, 255, 255), font=font(13))
        row.alpha_composite(bcrop, (i * 430, 0))
    bt = tile(ban, "banner-cloth (spare)", scale=1)
    ImageDraw.Draw(bt).rectangle([0, 0, 0, 0])
    bd = ImageDraw.Draw(bt)
    cross(bd, (6 + info["banner"]["hang"][0], 22 + info["banner"]["hang"][1]), (255, 0, 0), 5)
    row.alpha_composite(bt, (1292 - bt.width + 52, 10))
    sections.append(row)

    # 3. cut-outs
    header("3. Cut-outs: assembled | exploded (pieces pulled apart; red = pivot) | posed (arms/head/body swung about their pivots)")
    tiles = []
    for fname, pieces in cut_info.items():
        e = figs[fname]
        Wc, Hc = e["size"]
        tiles.append(tile(e["assembled"], f"{fname} assembled", bg=(110, 140, 60, 255)))
        ex = Image.new("RGBA", (int(Wc * 1.7), int(Hc * 1.47)), (60, 60, 66, 255))
        offs = {"legs": (0.35, 0.3), "body": (0.35, 0.12), "head": (0.35, -0.02)}
        dd = ImageDraw.Draw(ex)
        for p in pieces:
            kind = "legs" if p["kind"] == "legs" else "body" if p["kind"] == "body" else ("head" if "head" in p["name"] else None)
            if kind:
                ox, oy = offs[kind]
            else:
                ox, oy = (0.0, 0.12) if p["pivot"][0] < e["anchor"][0] else (0.7, 0.12)
            ox, oy = ox * Wc, oy * Hc + 0.12 * Hc
            ex.alpha_composite(p["im"], (int(ox), int(oy)))
            cross(dd, (p["pivot"][0] + ox, p["pivot"][1] + oy), (255, 40, 40), 6)
            dd.text((p["pivot"][0] + ox + 6, p["pivot"][1] + oy - 6), p["name"].split("-", 1)[1], fill=(255, 255, 255), font=font(11))
        tiles.append(tile(ex, f"{fname} exploded", bg=(60, 60, 66, 255)))
        for k, angs in enumerate(POSE_TESTS[fname]):
            tiles.append(tile(posed(pieces, angs), f"{fname} posed {k + 1}", bg=(110, 140, 60, 255)))
    sections.append(flow(tiles, W))

    # 4. defenders and levels
    header("4. Defenders and level details (Lv 1 | Lv 2 | Lv 3 = Lv 2 + gold trim; the Lv 3 glow is code). Red cross = anchor")
    tiles = []
    pa = PENNANT_ATTACH
    def with_detail(base_im, items):
        c = Image.new("RGBA", (base_im.width + 40, base_im.height + 80), (0, 0, 0, 0))
        oy, ox = 80, 20
        for im, at, attach, behind in items:
            if behind:
                place(c, im, (ox + at[0] - attach[0], oy + at[1] - attach[1]))
        c.alpha_composite(base_im, (ox, oy))
        for im, at, attach, behind in items:
            if not behind:
                place(c, im, (ox + at[0] - attach[0], oy + at[1] - attach[1]))
        return c
    for pose in ("archer-ready", "archer-draw"):
        im = figs["archer"]["poses"][pose]["im"]
        lv2 = [(det["lv2-pennant-archer"]["im"], pa[pose], det["lv2-pennant-archer"]["attach"], False)]
        lv3 = lv2 + [(trims["lv3-trim-archer"], (0, 0), (0, 0), False)]
        for lv, items in (("1", []), ("2", lv2), ("3", lv3)):
            t = with_detail(im, items)
            cross(ImageDraw.Draw(t), (20 + figs["archer"]["anchor"][0], 80 + figs["archer"]["anchor"][1]))
            tiles.append(tile(t, f"{pose} Lv {lv}"))
    kn = cut_info["knight"]
    def knight_with(lv):
        c = Image.new("RGBA", figs["knight"]["size"], (0, 0, 0, 0))
        out = []
        for p in kn:
            if p["kind"] == "body" and lv >= 2:
                out.append(("pennant", None))
            out.append((p["name"], p["im"]))
            if p["kind"] == "legs" and lv >= 3:
                out.append(("trim", trims["lv3-trim-knight"]))
        big = Image.new("RGBA", (c.width + 40, c.height + 80), (0, 0, 0, 0))
        for n, im in out:
            if n == "pennant":
                d2 = det["lv2-pennant-knight"]
                place(big, d2["im"], (20 + pa["knight-body"][0] - d2["attach"][0], 80 + pa["knight-body"][1] - d2["attach"][1]))
            else:
                big.alpha_composite(im, (20, 80))
        cross(ImageDraw.Draw(big), (20 + figs["knight"]["anchor"][0], 80 + figs["knight"]["anchor"][1]))
        return big
    for lv in (1, 2, 3):
        tiles.append(tile(knight_with(lv), f"knight Lv {lv}"))
    wall = figs["stone-wall"]["poses"]
    for pose in ("stone-wall", "stone-wall-cracked"):
        im = wall[pose]["im"]
        c2 = det["lv2-wall-course"]; c3 = det["lv3-wall-spikes"]
        lv2 = [(c2["im"], c2["on"]["at"], c2["attach"], False)]
        lv3 = lv2 + [(c3["im"], c3["on"]["at"], c3["attach"], False), (trims["lv3-trim-wall"], (0, 0), (0, 0), False)]
        for lv, items in (("1", []), ("2", lv2), ("3", lv3)):
            t = with_detail(im, items)
            cross(ImageDraw.Draw(t), (20 + figs["stone-wall"]["anchor"][0], 80 + figs["stone-wall"]["anchor"][1]))
            tiles.append(tile(t, f"{pose} Lv {lv}"))
    for n, d2 in det.items():
        tt = tile(d2["im"], n)
        cross(ImageDraw.Draw(tt), (6 + d2["attach"][0], 22 + d2["attach"][1]), (255, 0, 0), 4)
        tiles.append(tt)
    for n, t in trims.items():
        tiles.append(tile(t, n))
    sections.append(flow(tiles, W))

    # 5. monsters
    header("5. Monsters (poses share a canvas: the base doesn't move between poses). Red cross = anchor")
    tiles = []
    for fname in ("goblin", "wolf", "troll"):
        e = figs[fname]
        for pose, p in e["poses"].items():
            t = tile(p["im"], f"{pose} {e['size'][0]}x{e['size'][1]}")
            cross(ImageDraw.Draw(t), (6 + e["anchor"][0], 22 + e["anchor"][1]))
            tiles.append(t)
    sections.append(flow(tiles, W))

    # 6. small art + phone
    header("6. Small art (arrow, coin, heart, dust-puff) and phone/ (128 px icons, 64 px coin/heart)")
    tiles = [tile(small["arrow"], "arrow 64x16", scale=2), tile(small["coin"], "coin 64"), tile(small["heart"], "heart 64"),
             tile(small["dust-puff"], "dust-puff 160x120", bg=(70, 90, 50, 255))]
    for f in sorted(PHONE.glob("*.webp")):
        tiles.append(tile(Image.open(f).convert("RGBA"), "phone/" + f.stem))
    sections.append(flow(tiles, W))

    H = sum(s_.height for s_ in sections)
    out = Image.new("RGBA", (W, H), (28, 28, 32, 255))
    y = 0
    for s_ in sections:
        out.alpha_composite(s_, (0, y)); y += s_.height
    out.convert("RGB").save(path)
    # quick-look crops next to it: the scene (preview y 20-800) and the top 1700 px
    base = Path(path)
    out.crop((0, 20, out.width, 800)).convert("RGB").save(base.with_name(base.stem + "-scene.png"))
    out.crop((0, 0, out.width, 1700)).convert("RGB").save(base.with_name(base.stem + "-top.png"))


POSE_TESTS = {
    "knight": [{"knight-sword-arm": -25, "knight-shield-arm": 18, "knight-head": 8},
               {"knight-sword-arm": 28, "knight-shield-arm": -15, "knight-head": -8, "knight-body": 6}],
    "giant": [{"giant-right-arm": 25, "giant-left-arm": -22, "giant-head": 8},
              {"giant-right-arm": -32, "giant-left-arm": 22, "giant-head": -8, "giant-torso": -6}],
}


def posed(pieces, angs):
    """Rotate pieces about their pivots (degrees, counter-clockwise); the body's lean carries the
    head and arms with it."""
    import math
    body = next(p for p in pieces if p["kind"] == "body")
    bang = angs.get(body["name"], 0)
    c = Image.new("RGBA", pieces[0]["im"].size, (0, 0, 0, 0))
    for p in pieces:
        im = p["im"]
        if p["kind"] == "legs":
            c.alpha_composite(im); continue
        if p["kind"] == "body":
            c.alpha_composite(im.rotate(bang, resample=Image.Resampling.BICUBIC, center=p["pivot"]) if bang else im); continue
        pv = p["pivot"]
        if bang:
            im = im.rotate(bang, resample=Image.Resampling.BICUBIC, center=body["pivot"])
            t = math.radians(-bang); bx, by = body["pivot"]; dx, dy = pv[0] - bx, pv[1] - by
            pv = (bx + dx * math.cos(t) - dy * math.sin(t), by + dx * math.sin(t) + dy * math.cos(t))
        a = angs.get(p["name"], 0)
        if a:
            im = im.rotate(a, resample=Image.Resampling.BICUBIC, center=pv)
        c.alpha_composite(im)
    return c


if __name__ == "__main__":
    main()

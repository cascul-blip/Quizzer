"""Key the magenta-screen goblin clip into transparent Sled Squad assets.

Usage (cv2/scipy aren't installed system-wide, so let uv provide them):
  uv run --with numpy,opencv-python-headless,scipy,pillow \
    python scripts/winter-art/prepare-goblin.py scripts/winter-art/sources/goblin-v2-raw.mp4

Writes src/client/shared/winter/goblin-sheet.webp (12 fps, 8 columns, row-major)
and goblin-loop.webm (24 fps VP9 alpha), then prints the sheet layout that
ChristmasGoblin in src/client/shared/winter-art.tsx must match.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

COLS = 8
ASSET_DIR = Path(__file__).resolve().parents[2] / "src/client/shared/winter"


def decode(clip: str, tmp: Path) -> list[np.ndarray]:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-i", clip, "-map", "0:v:0", str(tmp / "%03d.png")], check=True)
    return [np.asarray(Image.open(p).convert("RGB"), float) for p in sorted(tmp.glob("*.png"))]


def key(a: np.ndarray) -> tuple[Image.Image, float]:
    """Soft matte from magenta excess, despill, and rebuild fringe colours from the solid interior."""
    bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), axis=0)
    ex = np.minimum(a[:, :, 0], a[:, :, 2]) - a[:, :, 1]
    be = min(bg[0], bg[2]) - bg[1]
    al = np.clip((1 - ex / be - .07) / .64, 0, 1)
    al = cv2.GaussianBlur(al, (3, 3), .5)
    # Keep only the goblin (largest component) and drop isolated key residue.
    _, lab, st, _ = cv2.connectedComponentsWithStats((al > .5).astype("uint8"))
    mask = lab == 1 + np.argmax(st[1:, 4])
    xs = np.nonzero(mask)[1]
    al *= cv2.dilate(mask.astype("uint8"), np.ones((5, 5), np.uint8))
    rgb = a.copy()
    m = al < .98
    rgb[:, :, 0][m] = np.minimum(rgb[:, :, 0][m], np.maximum(rgb[:, :, 1][m], rgb[:, :, 0][m] - (1 - al[m]) * bg[0]))
    rgb[:, :, 2] = np.minimum(rgb[:, :, 2], np.maximum(rgb[:, :, 0], rgb[:, :, 1]))
    interior = (al > .98) & (ex < -8)
    _, inds = distance_transform_edt(~interior, return_indices=True)
    edge = (al > 0) & (~interior | (ex > 0))
    rgb[edge] = rgb[inds[0][edge], inds[1][edge]]
    return Image.fromarray(np.dstack([rgb, al * 255]).clip(0, 255).astype("uint8"), "RGBA"), (xs.min() + xs.max()) / 2


def main(clip: str) -> None:
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        keyed = [key(a) for a in decode(clip, tmp)]
        # Remove horizontal drift; keep the vertical bob.
        target = np.median([x for _, x in keyed])
        stable = []
        for im, x in keyed:
            c = Image.new("RGBA", im.size)
            c.alpha_composite(im, (round(target - x), 0))
            stable.append(c)
        # Loop of at least 2.5 s whose excluded endpoint best matches the start.
        sm = [np.asarray(im.resize((212, 120)), float) for im in stable]
        _, start, end = min((np.abs(sm[i] - sm[j]).mean(), i, j)
                            for i in range(20) for j in range(i + 60, min(len(sm), i + 97)))
        seq = stable[start:end]
        for z in range(3):
            seq[-3 + z] = Image.blend(seq[-3 + z], stable[start], (z + 1) / 4)
        boxes = np.array([im.getbbox() for im in seq])
        box = (max(0, int(boxes[:, 0].min()) - 4), max(0, int(boxes[:, 1].min()) - 4),
               int(boxes[:, 2].max()) + 4, int(boxes[:, 3].max()) + 4)
        seq = [im.crop(box) for im in seq]
        w, h = seq[0].size

        cells = seq[::2]
        rows = (len(cells) + COLS - 1) // COLS
        sheet = Image.new("RGBA", (w * COLS, h * rows))
        for i, im in enumerate(cells):
            sheet.alpha_composite(im, ((i % COLS) * w, (i // COLS) * h))
        sheet.save(ASSET_DIR / "goblin-sheet.webp", "WEBP", quality=88, method=6)

        enc = tmp / "enc"
        enc.mkdir()
        for i, im in enumerate(seq):
            im.save(enc / f"{i:03d}.png")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "24", "-i", str(enc / "%03d.png"),
                        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "28",
                        str(ASSET_DIR / "goblin-loop.webm")], check=True)
    print(f"raw frames {start}..{end - 1}, loop {len(seq)} frames @24fps; sheet {len(cells)} frames, "
          f"{COLS}x{rows} cells of {w}x{h}")


if __name__ == "__main__":
    main(sys.argv[1])

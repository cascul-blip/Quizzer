# Showdown: final art (scripts/showdown-art/)

This folder is laid out the way `scripts/showdown-art/` should be in the repo:
- All brief files, flat, with the brief's names, at 1280×720 JPG (`town-wide.jpg` is 1920×1080).
- `phone/`: half-size copies, following the `<folder>/phone/<name>` convention of `scripts/phone-art.py`. The copies cover street-1/2/3, high-noon, all bodies, all hats and the effects (muzzle-flash, gun-smoke, dust-puff, bullet-streak, tumbleweed).
- `phone-holster.jpg` is phone-only, so it is full size in the root.
- This file: review material for the delivered art (the previews were not kept in the repo).

The build lives outside this folder in `../src-final/`: `build.py`, `previews.py` and `common.py`; the raw model outputs in `raw/`; and `landmarks.json`. Run `python3 build.py && python3 previews.py` to rebuild everything.


## Files
| File | Pixels | KB |
|---|---|---|
| `body-draw.jpg` | 1280×720 | 42 |
| `body-fire.jpg` | 1280×720 | 41 |
| `body-idle.jpg` | 1280×720 | 39 |
| `body-ready.jpg` | 1280×720 | 44 |
| `body-stagger.jpg` | 1280×720 | 53 |
| `body-tip.jpg` | 1280×720 | 41 |
| `body-walk-1.jpg` | 1280×720 | 41 |
| `body-walk-2.jpg` | 1280×720 | 38 |
| `bullet-streak.jpg` | 1280×720 | 15 |
| `dust-puff.jpg` | 1280×720 | 282 |
| `gun-smoke.jpg` | 1280×720 | 72 |
| `hat-black.jpg` | 1280×720 | 54 |
| `hat-bullet-hole.jpg` | 1280×720 | 67 |
| `hat-sheriff.jpg` | 1280×720 | 68 |
| `hat-white.jpg` | 1280×720 | 51 |
| `hat.jpg` | 1280×720 | 70 |
| `high-noon.jpg` | 1280×720 | 265 |
| `muzzle-flash.jpg` | 1280×720 | 88 |
| `phone-holster.jpg` | 1280×720 | 125 |
| `sheriff-star.jpg` | 1280×720 | 49 |
| `street-1.jpg` | 1280×720 | 321 |
| `street-2.jpg` | 1280×720 | 319 |
| `street-3.jpg` | 1280×720 | 308 |
| `town-wide.jpg` | 1920×1080 | 549 |
| `tumbleweed.jpg` | 1280×720 | 110 |
| `wanted-frame.jpg` | 1280×720 | 109 |
| `phone/body-draw.jpg` | 640×360 | 12 |
| `phone/body-fire.jpg` | 640×360 | 12 |
| `phone/body-idle.jpg` | 640×360 | 11 |
| `phone/body-ready.jpg` | 640×360 | 13 |
| `phone/body-stagger.jpg` | 640×360 | 16 |
| `phone/body-tip.jpg` | 640×360 | 12 |
| `phone/body-walk-1.jpg` | 640×360 | 12 |
| `phone/body-walk-2.jpg` | 640×360 | 11 |
| `phone/bullet-streak.jpg` | 640×360 | 5 |
| `phone/dust-puff.jpg` | 640×360 | 57 |
| `phone/gun-smoke.jpg` | 640×360 | 17 |
| `phone/hat-black.jpg` | 640×360 | 14 |
| `phone/hat-bullet-hole.jpg` | 640×360 | 17 |
| `phone/hat-sheriff.jpg` | 640×360 | 16 |
| `phone/hat-white.jpg` | 640×360 | 12 |
| `phone/hat.jpg` | 640×360 | 17 |
| `phone/high-noon.jpg` | 640×360 | 60 |
| `phone/muzzle-flash.jpg` | 640×360 | 22 |
| `phone/street-1.jpg` | 640×360 | 76 |
| `phone/street-2.jpg` | 640×360 | 70 |
| `phone/street-3.jpg` | 640×360 | 64 |
| `phone/tumbleweed.jpg` | 640×360 | 28 |
| `previews/contact-sheet.png` | 1880×1110 | 873 |
| `previews/duel-high-noon.png` | 1280×720 | 1291 |
| `previews/duel-street-1.png` | 1280×720 | 1553 |
| `previews/duel-street-2.png` | 1280×720 | 1569 |
| `previews/duel-street-3.png` | 1280×720 | 1553 |

## Pose alignment (all bodies on the same 1280×720 canvas)
Every pose is keyed, then scaled and shifted so the mannequin-ball head lands on the draft head spot **(600, 177)** and the soles sit on **y 648** (90%). Idle is 500 px tall (70%). The centre is the ball's centroid, the radius is half the ball's height, and the sole line is the lowest body row.

| Pose | Head centre | r | Sole line y |
|---|---|---|---|
| `body-idle.jpg` | (600, 177) | 31 | 647 |
| `body-ready.jpg` | (599, 177) | 32 | 647 |
| `body-draw.jpg` | (600, 177) | 32 | 647 |
| `body-fire.jpg` | (600, 177) | 28 | 648 |
| `body-stagger.jpg` | (600, 177) | 32 | 648 |
| `body-tip.jpg` | (599, 177) | 31 | 648 |
| `body-walk-1.jpg` | (600, 177) | 31 | 647 |
| `body-walk-2.jpg` | (600, 177) | 28 | 647 |

The radius reads 28–32 because the measurement includes or excludes a little of the ball's shading. Using **(600, 177) r 32** for every pose is safe.

## What changed since the draft
- **Fire (right-hand fix, Oct 30, 8:10 PM):** the duelist shoots RIGHT-handed. Facing screen-right, his right side is the near side (left of the image). The holster was already on the near hip in idle, ready, draw, tip, walk-1/2 and stagger, and `body-draw` already holds the gun in the near hand; `phone-holster.jpg` matches a right-hip holster seen from his right. Only `body-fire` was wrong: the far (left) arm was firing and the gun was still in the holster. It was regenerated: the near arm is now extended across the chest, the gun points right, the holster is empty and the far hand hangs relaxed. The head radius is 28, as in walk-2. The old version is in `../src-final/old/`, the rejected try in `../src-final/raw/fire-righthand-try2-rejected.jpg`, and the rebuild script is `../src-final/fix_fire.py`.
- **Fire (before the fix):** kept the draft pose. The hammer-fanning re-roll put the off hand up as a flat-palm "stop" in front of the shoulder, not on the hammer, so it didn't come out cleanly. It is in `../src-final/raw/fire2-rejected.jpg`.
- **Stagger:** kept the draft pose for the delivery. The re-roll gave a much better backward lean (`../src-final/alternates/body-stagger-lean.jpg`), but a real lean moves the head about 60 px back and 24 px down relative to the planted feet: head (540, 201), soles 647. That breaks the single head spot this delivery is aligned to. If Coder takes per-pose head spots (the brief allows it: "The game records one head position per pose"), swap the alternate in and use that head spot. A shear would move the head the same way, so I didn't fake one.
- **Boot specks:** removed. Every green-screen subject now keeps only its connected main shape (tiny detached blobs are dropped) before it is put back on pure #00FF00.
- **Walk:** the model returned the same stride three times for "right foot forward". `body-walk-2.jpg` is therefore the **passing** frame: legs together, one boot lifted. Contact plus passing alternates cleanly as a 2-frame walk, but it is not a literal "right foot forward".
- **Gun smoke:** the model painted it warm orange. I graded it to grey-white with a hint of warmth, per the brief.
- **Bullet-hole hat:** the smoke wisp was keyed off green and greyed. It's faint but present.
- **No text:** street-1 to street-3 use blank signboards; the brief's "no letters" rule overrides the SALOON and BANK labels. The high-noon clock has plain tick marks at twelve and no numerals, plus a gold star on the saloon front.

## Checklist (from the brief)
| Item | Result | Note |
|---|---|---|
| Every character faces right | PASS | All 8 bodies face right; the game mirrors the right-hand duelist (see the duel previews). |
| Poses line up; flicking between them the feet don't jump | PASS (with a note) | Sole line is y 647–648 and the head spot is within ±1 px across all 8 poses. Stance width differs naturally (stagger and walk poses are wider or narrower), so the boots move sideways a little; the sole line doesn't jump. |
| No faces on the bodies (or a head that can be cut away above the neckerchief) | PASS | Featureless mannequin ball in every pose, no hat. The first tip pose came back wearing a hat; it was re-rolled. |
| Green screens flat green, no shadows, no green on any subject | PASS | Every green asset is re-laid on exact #00FF00 (corners measure 0,255,1 after JPG). No cast shadows. Subjects are despilled. |
| Effects on pure black | PASS | Muzzle flash, gun smoke, dust puff and bullet streak are crushed to 0,0,0 outside the effect. |
| No text in any image | PASS | No lettering anywhere. The clock face has tick marks only. |
| Files in `scripts/showdown-art/` with the brief's names | PASS (ready, not copied) | This folder is that layout. The repo was not touched; Coder copies it in. |
| Brief pose: fire with the other hand fanning the hammer | PARTIAL | Arm extended, revolver level pointing right. The off hand rests at the belt (one re-roll tried, rejected). |
| Brief pose: stagger leaning back off balance | PARTIAL | Delivered pose has arms flung out and coat flaring, with little lean. The lean alternate exists (see above). |
| Brief pose: walk-2 right foot forward | PARTIAL | Delivered as the passing frame (see above). |
| Hat side view, brim facing right | PASS (with a note) | All hats are a 3/4 side view with the brim toward the right, filling 60% of the width. |
| Classroom rules | PASS | No blood or wounds; the gun always points sideways, never at the viewer; the loser only loses their hat. |

## Notes for Coder
- Muzzle tip in `body-fire.jpg` is at about (778, 209); before the right-hand fix it was (856, 199). The flash core in `muzzle-flash.jpg` is at about (738, 336); place it a few px right of the muzzle.
- `bullet-streak.jpg` has its bright tip at its right end (about x 1194, y 357).
- Key bodies, hats and pieces by green dominance. Key effects by brightness (alpha = max channel); `previews.py` has both keys.
- On mirrored duelists the light comes from the right. That is inherent in mirroring and not noticeable at duel size.

## Clips (`clips/`)
Each clip comes with `<clip>-strip.png` (12 evenly spaced frames, the last frame included, 4×3 at 320×180) and `<clip>-head.csv` (`frame,x,y`). For the four character clips the CSV gives the mannequin head centre. For tumbleweed and hat-fly it gives the object centroid, and is blank once the object has left the frame.

All clips are H.264 at CRF 16, yuv420p, 1280×720, 24 fps, video only, re-encoded from the raw model output. Raws, per-frame metrics, scripts and every take's strip are in `../video-test/` (`raw/`, `metrics/`, `strips/`, `analyse_clips.py`, `build_clips.py`).

Every clip passes the green-screen, camera and no-face checks:
- **Green:** background mean ≈ (1–2, 254–255, 0–1), on average 1.1–2.0 off #00FF00; noise in a frame σG ≤ 2.7; flicker between frames ≤ 2 levels. They key cleanly with `common.key_green`, with no spill fringe.
- **Camera:** locked. Planted boots and the sole line hold to ±2 px, and every first/last frame matches its still.
- **Head:** faceless. Zero dark feature pixels inside the head in every frame, confirmed by eye on the strips and 2× crops.
- **Gun:** never points at the viewer.

| File | Size | Frames | Duration | First → last still | Head drift vs (600,177): mean / max (frame) | Verdict |
|---|---|---|---|---|---|---|
| `clip-draw-fire.mp4` | 755 KB | 73 | 3.04 s | body-idle → body-fire (right-hand) | 8.1 / 29.7 px (f23) | **Usable with head tracking. Right-hand draw, no hand swap.** Take 2 of 2 (right-hand round). Stands upright. The near (right) hand draws from the near-hip holster (frames ~16–22) and swings the gun out low with the same hand. The arm is extended by frame ~28, followed by a recoil kick (muzzle up about 49 px at frames 31–34). It then holds at about (776, 208). The far hand never touches the gun. Checked frame by frame. Take 1 crouched deeply (head 100 px off) and swept the gun past the head; it is kept in video-test. |
| `clip-stagger.mp4` | 957 KB | 73 | 3.04 s | body-idle → body-stagger (pinned at 1.0 s) → body-idle | 9.7 / 31.4 px (f35) | **Usable with head tracking.** Arms flail, the figure turns briefly toward the camera, takes a half-step stumble (one boot travels about 110 px), then recovers to idle. Holstered gun only. Playful, unhurt. Take 1. |
| `clip-holster-spin.mp4` | 896 KB | 73 | 3.04 s | body-fire (right-hand) → body-idle | 4.1 / 15.4 px (f61) | **Usable with head tracking. No hand swap, gun never vanishes.** Take 1. The near (right) hand spins the gun (frames 0–~48), lowers it and slides it into the near-hip holster (frames ~51–63). He ends on body-idle with the grip in the holster and his hand on it. The far hand never touches the gun. Checked frame by frame. |
| `clip-walk.mp4` | 748 KB | 49 | 2.04 s | body-walk-1 → body-walk-1 (loops) | 7.2 / 12.6 px (natural bob; x 599–606, y 164–177) | **Usable as-is with head tracking. Seamless loop.** Treadmill walk in place facing right, coat swaying, soles 644–646. Take 1. |
| `clip-tumbleweed.mp4` | 1.3 MB | 73 | 3.04 s | `../video-test/frames/tumble-start.jpg` → `tumble-end.jpg` (from tumbleweed.jpg) | object: x 173 → 1103, y 546–550, about 172 px wide | **Usable.** Rolls and spins left to right at a steady ~13 px/frame. It **doesn't bounce** (y holds within 4 px); add a bounce in code if wanted. Twig gaps key with a faint edge (edge green dominance +5). Take 1. |
| `clip-hat-fly.mp4` | 754 KB | 73 | 3.04 s | `../video-test/frames/hat-start.jpg` (hat.jpg at the head spot, about 150 px wide) → off-frame | object: (592,128) → leaves the bottom edge at x≈220 after frame 70 | **Usable.** Tumbles up and left in a short arc, then falls out of the bottom left. The hat grows from 146 to 200 px wide as it tumbles (slightly toward the camera). It starts exactly where a hat sits on the head. Take 1. |

GenerateVideo calls for the clips: 12 in total. 9 were from the first run: 1 test, 2 draw-fire re-rolls, 1 holster-spin re-roll and 5 first takes. 3 more came in the right-hand round: draw-fire ×2 and holster-spin ×1. The old left-hand draw-fire and holster-spin clips are kept in `../video-test/old-clips/`.

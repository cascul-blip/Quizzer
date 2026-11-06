# Evil Snowman (Robot Attack reskin): final art set

This set covers style A6 (misty beech-tunnel forest with a snowy floor, plain version with no rim light), the approved fanged grin, and a **sweep attack**.
- The attack is a **sweep**: one claw hand rakes across the board.
- There is **no snowball and no projectile**, and **no centre arm**.

All coordinates are **arena units** (SVG viewBox 1200×860) unless marked *px*. The suggested repo folder is `src/client/shared/snowman/` (laid out like `shared/robot/`). The rebuild scripts are in `src/`.

## Files

| File | Pixels | KB |
|---|---|---|
| `arm-elbow.webp` | 112×112 | 6.7 |
| `arm-fore.webp` | 352×59 | 7.8 |
| `arm-shoulder.webp` | 192×150 | 8.4 |
| `arm-upper.webp` | 384×82 | 10.4 |
| `backdrop.webp` | 1920×1080 | 320.4 |
| `claw-dist.webp` | 128×51 | 3.6 |
| `claw-prox.webp` | 128×28 | 2.7 |
| `eye-glow.webp` | 128×128 | 1.5 |
| `fx-frost-hit.webp` | 192×192 | 13.6 |
| `fx-snow-spray.webp` | 256×256 | 18.0 |
| `fx-swipe-trail.webp` | 512×128 | 1.9 |
| `hand-closed.webp` | 320×320 | 10.4 |
| `hand-grasp.webp` | 320×320 | 15.0 |
| `hand-half.webp` | 320×320 | 16.9 |
| `hand-open.webp` | 320×320 | 17.2 |
| `hand-palm.webp` | 176×109 | 6.0 |
| `snowman-body.webp` | 552×1219 | 75.6 |
| `snowman-hat.webp` | 552×1219 | 22.1 |
| `snowman-head.webp` | 552×1219 | 35.9 |
| `snowman-scarf.webp` | 552×1219 | 28.8 |
| `target-glow.webp` | 256×256 | 1.1 |
| `target.webp` | 256×256 | 9.4 |
| `thumb.webp` | 112×34 | 2.7 |
| `tile-doomed.webp` | 160×160 | 13.1 |

**Main art**
- `backdrop.webp`: the A6 forest, 1920×1080, placed like the robot's `BACKDROP`. The misty glow sits behind the snowman's head as a backlight.
- `snowman-{body,head,hat,scarf}.webp`: the snowman split into layers. They all share **one 552×1219 frame**, so you place them with the same rect. The body layer runs from the scarf line down, with the scarf pixels kept underneath. The head layer includes the neck under the scarf, so a small head bob never opens a gap.
- `eye-glow.webp`: an additive red-orange glow sprite, drawn ×2 at the eyes. The code gradient `ra-eye` also works.

**Arm parts**
- `arm-upper.webp`, `arm-fore.webp`: rigid twig bones. Pivots are at their left-middle and right-middle.
- `arm-elbow.webp`: the knot or burl that covers the elbow, centred on the elbow.
- `arm-shoulder.webp`: a packed-snow clump with a twig stub. Its pivot is at (0.42·w, h/2), and it is drawn in front of the body.

**Hand parts**
- `hand-palm.webp`: the forked palm. Pivot is the wrist, at the left-middle.
- `claw-prox.webp`, `claw-dist.webp`: the claw base and the hooked tip, ×3 claws. Their pivots are the left-middle and right-middle. The hook curls toward +y.
- `thumb.webp`: a separate thumb piece. Its base starts 0.30·H *inside* the palm root, so it never looks detached (this fixes the mockup issue).
- `hand-{open,half,closed,grasp}.webp`: optional flipbook fallback, with the palm, claws and thumb already posed. They are 320² at 2 px/unit, pointing right, with the wrist pivot at **(48, 160) px**. Use them only if the live claws read as too busy.

**Board and target**
- `target.webp` and `target-glow.webp`: the frost-rim tile highlight that replaces `reticle.webp` and `reticle-glow.webp`. Use the same reticle bbox. Draw the glow under the target and pulse its opacity.
- `tile-doomed.webp`: an ice-crack overlay for collapsing ring tiles, and for tiles about to be swept (the 0.35 s pre-contact warning).
- `tiles/t-000…143.webp` and `tiles/tiles.json`: the snow and ice board. It uses the same structure and bboxes as the robot set: 2 px/unit, alpha-masked quads, and a checker of packed snow (light) and blue ice (dark). A cold reflection of the snowman and forest is baked in.
- `tiles/snow-0..3.webp`, `tiles/ice-0..3.webp`: flat swatches for MiniBoard or a fallback (they replace `granite-*`).

**Effects**
- `fx-snow-spray.webp`: a particle puff, spawned at the claw tip while sweeping.
- `fx-swipe-trail.webp`: a tapered streak, thin at the left and full at the right. Stretch it along the recent claw-tip path, or draw the path as a blurred polyline the way `video.py` does.
- `fx-frost-hit.webp`: the hit state, a frost puff over a piece that gets swept. It replaces the laser `scorch`.

**Phone:** `phone/*.webp` holds half-size copies of every top-level WebP (quality 80, the same rule as `scripts/phone-art.py` HALF_SIZE). The tiles aren't included, because the phone only draws MiniBoard. As with the robot, the phone doesn't currently use this art, so add the folder to `HALF_SIZE` only if it ever does.

**Previews**
- `intact.png`: quiz phase, with frost targets on the sweep lanes.
- `partial.png`: rings 0–1 gone, ring 2 cracking and falling, the hand mid-sweep, and frost hits on 2 pieces.
- `gone.png`: every tile gone.
- `parts-sheet.png`: all the parts.
- `pose-sheet.png`: the 4 hand presets and 5 arm bends with pivot dots.
- `sweep-keyframes.png`: 6 frames from the sweep.

**Videos** (H.264, 1920×1080, 30 fps)
- `video/sweep.mp4`: 3.4 s.
- `video/idle-loop.mp4`: 4.0 s, loops seamlessly.

Both are rendered by `src/video.py` from these exact files with the `rig.py` and `timeline.py` maths. That means they show exactly what the code is meant to do.

## Placement

- **BACKDROP**: `{x:-300, y:-100, w:1800, h:1012.5}`, the same as the robot's.
- **BODY**, used by all 4 layers: `{x:464.15, y:40, w:271.70, h:600}`, with `preserveAspectRatio="none"`. Source px map to arena as `x = 464.15 + px·0.49221` and `y = 40 + py·0.49221`.
- **Eyes**: source px (248,319) and (357,320), which is arena **(586.2,197.0)** and **(639.9,197.5)**. The glow radius is about 13 at rest. Scale it ×(0.8 + 0.4·k) and set opacity to 0.5 + 0.5·k, where k is the eye intensity:

| Eye intensity k | When |
|---|---|
| 0.75 ± 0.25 | idle pulse, 2 s period |
| 1.6 | wind-up and sweep |
| 1.2 → 0.75 | return |

- **Shoulders** (P0): **R (670.39, 321.54)**, **L (529.61, 321.54)**. That is source px (419,572) and (102,572), on the middle ball at 0.47 of the height.

## Rig (`src/rig.py`, the reference maths)

Rig constants:
- H = 40; L1 = 180 (upper arm); L2 = 160 (forearm).
- Every twig is rigid. **No stretch.**

The right arm is defined directly. The **left arm is the mirror image about x = 600**. For each piece op `translate(tx,ty) rotate(θ) scale(1,f)`, the mirrored version is `translate(1200−tx, ty) rotate(180−θ) scale(1,−f)`.

| Joint | Pivot | Range | Piece and draw size |
|---|---|---|---|
| Shoulder | P0 above | −100°…+45° (0 = pointing right, +y is down) | `arm-shoulder` 1.55H wide, rotated with the live upper-arm angle |
| Upper arm | P0 → E = P0 + L1·dir(s) | — | `arm-upper`, H thick |
| Elbow | E | bend −140…+160° (forearm angle = s + e). Negative bends lift the forearm (idle); positive bends fold it down (the sweep). | `arm-elbow` 1.3H square, centred on E, drawn after both bones |
| Forearm | E → W = E + L2·dir(s+e) | — | `arm-fore`, 0.8H thick |
| Wrist | W, hand angle h = s + e + w | w ±110° (the sweep needs about −105…+95) | — |
| Palm | W − 0.25H … W + 1.45H along h | — | `hand-palm`, 0.95H thick |
| Thumb | base T0 = W + 0.20H·dir(h) + 0.12H·n (n = h + 90°) | angle h + 62 − 55·thumbClose | `thumb` from T0 − 0.30H to T0 + 0.85H; height from its aspect. Drawn **before** the palm. |
| Knuckles ×3 | F = W + 1.2H·dir(h), offset (i−1)·0.30H·min(spread,1.1) along n | a1 = h + (i−1)·22°·spread + knuckleCurl | `claw-prox`, length 0.85H·ls, 0.32H·ls thick; ls = 1.0, 1.08, 0.95 |
| Claw tips | end of the prox piece | a2 = a1 + tipCurl | `claw-dist`, length 1.15H·ls; height from its aspect. The middle tip is the "contact point". |

**Twig flip rule:** on twig pieces, use `scale(1, cos θ < 0 ? −1 : 1)` so the snow stays on the top edge. **Claws never flip on the right arm.** They do flip on the mirrored left arm, so their hook keeps curling inward.

**Hand presets** (knuckle curl °, tip curl °, spread, thumb close). Blend them linearly with `pose_mix`:

| Preset | Knuckle | Tip | Spread | Thumb |
|---|---|---|---|---|
| open | 0 | 0 | 1.3 | 0 |
| half | 30 | 35 | 1.0 | 0.45 |
| closed | 65 | 80 | 0.55 | 1.0 |
| grasp | 40 | 55 | 0.75 | 0.7 |

**IK** (`rig.ik`): a two-bone solve, shoulder → wrist, with the elbow raised (`bend=+1`) and the result normalised to (−180,180]. To put the **claw tip** on a board point P with hand angle h:
- wrist target = P − tipOffset(h, hand);
- tipOffset comes from `layout()` with a zero shoulder;
- wrist = h − (s + e).

This is `timeline.arm_for_tip`.

## Draw order (back → front)

1. Backdrop.
2. `snowman-body`.
3. Arms not over the board (L, and R when idle): upper arm, forearm, elbow knot, thumb, palm, then for each claw its prox piece then its dist piece.
4. `snowman-head`, then `snowman-hat` (both bob by head_dy), then `snowman-scarf` (bobs by 0.4·head_dy).
5. Shoulder clumps.
6. Eye glows.
7. Board:
   - the front edge (fill `#16202e`);
   - the tiles;
   - the doomed overlays;
   - the frost targets (glow, then target, over a `rgba(90,170,255,.16)` quad wash);
   - the outline stroke `#aacdeb`.
8. Pieces.
9. **The sweeping arm, when it is over the board** (wind-up to return: `0.45 s < t < 2.75 s`). Draw it here, then its shoulder clump again, so the hand rakes *over* the tiles and pieces.
10. Swipe trail, then snow-spray particles.

## Idle (`timeline.idle`, period 4 s, loopable)

Here w = 2π·t/4.
- **Right arm:**
  - shoulder 0 + 4·sin w;
  - elbow −60 + 6·sin(w + 0.9);
  - wrist 15 + 5·sin(2w + 0.4);
  - hand is a mix of half and closed at 0.25 + 0.25·sin 2w.
- **Left arm** (mirrored):
  - shoulder −5 + 4·sin(w + 2.1);
  - elbow −60 + 6·sin(w + 3.0);
  - hand is a mix of open and half at 0.3 + 0.3·sin(2w + 1.7).
- **Claw twitch:** tip curl + 8·sin(4w), with the left arm offset by 1.3 rad.
- **Head and breathing:**
  - head_dy = −2·sin w;
  - breathing scales the body by 1 + 0.006·(1 + sin w), anchored at the bottom, and lifts the head, hat and scarf by the same amount.

The robot's 7 s sway period can be used instead. Every term is a sine, so it still loops.

## Sweep (`timeline.sweep`): 3.4 s, right hand, rows 3–4, columns 11 → 6

| Key | t (s) | Right arm (shoulder / elbow / wrist °) | Hand | What happens |
|---|---|---|---|---|
| rest | 0.00 | 0 / −55 / 17 (idle at t=0) | half-closed | Frost targets lit on the lane tiles; eyes 0.75. |
| wind-up | 0.45 | −30 / −70 / −25 | open | Ease-in-out. The hand rises high and to the right, claws spread; eyes ramp to 1.6. **From here the arm draws over the board.** |
| reach | 0.80 | −7 / 21 / 94 (IK, tip at board (u 11.9, v 4.0), h 108°) | open | Ease-in drop onto the far-right tile. |
| sweep | 0.80→1.70 | IK every frame: tip u = lerp(11.9, 5.7, ease(f)), v = 4.0 + 0.15·sin(πf); h = 108 − 18·ease(f) | open → grasp | Claw contact. The tile under the claw is swept at its contact time (table below). Spray spawns each frame and the trail covers the last 0.22 s. |
| close | 1.70→1.95 | IK, tip lifts 40 units at u 5.7 | grasp → closed | The claws clench, eyes go to 1.2. |
| return | 1.95→2.75 | tween angles to rest | closed → half | Ease-in-out. The arm goes back behind the board layer at 2.75. |
| hold | 2.75→3.40 | idle | | |

`ease(x) = x²(3−2x)`, `ein(x) = x²`.

**Tile contact time** (the claw passes the tile centre): column 11 → 0.94 s, 10 → 1.08, 9 → 1.18, 8 → 1.28, 7 → 1.38, 6 → 1.50. It is the same for rows 3 and 4. In general it is `reach + ease⁻¹((U0 − (u+.5))/(U0 − U1))·0.9 s`, solved by bisection in `contact_time()`.

**Tile states:**
- from 0.35 s **before** contact: `tile-doomed` cracks plus the blue wash, and the frost target turns off;
- at contact, a **tile_motion(age)** over 0.8 s. With a = age/0.8:
  - dx = −95·ease(a/0.7) − 10·row (it slides with the claws);
  - dy = −16·sin(π·min(a/0.45,1)) + 300·max(0, a − 0.35)² (a hop, then it drops off);
  - rotate 55·a² degrees;
  - opacity 1 − ease((a − 0.55)/0.45).
- After that the tile is gone and isn't rendered, just like the robot's collapsed tiles.

**Pieces** on swept tiles get the `zapped` class plus `fx-frost-hit` (about 90 units wide, centred 30 above the piece) for about 0.6 s.

**Spray:** one particle per frame at the tip while 0.83 < t < 1.70.
- lifetime 0.55 s;
- drifts +40·age in x and rises then falls, with dy = −60·age·(0.5 + r) + 90·age²;
- size (40 + 40r)·(0.7 + 1.8·age) units, with random rotation;
- opacity 1 − age/0.55.

**Trail:** the tip positions from the last 0.22 s, drawn as a polyline. Width grows from 10 to 46 px (screen) toward the newest point, alpha up to 200, with a 5 px blur.

**Arbitrary targets (code notes):** the server marks tiles, not rows.
- Group the marked tiles by row band. The right hand takes columns 6–11 and the left hand takes 0–5, with the same timeline mirrored. That is the same arm split the robot used.
- For each band, sweep from the outermost marked column to the innermost, with VLINE = the band's far row + 1.
- **Reach** (measured with h = 108°, open hand): every tile in rows 0–5 is reachable. The outer near corners are not:

| Rows | Out of reach (right hand; the left hand mirrors this) |
|---|---|
| 6–7 | column 11 |
| 8–9 | columns 10–11 |
| 10 | columns 9–11 |
| 11 | columns 8–11 |

  Clamp the sweep start to the reachable column. The unreached marked tiles can crack and drop when the claw passes (use contact time = sweep start), or allow ≤5% forearm stretch.
- Run two bands one after the other (about 1.2 s each), or both hands together for a two-band attack.
- Tiles not reached by a sweep can use the ring-collapse path (unchanged).

## Code changes (beyond the robot-manifest swaps)

1. Load the files from `shared/snowman/` and use the placements above.
2. Body: draw **4 layers** in one rect instead of `body.webp`. There's one eye glow pair, and **no optic**.
3. Arms: remove the 10-segment `MechArm`, `EMITTERS` and the centre arm. Add `SnowArm`, which renders `rig.layout()` ops with the mirror rule.
4. Lasers: delete `Lasers` and `scorch`. Add `Sweep`:
   - draws the attacking arm in a group **after** `Pieces`;
   - animates the tiles with `tile_motion` (CSS transform on a per-tile `<g>`);
   - draws the spray `<image>`s and the trail `<polyline>` (stroke `#e1f0ff`, `stroke-linecap:round`, blur filter).
5. Board: tile images come from the new `tiles/` folder. Front edge `#16202e`, outline `#aacdeb` with opacity .8. The reticle is replaced by `target-glow` + `target` with the wash `rgba(90,170,255,.16)`. The doomed overlay uses the new `tile-doomed`, and `.tile-collapse-glow` becomes `rgba(110,190,255,.27)`.
6. MiniBoard (optional): light `#c4cedc`, dark `#4a6080`.
7. Podium: as with the robot, `<Arena players=[]>` picks up the new art.

## Known compromises

- The backdrop was painted at 1280×720 and upscaled to 1920 with light sharpening. The far edges are soft, which reads as mist.
- The layers were cut from one painted figure, so the hat layer carries a sliver of head under the brim, and the head layer contains the scarf top under the scarf layer. That is fine for head bobs up to about ±4 units, but **don't** move the head sideways or the hat on its own by much.
- Tile reflections are static (rest-pose snowman). Swept tiles slide as flat images; they don't really tumble in 3D.
- The palm and claw prox pieces have cut-stick ends. At classroom distance they read as a twig claw; up close the knuckles look a bit blocky.
- The HUD and player list in the previews and videos are the generic Robot Attack mock HUD (including its "FIRE!" banner). Change the banner wording in code, for example to "SWEEP!".

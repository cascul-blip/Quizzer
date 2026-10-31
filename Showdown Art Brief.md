# Showdown — art and animation brief

Art for **Showdown**, a Western quick-draw quiz game shown on a classroom projector (16:9) and on students' phones. Every round, pairs of students face off on a frontier-town street. The student who answers right fastest "draws first," and the other duelist's hat gets shot off. Up to 15 duels are on screen at once, so every asset must read clearly when small.

**Audience is a school classroom.** Keep it a playful Western movie standoff: no blood, no wounds, no one shot in the body, no guns pointed at the viewer. The "loser" only has their hat shot off and stumbles back into the dust.

## Global style (use in every prompt)
> Semi-realistic painted cinematic style, like a Western movie poster painted digitally. Warm dusty palette: sun-bleached wood, ochre dirt, faded reds and blues, deep orange-to-turquoise sky. Strong late-afternoon sunlight from the left, long soft shadows to the right. Clean silhouettes, readable at small sizes. No text, no letters, no logos, no watermark.

Keep one style reference image. Generate the first background, then pass it as a style/image reference to **every** later generation so everything matches.

## Technical rules
- **Format**: 1280×720 JPG (or PNG) unless stated otherwise.
- **Green screen**: characters and effects go on a **flat pure green background (#00FF00)**, evenly lit, with **no shadow cast on the background** and no green anywhere on the subject (no green clothing or props). Muzzle flash and dust go on **pure black** instead (they are keyed by brightness).
- **Facing**: every character faces **to the right** (the right side of their body toward the viewer's right). The game mirrors them for the other side.
- **Same canvas for every pose**: generate the poses image-to-image from the idle pose so the character stays the **same size, same place, same feet position** in the frame. Feet on the same line, about 90% down the image.
- **Full body in frame**, about 70% of the image height, centred horizontally, with room on the right for the extended arm.
- **No face**: the student's avatar replaces the head in code. See "The head problem" below.

## The head problem (read first)
The game puts each student's own avatar face on the body, so the body must not have a real face.
1. **Preferred**: the character is framed normally, but the head is a **plain, smooth, featureless light-grey ball** (like an artist's wooden mannequin head) with **no hat, no hair, no face**. The neck and red neckerchief stay visible. The hat is a separate asset.
2. **If the model keeps adding faces**: accept any head. Keep the neckerchief clearly visible; everything above it gets cut away in code.
3. Whatever the head looks like, keep it **in the same spot in every pose** (the draw and fire poses move the arm, not the head). The game records one head position per pose.

## Asset list

### A. Backgrounds (opaque, no characters)
Side-on view straight across a dirt street, camera at about chest height. A row of wooden false-front buildings fills the back half, with a raised wooden boardwalk with posts and an overhang in front of them. The dirt road fills the front ~40% of the image, **left and right ends empty** where the duelists will stand. Nothing important in the bottom 15% (names and times go there).

| File | Prompt (add the global style) |
|---|---|
| `street-1.jpg` | "Side-on view across the dusty main street of an 1880s frontier town. Weathered wooden false-front buildings: a SALOON with swinging doors and a BANK with barred windows, a raised wooden boardwalk with hitching posts and a water trough. Empty dirt road in the foreground, wheel ruts, scattered straw. Late afternoon, long shadows. Empty of people." |
| `street-2.jpg` | Image-to-image from street-1: "Same street, same camera, same lighting, but the buildings are a GENERAL STORE with barrels and crates and a SHERIFF'S JAIL with a barred window. Empty of people." |
| `street-3.jpg` | Image-to-image from street-1: "Same street, same camera, same lighting, but the buildings are a BLACKSMITH with an anvil and a glowing forge doorway and a STABLE with hay bales. Empty of people." |
| `high-noon.jpg` | Image-to-image from street-1: "The same main street at HIGH NOON: harsh bright overhead sun at the top centre, very short shadows, heat shimmer, bleached sky, a church bell tower and a big clock showing exactly twelve in the background. A gold sheriff's star painted on the saloon sign. Empty of people. Grander and more dramatic than the others." (Arena 1, the top arena) |
| `town-wide.jpg` (1920×1080) | "Wide panoramic establishing shot of a small frontier town street at sunset, buildings on both sides, dusty road leading to distant red mesas. Empty of people." (Title and podium screen background) |

### B. Duelist bodies (green screen, facing right, same canvas)
One gunslinger body that every student shares: dusty long brown coat, waistcoat, red neckerchief, gun belt with a holster on the right hip, boots with spurs. Make it gender-neutral and adult-proportioned but slightly stylized (big readable shapes). The revolver is a classic dark-metal Western six-shooter, always pointing **to the right, level, never toward the viewer**.

| File | Pose | Prompt (add the global style + technical rules) |
|---|---|---|
| `body-idle.jpg` | Standing tall, feet apart, hands loose at sides, coat swept back | "Full-body side view of a Western gunslinger standing ready for a duel, facing right, feet apart, hands loose at their sides, long coat swept back from the holster, featureless smooth grey mannequin head, no hat. Pure flat green background, no shadow on background." |
| `body-ready.jpg` | Hand hovering over the holster, knees slightly bent | Image-to-image from idle: "Same character, same size and position, now crouched slightly with the right hand hovering just above the holstered revolver, fingers twitching, tense." |
| `body-draw.jpg` | Revolver halfway out, coming up | Image-to-image from idle: "Same character, same size and position, mid quick-draw: the revolver is just clearing the holster and swinging up toward the right." |
| `body-fire.jpg` | Arm fully extended to the right, revolver level | Image-to-image from idle: "Same character, same size and position, arm fully extended to the right, revolver held level pointing right, the other hand fanning the hammer. No smoke, no flash (separate layer)." |
| `body-stagger.jpg` | Leaning back, arms flung out, off balance (hat just got shot off) | Image-to-image from idle: "Same character, same size and position of the feet, startled and leaning back off balance, arms flung out, revolver still in the holster, comical surprise. Unhurt." |
| `body-tip.jpg` | Touching the brim of an invisible hat, confident (winner pose) | Image-to-image from idle: "Same character, same size and position, standing relaxed and confident, one hand raised to the head as if tipping a hat, the revolver back in its holster." |
| `body-walk-1.jpg`, `body-walk-2.jpg` | Two walking frames, facing right | Image-to-image from idle: "Same character, same size, mid-stride walking to the right, left foot forward" / "right foot forward". |

### C. Separate pieces (green screen unless noted)
| File | Prompt |
|---|---|
| `hat.jpg` | "A single dusty brown cowboy hat seen from the side, brim facing right, isolated, centred, filling about 60% of the frame. Pure flat green background." Also generate `hat-black.jpg`, `hat-white.jpg`, `hat-sheriff.jpg` (a tan hat with a small gold star badge, for Arena 1). |
| `hat-bullet-hole.jpg` | Image-to-image from hat: "the same hat with a small neat bullet hole through the crown, a wisp of smoke." |
| `muzzle-flash.jpg` | "A bright orange-yellow revolver muzzle flash burst pointing right, star-shaped with sparks, on a pure black background." |
| `gun-smoke.jpg` | "A small soft puff of grey-white gun smoke drifting, on a pure black background." |
| `dust-puff.jpg` | "A burst of ochre desert dust kicked up from the ground, wide and low, on a pure black background." |
| `tumbleweed.jpg` | "A single round dry tumbleweed, side view, isolated, pure flat green background." |
| `bullet-streak.jpg` | "A thin bright horizontal motion streak of light, like a bullet's trail, pointing right, on a pure black background." |
| `sheriff-star.jpg` | "A shiny gold six-pointed sheriff's star badge, front view, isolated, pure flat green background." (Arena 1 marker and the champion's podium) |
| `wanted-frame.jpg` | "A blank aged parchment WANTED-style poster frame with torn edges and nail holes, completely blank in the middle with no text, front view, pure flat green background." (Podium: student avatars go inside) |

### D. Phone art
Phones show the student's own duelist and their opponent's. No new prompts are needed: the script makes half-size copies of `street-1/2/3`, `high-noon`, all bodies, hats and effects. Optional `phone-holster.jpg`: "Close-up of a revolver in a leather holster on a hip, side view, isolated, pure flat green background" (shown while the question is open).

## Optional: animation video clips
These are only useful if the video model can keep the camera **locked** and the background flat green. Frames are extracted with ffmpeg into sprite sheets, and the avatar face is placed on top in code.

Rules for every clip: 1280×720, 24 fps, **2–3 seconds**, **static locked-off camera, no zoom, no pan**, pure flat green (#00FF00) background with no shadows. Same character design as the stills (give `body-idle.jpg` as the starting frame), facing right, featureless grey mannequin head, no hat. **The head must stay in the same place as much as possible.** Feet stay planted.

| File | Prompt |
|---|---|
| `clip-draw-fire.mp4` | "Starting from this frame, the gunslinger crouches slightly, then in one fast smooth motion draws the revolver from the holster and fires once to the right, arm fully extended, a small recoil, then holds the pose. Feet stay planted, head stays still. No muzzle flash, no smoke. Static camera, flat green background." |
| `clip-stagger.mp4` | "Starting from this frame, the gunslinger is startled as if their hat was shot off: they jerk back, arms flail, stumble half a step back, then catch their balance, comically surprised. Unhurt. Static camera, flat green background." |
| `clip-holster-spin.mp4` | "Starting from this frame (body-fire pose), the gunslinger spins the revolver around their finger twice and slides it back into the holster, then stands confidently. Static camera, flat green background." |
| `clip-walk.mp4` | "The gunslinger walks steadily to the right in place, like on a treadmill, two full steps, coat swaying. Head level. Static camera, flat green background." (A walk cycle) |
| `clip-tumbleweed.mp4` | "A tumbleweed rolls and bounces from left to right across the frame. Static camera, flat green background." |
| `clip-hat-fly.mp4` | "A cowboy hat is knocked off and spins up and away to the left in an arc, tumbling, then falls out of frame. Static camera, flat green background." |

## Checklist before handing art back
- [ ] Every character faces right; the poses line up (flick between them and the feet don't jump).
- [ ] No faces on the bodies (or a head that can be cut away above the neckerchief).
- [ ] Green screens are flat green with no shadows, and no green on any subject.
- [ ] Effects are on pure black.
- [ ] No text in any image.
- [ ] Put the files in `scripts/showdown-art/` with the names above.

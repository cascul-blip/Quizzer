A cooperative defusal game.  A semi-realistic bomb sits on a workbench on the projector with a countdown timer.  The bomb is made of **modules**, and each module has **wires**.  Every wire is one question.

The twist: **everyone in the squad sees the question, but the answer choices are split across the squad's phones.**  Only one student holds the right wire.  The squad has to talk it out, and the student holding the right wire cuts it.  A wrong cut costs time.  Clear every module before the timer runs out and the bomb is defused.

Inspired by Quizlet Live, where only one teammate's screen has the right answer.

**How it's different from Submarine Squad's dive:** in the dive, an instructor describes a picture symbol and the others search a grid for it, so it's a listening game with roles.  In Bomb Squad there are no roles: everyone reads the same quiz question, nobody can see all the answers, and the squad has to agree on the right answer from what they know about the subject.

## Lobby
Choose **Game mode → 💣 Bomb Squad**.

Settings:
* **Game**: **Together** (default) or **Race**.
  * Together: the whole class defuses **one bomb**.  Each squad gets its own modules on the bomb.
  * Race: each squad gets **its own bomb**, and the first squad to defuse theirs wins.
* **Squads** (1–6).  The squads are shown in the lobby the same way as Land Grab and Dragon's Hoard teams, and the host can drag a name to another squad.  A squad is 2 to 6 players.  The default is the fewest squads that keep every squad at 6 or fewer (so a class of 3 or 6 is one squad).
* **Modules per squad**: 2, 3 or 4 (default 3).
* **Wires per module**: 2, 3 or 4 (default 3).
* **Bomb timer**: 3, 5, 7 or 10 minutes (default 5).
* **Wrong cut**: −10, −15, −20, −30 or −40 seconds (default −15).

## Dealing the wires
For each wire, the squad gets one question from the quiz.  Questions come in a random order and repeat once they run out.  Each squad has its own order.

Every phone in the squad shows the same question.  The question's answer choices become **colored wires**, and each wire is dealt to one phone.  Each phone can only see the wires it holds.

The deal depends on the squad size and how many choices the question has:

* **Fewer players than choices** (for example, 3 players and 4 choices): every player gets one wire, and the extras go one each to the players with the fewest wires.  So with 3 players and 4 choices, one player holds 2 wires.  Who gets the extra wire changes from question to question.
* **Same number of players and choices**: one wire each.
* **More players than choices** (for example, 6 players and 4 choices): every player still gets a wire.  The extra players get **decoy wires**: wrong answers taken from other questions in the same quiz.  This keeps every student in the conversation.  If the quiz doesn't have enough other answers, the extra players get a copy of one of this question's wrong answers instead.
* **A squad of 1** holds every wire, which plays like a normal quiz against the clock.
* **The right wire is dealt fairly.**  Over the game, every player holds the right wire about as often as everyone else: the right wire goes to the player who has held it the fewest times so far (ties at random).
* With more than one right answer (multiple choice with several correct options), cutting any right wire clears it.

### Question types
* **Multiple choice**: as above.
* **True/False**: there are only two wires, True and False.  With more than 2 players, every player gets either a True or a False wire, split as evenly as possible.  Any player holding the right one can cut it.
* **Type the answer**: this becomes a **keypad** module.  Every phone shows a text box, and anyone can type the answer and press **Enter**.  A wrong answer costs time the same as a wrong cut.  Typed answers are checked the same way as in every other mode (case and plural endings are ignored).
* **Pin on picture**: every phone shows the picture, but only **its own spots**.  The spots are dealt the same way as wires.  The student who has the right spot taps it and holds to cut.  If there are more players than spots, the extra players get copies of wrong spots.

## Defusing
1. The bomb timer starts and the first wire's question shows on every phone in the squad.
2. The squad talks it out.  Each player reads their wires to the others.
3. **Only the player holding a wire can cut it.**  They tap the wire, then **hold the Cut button for 1.5 seconds** (like Racer's Go! button).  While they hold it, every other phone in the squad shows **"Ana is cutting the blue wire…"**, so a teammate can shout "Stop!" in time.  Letting go before the hold finishes cancels the cut.
4. Only one cut at a time per squad.  While someone is holding, the other Cut buttons are greyed out.
5. **Right wire**: the wire snaps with a spark, the module lights up one more green light, and the next wire's question appears after 2 seconds.
6. **Wrong wire**: a buzz and a red flash, and the **bomb timer loses 15 seconds** (the Wrong cut setting).  The wrong wire is gone, and the squad keeps going on the same question with the wires that are left.  The right answer is shown after the wire is cleared, so the squad learns it.
7. When every wire in a module is cleared, the module turns green with a chime, and the squad moves to its next module.

### Win and lose
* **Together**: the bomb is **defused** when every squad has cleared all its modules.  A squad that finishes early sees "Your modules are done! Cheer on the others," and its time keeps counting for the class.
* **Race**: the first squad to clear all its modules **wins**.  The other squads keep going until they finish or their timer runs out, so everyone gets a place.
* If the timer reaches 0, the bomb **explodes**: a full-screen explosion with a white flash, fireball, smoke, flying debris and a screen shake, then the scorched workbench.  The wording: "BOOM! The bomb exploded."
* The host can press **End game** at any time.

## Scoring and results
* **Together**: the result is **Defused with 1:42 left** or **Exploded with 9 of 12 modules cleared**.
* **Race**: squads are ranked by finish time, then by modules cleared, then by fewest wrong cuts.

Awards:
* **Steady Hands**: most right cuts.
* **Careful Cutter**: fewest wrong cuts (at least 2 right cuts).
* **Team Player**: most right wires held that the squad cut on the first try, with no wrong cut first.  This rewards the students who spoke up clearly.

**Show errors** works the same as in the other modes: every wrong cut or wrong keypad entry counts as a wrong answer on that question.

The results CSV has one row per player: squad, squad result (defused or exploded), squad time left, squad rank (Race), wires held, right wires held, right cuts, wrong cuts, keypad right, keypad wrong, time lost to their wrong cuts, plus the squad's modules cleared and total time lost.

## Display
### Projector
* **Lobby**: the bomb on a workbench, the squads in the lobby list, and the selected Game (Together or Race).
* **Countdown**: 3, 2, 1, then the timer starts.
* **Defusing, one squad**: the big timer, the bomb with its modules (green lights for the wires cleared), and the current question in big text without the answers.
* **Defusing, more than one squad**: the big timer and the bomb (Together) or one small bomb per squad (Race), with each squad's modules and lights.  The questions stay on the phones.
* **Wrong cut**: a red flash on that squad's module, sparks, and the timer drops with a "−15" pop-up.
* **Module cleared**: the panel turns green and chimes.
* **Defused**: the timer freezes, "Bomb defused!" with the time left and confetti.
* **Exploded**: the explosion and "BOOM! The bomb exploded."  Phones flash and buzz.
* **Podium**: the result (Together) or the squad places (Race), the awards, and Show errors / Play again / Done.

### Phones
* **Defusing**: the question at the top, a thin timer bar, then **your wires** (each a colored wire with the answer on a tag), and the Cut button.  A status line shows what the squad is doing ("Ben is cutting the red wire…", "Wrong wire! −15 s").
* **Keypad**: the question and a text box for everyone.
* **Pin**: the picture with only your spots.
* **After a right cut**: a short "Snip! ✓" and the next question.
* **Module cleared / your modules done**: a short message, then the next module or "Cheer on the others."
* **Defused or exploded**: the result, then the podium with your squad's place and your awards.

## Environment
A gritty bomb-disposal room (chosen style A): a scuffed steel device under one harsh work lamp, teal shadows, a red digital clock.  The look is semi-realistic, not cartoon: painted with real materials, lighting and detail (metal casing, circuit boards, real-looking colored wires, a digital clock), like a movie prop. It's for upper-level high schoolers, so it can feel genuinely tense and dangerous.

## Sound
Music is composed in code like the other modes.
* **Lobby**: a light, sneaky spy-jazz theme (bass, brushes, vibraphone).
* **Defusing**: the same theme with a ticking clock.  It gets faster and adds layers as the timer runs down, with extra urgency under 30 seconds.
* **Results**: a happy fanfare for Defused, or a deep boom and ringing-ears tone for Exploded, then the podium music.

Sound effects (in sounds.ts): tick, snip, spark, wrong-wire buzz, module chime, keypad beeps, defuse fanfare, explosion boom.

## Decisions
These are the starting choices for this mode.  Each one is marked and needs the user to decide.

* Name and emoji: 💣 Bomb Squad.  If "bomb" doesn't feel right for the school, a friendlier option is 🧰 **Defuse Squad** with a "Mystery Box" gadget.  The rules stay the same either way.
* Together is the default.  Race is a lobby option.
* Squads are 2–6 players, set and draggable in the lobby.  The default is the fewest squads with 6 or fewer each.  A squad of 1 is allowed and plays like a normal quiz against the clock.  Race needs at least 2 squads.
* With more players than choices, the extra players get **decoy wires** (wrong answers from other questions in the quiz), not copies of this question's answers.  Copies are only used when the quiz runs out of other answers.
* With fewer players than choices, the extra wires go to the players with the fewest wires, rotating so nobody always holds two.
* The right wire goes to whoever has held it the fewest times.
* True/False: every player holds True or False, split evenly.
* Type the answer: a keypad module that anyone in the squad can type into.
* Pin: each phone only sees its own spots, dealt like wires.
* Only the holder can cut their own wire, with a 1.5-second hold.  Others see "is cutting…".  One cut at a time per squad.
* Wrong cut: −15 seconds by default (−10 / −15 / −20 / −30 / −40 setting).  The wrong wire is removed and the squad keeps going on the same question.  There are no strikes; only time is lost.
* 3 modules per squad and 3 wires per module by default (2–4 each).  Bomb timer 5 minutes by default (3 / 5 / 7 / 10).
* In Together mode, finished squads wait and cheer; they don't help other squads.
* Race places: finish time, then modules cleared, then fewest wrong cuts.
* The timer running out is a real explosion (flash, fireball, smoke, debris, screen shake).
* Awards: Steady Hands, Careful Cutter, Team Player.
* Protect from abuse doesn't apply in this mode.  The wrong-cut time penalty already stops random cutting, and the hold-to-cut gives teammates time to stop a guess.

## Reconnects and late joiners
* A player who reconnects comes back to the same squad, and gets their wires back if they haven't been re-dealt.
* If a player is disconnected for **5 seconds**, their wires are re-dealt to the connected players in their squad, so nobody is stuck waiting on a missing phone.  If they were holding the Cut button, the cut is cancelled.
* A late joiner goes to the smallest squad that hasn't finished and is dealt in on the next wire.  If every squad has finished, they wait for the podium.
* If a squad drops to 0 connected players, its timer keeps running (Race) or its modules wait for the others (Together).

## Bandwidth
* Each phone only gets the question, its own wires, and a short squad status line, sent as patches (view-patch.ts).
* The timer is sent as an end time, so phones count down on their own instead of getting an update every second.  It is only re-sent when a wrong cut changes it.
* "Is cutting…" is one small message when the hold starts and one when it ends.
* With several squads, the projector only gets each squad's lights, not their questions.
* Phones use the small phone versions of the wire and panel art.  The workbench and the big bomb are projector only.

## Art assets
Made the same way as the other painted art: generated source images in `scripts/bomb-art/`, turned into WebP by `python3 scripts/bomb-art.py` (needs Pillow and numpy), with the output committed to `src/client/shared/bomb/` and phone versions in `src/client/shared/bomb/phone/`.  The prompts go in the script.

| Asset | Projector | Phone | Notes |
|---|---|---|---|
| Workbench background | yes | no | the gritty disposal-room workbench under a harsh lamp (style A); plus a scorched version for after the explosion |
| Bomb casing | yes | small (Race) | semi-realistic device with a digital clock face; the timer digits are drawn in code |
| Wire module panel | yes | yes | |
| Keypad module panel | yes | yes | |
| Picture module panel | yes | no | the frame for pin questions |
| Wire, whole and cut | small | yes | one grey wire, tinted in code to 6 colors |
| Wire cutters | no | yes | |
| Module lights (off, green, red) | yes | yes | |
| Sparks | yes | yes | can also be drawn in code |
| Explosion (fireball, smoke, debris frames or layers) | yes | no | can be layered with code-drawn flash and shake |
| Defused confetti | yes | yes | can also be drawn in code |

## Music cues
Track ids (each can be replaced with a file in `data/music/`):

| File name | Plays during |
|---|---|
| `bomb-lobby` | Lobby |
| `bomb-defuse` | Defusing |
| `bomb-results` | Defused/Exploded and the podium |

`bomb-defuse` gets faster with the timer.  A wrong cut gives a short stinger, and a module cleared gives a short lift.

## Implementation Notes
For the Coder bot.  The server runs everything, the same as the other modes.  The server deals the wires and checks every cut; phones never get the wires they don't hold or which wire is right.

### Files to add
* `src/server/game/bomb.ts`: the `BombGame` engine.  Phases: `countdown`, `defuse`, `defused`, `exploded`, `podium`.  Each squad has: its players, a question order, modules, the current wire (question, the deal of wires to players, wires already cut), the timer end, the one cut being held, and stats.  Built like `DragonGame` and `CupGame`: `fromLobby()`, `start()`, `hostView()`, `playerView(id)`, and the callbacks.
* `src/client/host/bomb.tsx` and `src/client/player/bomb.tsx`: the projector and phone screens.
* `src/client/shared/bomb-art.tsx`: drawing the bomb, modules, wires and lights.
* `src/client/shared/bomb/` and `phone/`: the WebP art.
* `scripts/bomb-art.py` and `scripts/bomb-art/`: the art source and pipeline.
* `tests/bomb.test.ts`: deal rules for 1–6 players and 2–4 choices, decoys and copies, fair rotation of the right wire, True/False, keypad, pin, hold and cancel, one cut at a time, wrong-cut penalty, re-deal after disconnect, late joiners, Together and Race endings, and the results CSV.

### Files to change
* `src/shared/protocol.ts`: add `"bomb"` to `GameMode`.  Add `BombPhase`, `BombSettings` (game, squads, modules, wires, minutes, penaltySec), the constants (hold time, re-deal delay, next-wire delay), `HostBombState`, `PlayerBombView`, `BombAwards`.  Messages: `bomb.hold` (start or stop holding a wire), `bomb.cut` (wire id, sent when the hold finishes; the server checks it), `bomb.type` (keypad answer), and `host.setBomb`.  Add `BombPhase` to the phase union and the views to the view unions.
* `src/server/game/game.ts`: `"bomb"` in `setMode()`, `DEFAULT_BOMB`, `setBomb()`, and `teamCount()` returning the squad count so the lobby shows the squads and drag-to-team works.
* `src/server/ws.ts`: `startBomb()` like `startDragon()`, the `host.start` branch, the `bomb.*` and `host.setBomb` cases, and the setting in `lastSetup`.
* `src/server/game/results.ts`: `buildBombResultsCsv()`.
* `src/shared/music-tracks.ts`, `src/client/shared/music/tracks.ts`, `src/client/host/music-cues.ts`: the three `bomb-*` tracks and cues.
* `src/client/shared/sounds.ts`: the sound effects.
* `src/client/host/main.tsx` and `src/client/player/main.tsx`: the lobby choice and settings, and sending the views to the new screens.
* `src/server/bundles.ts` and the phone art list, if new phone art needs listing.
* `README.md`: a Bomb Squad section and rows in the music table.

### What to borrow
* **Different information on different phones**: Submarine Squad's dive in `submarine.ts` (`startDive()` splitting players into groups, the per-player `diveView()`, and how it handles a player leaving mid-dive, which is the model for re-dealing wires).
* **Squads**: the team assignment, drag-to-team and late joiners from `game.ts`, `land.ts` and `dragon.ts`.
* **Hold to confirm**: Racer's hold-the-Go!-button in `src/client/player/racer.tsx` and `racer.ts`.
* **A shared timer bar that can lose time**: the timed phases in `cup.ts` and `robot.ts`.
* **Question order, answer checking and the error tally**: `stream.ts` (deck shuffling, kept per squad instead of per player), `answer-match.ts` for the keypad, and `topErrors()` in `common.ts`.
* **Pin questions with only some of the spots**: `src/client/shared/pin.tsx`.
* **Settings plumbing and the overall shape of a new mode**: `dragon.ts`, the newest mode.

## Build Plan
| Phase | Who | What | Size |
|---|---|---|---|
| 1. Spec sign-off | User and Project Manager | Decide the choices above, then remove the marks | XS |
| 2. Art | Artist bot | The assets above through `scripts/bomb-art.py`, with phone versions | S (less art than Dragon's Hoard) |
| 3. Code | Coder bot | Engine, screens, music, sounds, tests, README | M (about 2/3 of Dragon's Hoard) |
| 4. Play-test | User | One game with the physics class (one squad of 3) and one with biology (6 players: one squad of 6 with decoys, or Race with two squads of 3).  Tune the wrong-cut penalty, timer and decoys | S |
| 5. Release | Coder bot | Fixes from the play-test, version bump to 0.18.0, merge | XS |

Overall: **M**.  Art and code can run at the same time once the spec is signed off.

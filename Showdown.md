Every player for themselves in a Western quick-draw tournament.  Each round, the whole class is paired off into duels on the dusty street of a frontier town, and every duel runs at the same time on one projector screen.  The student who answers right fastest "draws first" and shoots the other duelist's hat off.

Players are re-paired every round with an **arena ladder**: winners move up one arena, losers move down one, and nobody is eliminated.  With 6 players there are 3 duels side by side, so nobody waits for another match to finish.

The mode id in the code is `duel`.

## Lobby
Choose **Game mode → 🤠 Showdown**.

Settings:
* **Rounds**: 10, 15 or 20 (default 15).  Each round is one question.  If the quiz has fewer questions than rounds, the questions repeat in a fresh random order once they have all been used.
* **Shuffle question order**, **shuffle answer positions** and **Pacing** work the same as in Classic.

There is no separate lobby phase: the lobby is the Classic lobby with Showdown selected.

## Arenas and pairing
When the game starts, the players are put in a random order: the **ladder**.  They are paired from the top:

* **Arena 1** is **High Noon** on Main Street (the sheriff's star, drawn larger than the others).  It gets the top two players.
* **Arena 2** gets the next two, then Arena 3, and so on.
* With an **odd number of players**, the bottom arena is a **3-way duel**.
* With 2 or 3 players there is just one arena (a duel or a 3-way duel).  A single player has an arena to themselves and just answers.

6 players → 3 arenas.  7 players → 3 arenas, the bottom one 3-way.  30 players → 15 arenas.

## A round
1. **Intro (3 seconds)**: the question appears at the top of the projector and on every phone, without its answers.  The duelists face off in their arenas.
2. **Open**: the answers appear, and **everyone answers the same question at once**.  There is one shared timer, the question's own time limit.  The question closes early once everyone has answered.  Each phone shows the answer tiles plus who you're up against, e.g. **"Arena 2 · vs 🦊 Sam"**.  One answer per player per round.
3. **Reveal (about 5 seconds)**: the projector shows the right answer, then each arena plays out its duel: ✓ or ✗ and the answer time under each duelist, the winner draws and fires, the loser's hat flies off, and the movers walk to their new arenas.  Phones show **"You won! ⬆ Arena 1"**, **"⬇ Arena 3"** or **"Draw — you stay"**.
4. Pacing works as in Classic: *Manual* waits for **Next** (or Space/→) after each reveal, and *Auto-advance* moves on after 5 seconds.  Press **S** to skip a countdown.

Every question type works: multiple choice, true/false, type the answer and pin on picture.

## Who wins a duel
* **Right beats wrong.**
* **Both right**: the **faster** answer wins.
* **Both wrong, or no answer**: a **draw**, and nobody moves.  A player who doesn't answer (or is disconnected) counts as no answer.
* **3-way duel**: the **best** duelist wins and the **worst** loses; the one in the middle stays.  "Best" means right before wrong before no answer, then faster.  If nobody in the arena is right, it's a draw.
* An exact tie in time (very rare) means neither of the tied duelists wins or loses.

## Moving up and down the ladder
At each **boundary** between two arenas, the **upper arena's loser swaps with the lower arena's winner**.

* If either arena was a **draw**, nobody crosses that boundary.
* The **Arena 1 winner stays** on High Noon.  They can't go higher.
* The **bottom arena's loser stays** at the bottom.
* Within an arena, the winner takes the top place and the loser the bottom place, so next round the pairs are new even when nobody crossed.

Example with 6 players: Arena 1 is Ana vs Ben, Arena 2 is Cal vs Dee, Arena 3 is Eve vs Fox.  Ben, Dee and Fox win.  Ben stays on High Noon.  Ana (Arena 1's loser) swaps with Dee (Arena 2's winner), and Cal (Arena 2's loser) swaps with Fox (Arena 3's winner).  Eve stays at the bottom.  Next round: Arena 1 Ben vs Dee, Arena 2 Ana vs Fox, Arena 3 Cal vs Eve.

## Late join, leave and kick
* **Late joiners** go to the **bottom of the ladder** and duel from the next round.
* A **disconnected** player keeps their place and counts as no answer, so their opponent only has to answer right to win.  If they reconnect, they carry on where they are.
* **Kicking** a player removes them and the ladder closes up.  If that leaves an arena with one duelist this round, that duelist just stays.

## End and awards
The game ends after the last round.  **The ladder order is the final ranking**: the winner of the last High Noon duel is first, and so on down the ladder.  The podium shows the top three on **WANTED** posters, the rest of the ladder, and the awards:

* **Longest reign**: most rounds won in Arena 1.
* **Most wins**: most duels won.
* **Biggest climb**: most arenas climbed from the starting arena to the final one.

**Show errors**, **Play again** and **Done** work as in every other mode.  The results CSV has one row per player: rank, final arena, wins, losses, draws, rounds won on High Noon, and each answer with its time.

## Display
The art is a painted Western movie style; the full list of images and the prompts used to make them are in `Showdown Art Brief.md`.

### Projector
* **Side-on street panels**: one panel per arena, each a stretch of dirt street with wooden false-front buildings (saloon, bank, general store, jail, blacksmith, stable) and a boardwalk behind.  The two gunslingers stand at the left and right edges facing each other.  Each one is a cowboy body with a hat and the player's own avatar as the face.  Names and answer times sit under each duelist.  In a 3-way duel, the third duelist stands in the middle at the back.
* **High Noon**: Arena 1 is always drawn larger, on Main Street at noon with the clock tower and a sheriff's star.
* **Big classes**: the panels shrink into a grid (e.g. 30 players = 15 panels).
* **While the question is open**: the question and timer at the top, tumbleweed rolling through the panels, hands hovering over holsters, and a mark over each duelist who has answered (not whether they were right).
* **The reveal**: the faster right answer **draws and fires** (muzzle flash, smoke), and the other duelist's **hat flies off** and they stagger back into the dust.  The winner tips their hat.  In a **draw**, both shoot and miss and dust puffs up.  Then the movers **walk up or down the street** to their new panels.
* **Podium**: a sunset town street, the top three on WANTED posters, the sheriff's star for the champion, the awards.

Nobody gets hurt: the loser only loses their hat.  No blood, and no guns pointing at the viewer.

### Phones
* **Intro / open**: the question, the answer tiles, and "Arena 2 · vs 🦊 Sam" (or both opponents in a 3-way duel).
* **Reveal**: your duel side-on (you and your opponent), ✓/✗ and both times, and where you're going next.
* **Podium**: your rank and your awards.

## Sound
Music is composed in code like the other modes, and is original (not a film score).

* **Lobby** (`showdown-lobby`): a lone rider: a twangy guitar keeping time, a jaw harp (Jew's harp) boinging along, a whistle drifting over the empty street and a far-off anvil.
* **The standoff** (`showdown`): original music in the Spaghetti Western style.  Rounds are quick, so the build starts at once: during the intro the guitar drives a habanera bass, a **jaw harp** boings on a D drone, the hooves walk and the **whistle** already has the tune.  When the answers appear it keeps building and reaches its peak halfway through the question's time: the guitar chops the offbeats and answers the whistle, the hooves break into a **gallop** over timpani, then **whip cracks** and chanted **"hup!"** stabs, the anvil on every offbeat and sawing strings, and finally the **trumpet** takes the tune over a driving snare.  The reveal eases back to the riding beat instead of going quiet, so the music never stops between rounds.
* **The draw** (`showdown-draw`): a short one-shot sting on each reveal: a whip crack, an anvil strike, a brass stab over a timpani hit, a jaw-harp boing and the guitar ringing out, with the music dipping under it.
* **Results** (`showdown-results`): riding off into the sunset in D major: the trumpet on the tune, the whistle above it, a full gallop and whip cracks.

It's written to sound like a classic Spaghetti Western without borrowing any film's melody, and to stay apart from Cup of Death: D minor instead of A minor, a tune of wide leaps instead of steps, a habanera bass instead of boom-chick, plus anvil, whips, the chant and the trumpet.

## Decisions
These are the starting choices for this mode.

* Name and emoji: 🤠 **Showdown** (mode id `duel`).  Theme: a Western quick-draw shootout on a frontier-town street; side-on camera.
* **Arena ladder** pairing (winners up, losers down, nobody eliminated), so every duel runs at once and nobody waits.
* Everyone gets the **same question** each round, with one shared timer.
* Rounds: 10 / 15 / 20, default 15.  Questions repeat in a fresh order once used up.
* Right beats wrong; both right → faster wins; both wrong or no answer → draw.  In a 3-way duel, no answer is worse than a wrong answer.
* A draw blocks its boundaries: nobody crosses into or out of a drawn arena.
* An odd count makes the **bottom** arena a 3-way duel (not the top), so High Noon is always one-on-one.
* The starting ladder is random.
* Late joiners start at the bottom; disconnected players keep their place and count as no answer.
* The final ranking is the ladder order, not a points total.
* Awards: Longest reign, Most wins, Biggest climb.
* Protect from abuse doesn't apply: each player only answers once per round, and a wrong answer already loses the duel.
* Animation is done in code over still art (pose swaps, hat spin, flash, dust, tumbleweed, walking).  No video playback, so each player's avatar can be placed on their duelist.

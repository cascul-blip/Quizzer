# Quizzer

A self-hosted, Kahoot-style quiz game for classrooms and events on a local network.

- **One program** runs on the host computer (Linux or Windows) and serves everything.
- The **projector screen** shows the join QR code and URL, the questions and answer tiles, the answer reveal, a leaderboard, and a podium.
- **Players join from their phone's browser** by scanning the QR code or typing the URL. They don't install anything, and no domain name or internet connection is needed.
- Quizzes support **multiple choice (2–4 options)** and **true/false** questions. You can add images, allow several correct answers, shuffle questions and answers, and export results to CSV.
- **AI agents** can create and edit quizzes through the built-in **MCP server**.

## Quick start

1. Download `quizzer-linux-x64` or `quizzer-windows-x64.exe` (or [build it](#building)).
2. Run it. On Linux, make it executable with `chmod +x quizzer-linux-x64` first. The admin page opens in your browser at `http://localhost:8080/admin`.
3. Create a quiz (or import `examples/sample-quiz.json`) and click **▶ Host**. Put the host window on the projector; press **F** for fullscreen.
4. Players connect to **the same Wi-Fi** as the host computer and scan the QR code.
5. Click **Start** when everyone is in.

Quizzes, images and results are stored in a `data` folder next to the program:

```
data/quizzes/<id>.json    one file per quiz; safe to back up, copy or hand-edit
data/media/               question images
data/results/             CSV of every finished game (rank, score, each answer and time)
```

### Firewall

Phones must be able to reach the host computer on the port (default 8080).

- **Windows** asks the first time you run the program. Allow access on **Private networks**.
- **Linux** with a firewall needs the port opened. See [Opening the port with UFW](#opening-the-port-with-ufw-linux) below.
- Some guest/school Wi-Fi networks block devices from talking to each other ("client isolation"). If phones can't load the page, use a network without isolation, or a phone hotspot.

#### Opening the port with UFW (Linux)

Many Linux distributions use UFW ("Uncomplicated Firewall"). When it's active, it blocks phones from reaching Quizzer until you open the port. The admin page still works on the host computer, because `localhost` isn't affected.

1. Check whether UFW is running:

   ```sh
   sudo ufw status
   ```

   If it says `Status: inactive`, nothing is blocked and you can skip the rest.

2. Open the port. Either allow it from anywhere:

   ```sh
   sudo ufw allow 8080/tcp comment 'Quizzer'
   ```

   or, safer, only from your local network. Replace `192.168.1.0/24` with your network. The join URL shows your computer's address (e.g. `192.168.1.23`); the network is the same first three numbers followed by `.0/24`.

   ```sh
   sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp comment 'Quizzer'
   ```

3. Check that the rule is there:

   ```sh
   sudo ufw status numbered
   ```

   You should see a line with `8080/tcp` and `ALLOW`. The rule takes effect immediately and stays after a reboot; there's no need to restart Quizzer.

**Using a different port?** If you start Quizzer with `--port 9000`, open that port instead (`sudo ufw allow 9000/tcp`).

**Removing the rule later:** find its number with `sudo ufw status numbered`, then delete it, e.g. `sudo ufw delete 3`. Or delete it by its rule text, e.g. `sudo ufw delete allow 8080/tcp`.

**Still can't connect?** Test from a phone by opening `http://<computer-address>:8080/` in its browser. If that fails with UFW allowing the port:
- The phone may be on a different network (e.g. mobile data or a guest Wi-Fi).
- The Wi-Fi may use client isolation.
- Another firewall (such as `firewalld` on Fedora) may be running instead. For `firewalld`, use `sudo firewall-cmd --add-port=8080/tcp --permanent && sudo firewall-cmd --reload`.

If the QR code shows the wrong address (a VPN or virtual adapter, for example), choose the right one under **Network settings** in the lobby, or start with `--host <ip>`.

### Command line

```
quizzer [serve] [options]   Start the quiz server (default)
quizzer mcp [options]       Run the MCP server over stdio (for AI agents)

  -p, --port <n>        Port to listen on (default 8080)
      --host <ip>       Address to put in the join URL/QR code (default: auto-detect)
  -d, --data-dir <dir>  Where quizzes, images and results are stored
      --no-open         Don't open the admin page in a browser
```

## Playing

| Host screen | What happens |
|---|---|
| Lobby | Big QR code and URL; names appear as players join. Click a name to remove that player. Choose the pacing and whether to **shuffle question order** and **shuffle answer positions**, then press **Start**. |
| Question | Question text first, then the answer tiles, a countdown and an answered counter. The question ends when time runs out **or** everyone has answered. Press **S** to skip. |
| Reveal | The correct answer(s) are highlighted and a chart shows how many picked each option. Each phone shows **Correct/Wrong** with the correct answer highlighted. |
| Leaderboard | Top 5, with points gained on the last question. Players on a streak of 4+ correct answers in a row get a 🔥 badge with the count (e.g. 🔥x4). |
| Podium | Top 3 plus the rest, with **Show errors**, **Play again** and **Done**. |

- **Pacing**: *Manual* waits for you to press **Next** (or Space/→). *Auto-advance* moves on after 5 seconds on the reveal and leaderboard. You can switch pacing mid-game from the top bar.
- **Scoring**: a correct answer is worth 1000 points if given instantly, falling to 500 at the time limit. Wrong or missing answers score 0.
- **Multiple correct answers**: players still tap one option, and any correct option scores.
- **Shuffling** is chosen in the lobby for each game; the quiz's shuffle settings in the editor are the defaults. Shuffling answer positions moves each answer to a random tile (and color), so the correct answer isn't always in the same place. The order is fixed when you press Start and is the same on the projector and every phone. True/False keeps True before False.
- **Streaks**: after 4 correct answers in a row, a player gets 🔥x4 (x5, x6, …) next to their name on the leaderboard, the podium and their phone. A wrong or missed answer resets it.
- **Show errors**: on the final screen of every game mode, this button swaps the results for a table of the **10 questions with the most wrong answers**, each with its correct answer, so you can go over them with the class. Press **Show results** to switch back. Classic counts wrong answers only, not questions a player let time out; in the other modes a question can come up more than once, and every wrong answer counts.
- **Results file**: a CSV of every finished game is saved in `data/results/`. The latest one is also at `http://localhost:8080/api/results/latest.csv` on the host computer.
- **Reconnecting**: if a phone locks, refreshes or drops Wi-Fi, it rejoins as the same player with the same score. Players can also join after the game has started.
- Only one game runs at a time. The admin, host controls and API only work from the host computer itself (`localhost`). Phones can only reach the player page.

## Tallest Tower mode

A team game modeled on Kahoot's Tallest Tower. Choose **Game mode → 🏗 Tallest Tower** in the lobby, then pick:

- **Teams** (1–6). Players are placed automatically in join order; the lobby shows the teams live. Late joiners go to the smallest team.
- **Time**: 2, 3, 5, 7 or 10 minutes. The countdown runs on the projector, and **End game** stops it early.
- **Shuffle answer positions**: shuffles each player's answers independently.

How it plays:

1. Every player answers questions **on their own phone, at their own pace**. Nobody waits for anyone else. Questions come from the quiz in a random order and repeat once they run out.
2. After each answer, a green ✓ or red ✗ shows for 1 second, then the next question appears. **Each correct answer earns a block.**
3. At **4 blocks** the phone switches to **build mode**:
   - A block slides back and forth across the top. Tap anywhere to drop it.
   - The screen has five zones: **✕ · left · center · right · ✕**. A block in the left, center or right zone lands on top of that column of the team's tower; a block in an outer ✕ zone falls off and is lost.
   - After all 4 blocks are dropped, the player goes back to questions.
4. A **floor** counts once all 3 columns reach that height. The block slides faster as the team's tower gets taller.
5. When time is up, the team with the **most floors** wins; ties go to the most blocks placed. There are also individual awards for **Most correct answers** and **Master builder** (most blocks placed).

**👾 The monster** (lobby option, on by default, needs 2+ teams):

1. Four times per game, evenly spaced (at 1/5, 2/5, 3/5 and 4/5 of the game length), every tower gets a 🥚 **monster egg** placed **4 levels above its highest complete floor** (a tower with 10 full floors gets its egg on level 14), in a random column where that spot is still empty.
2. Teams race to land a block on their own egg. **The first team to do it hatches the monster** and is safe.
3. The monster stomps over to the **tallest other tower** and smashes its **top 2 floors**.

If nobody reaches the egg, it stays until someone does or the game ends. Phones show the egg in build mode and a reminder while answering, and pop up a message when your team hatches it or gets smashed. The results CSV counts eggs hatched per player.

The projector shows only the teams' towers, side by side and at the same scale, plus the timer. Each phone shows only that player's question, or their own team's tower while they're building. The results CSV has one row per player: team, rank, floors, correct/wrong, accuracy, and blocks placed and missed.

## Submarine Squad mode

A cooperative mode based on Kahoot's Submarine Squad. The whole class is one squad trying to keep a submarine away from a giant **anglerfish**. Choose **Game mode → 🐟 Submarine Squad** in the lobby. There's no timer: **the game ends when the fish catches the sub**, and the score is how deep the squad got.

**Submarine mode**
- Everyone answers questions on their phone at their own pace, with the correct answer shown after a wrong one.
- Every 4 correct answers gives that player a **boost button**. They hold it down: a ring charges over about 2 seconds while the phone revs like an engine. Letting go drains the charge.
- When the ring is full, the submarine surges away from the fish on the projector.
- The fish closes in steadily, and **its jaws open wider the closer it gets**.
- Filling the boost bar (**3 + number of players** boosts) clears the level.

**Diving mode** (after each level)
- One or more players (1 per 6 players, up to 4) become **instructors**. Each sees a symbol, such as "the red octopus", and describes it out loud.
- Everyone else is secretly assigned to an instructor and must tap that instructor's symbol in a grid of look-alikes. Players have to work out which instructor is describing *their* symbols.
- An instructor moves on when 70% of their group finds the symbol (or after 4 seconds, shown as a shrinking red bar on the phones). Each instructor has 5 symbols.
- Every correct tap takes the sub 2 m deeper. Wrong taps lock the player out for a second.
- Players who join mid-dive wait for the next level.

Each level is worth 100 m. **Deeper levels have a faster fish.** The podium shows the final depth and awards for **Top booster**, **Sharpest eyes** (most symbols found) and **Most correct answers**. The results CSV lists each player's answers, boosts, dive taps and instructor rounds.

## Tower Fight mode

A two-team battle: **Red** and **Blue** each defend a castle tower, with a hill between them. Choose **Game mode → 🏰 Tower Fight** in the lobby, and pick a **Hill** height: Low, Medium, High or 🎲 Random (the default). Players are split into the two teams by join order, and late joiners go to the smaller team. There's no timer: **the game runs until a tower falls** or the host clicks **End game**.

- Everyone answers questions on their phone at their own pace, with the correct answer shown after a wrong one. Questions repeat until the game ends.
- Every 4 correct answers gives that player a move. They have **10 seconds** to choose Attack or Rebuild, or the move is lost:
  - **💥 Attack.** The player's avatar sits in their team's catapult, and there's no time limit for aiming. They press anywhere, **pull back like a slingshot** (away from the target) and let go. A longer pull throws harder. A short dotted arc shows the direction, but not where the shot lands.
  - **🧱 Rebuild.** Repairs 1 damage on their own tower, but it takes **4 seconds**: the phone fills up with bricks as a progress bar (and the projector shows scaffolding on the tower). The tower is repaired when the wall is full, then the player goes back to questions. If teammates have already fixed the tower by then, the repair is wasted. Rebuild is only offered when the tower is damaged; otherwise the player goes straight to the catapult.
- The avatar flies across the projector screen and lands on a tower, on the ground, or off the map. The hill always blocks flat shots, so players have to lob over it.
- **Every tower hit does 1 damage**, including hits on your own tower (friendly fire). The tower looks worse with each hit, and **the 5th hit brings it down**. The other team wins.
- Shots that land on the ground **knock craters into the terrain**. Enough of them can flatten the hill completely.

If the host ends the game early, **the least damaged tower wins**. With equal damage, the team with more correct answers wins; otherwise it's a draw. The podium shows the winning team and awards for **Top gunner** (most hits on the enemy tower), **Master builder** (most rebuilds) and **Most correct answers**. The results CSV lists each player's answers, shots, enemy hits, friendly hits and rebuilds.

## Robot Attack mode

Every player for themselves on a 12×12 checkerboard, with a giant robot looming behind it. Choose **Game mode → 🤖 Robot Attack** in the lobby. Everyone starts with **3 lives** on their own tile, spread out across the board. The game alternates between two phases:

- **Quiz.** Everyone answers questions on their phone at their own pace, and **each correct answer earns 1 move ⚡**. A red bar across the top of the projector drains as time runs out, and the music gets more intense. The first quiz phase lasts **30 seconds**, and each round is **2 seconds shorter**, down to 5 seconds. **5 seconds before the end**, the robot locks its targets: **red Xs cover 3/4 of the board, including every tile a player is standing on**. The robot announces it in a deep voice ("Targets acquired"); the **🗣 button** in the projector's top bar turns the voice off. Phones keep showing questions, so look up at the projector to plan an escape.
- **Move (7 seconds).** Phones show **arrow buttons** and a small map of the board with your position and the red Xs. Each step costs 1 move. Moves left over at the end are lost.

Then the robot's three back arms **fire lasers at every red X**. Anyone standing on one loses a life, and a player who loses all 3 is out. The robot then passes judgment: "Only metal endures" if anyone was knocked out, "The flesh is weak" if players were hit, or "zero one one zero one zero zero one" if everyone dodged. Players who are out keep answering questions for fun but can't move. **Only one player can stand on a tile**, so other players can block your way to a safe spot. The arrow toward an occupied tile or the edge of the board is greyed out. Players who are out leave the board and don't block anyone.

**The board shrinks.** Every 4th round (rounds 4, 8, 12, 16 and 20), the robot destroys the **outer ring of tiles**, taking the board from 12×12 down to 2×2. When the targets are locked, the doomed ring shows as **solid pulsing red** instead of red Xs. Anyone still standing on it when the lasers fire loses a life, as on a red X, and is moved to the closest free tile on what's left of the board. The red Xs always leave **1/4 of the remaining board safe**, so in a shrinking round the safe tiles are all inside the ring.

**The last player standing wins.** If the last players are all knocked out by the same blast, they share the win. A game with only one player runs until they're out. If the host ends the game early, players still in the game are ranked by lives left. The podium shows the standings and awards for **Most correct answers** and **Fancy footwork** (most moves). The results CSV lists each player's rank, the round they went out in, lives left, answers, moves and laser hits.

## Land Grab mode

A team game for **2 to 6 teams** on a shared board of hexagonal grass tiles. Choose **Game mode → 🚩 Land Grab** in the lobby, then pick the number of **Teams** and the **Time** (3, 5, 7 or 10 minutes). The board is 10×10 tiles for 2 teams, 12×12 for 3 or 4, and 14×14 for 5 or 6. Each team starts with one tile, its **starting point**, marked with an X in the team's color. The starting points are spread evenly around the middle of the board.

- **Quiz.** Everyone answers questions on their phone at their own pace. **Each correct answer earns 1 tile.** After every **3 answers**, right or wrong, the player goes to the land. A player with nothing to place sees "You have no tiles to place!" for 4 seconds and goes back to the questions.
- **Land.** The phone shows the board: drag to move around, **pinch (or use ＋ / −) to zoom**, tap a tile to pick it, then press **Claim**. There is no time limit, but the game clock keeps running.
  - A **grass tile costs 1**. A tile that belongs to **another team costs 2** (stealing).
  - The **ring of 12 tiles two steps from another team's starting point costs 2**, grass or not (stealing one there is still 2). They are marked in amber on the phone. The ring around your own starting point costs you the normal price.
  - Tiles **on or next to another team's starting point** can't be taken. They are darkened on the phone.
  - **Done** goes back to the questions early. Unused tiles are kept for the next visit, so a player can save up to steal.

**Surrounding.** When a team's tiles form a **complete ring**, everything inside turns that team's color: grass and other teams' tiles alike. The edge of the board doesn't count as part of a ring, so land in a corner or along a side can't be cut off, although a ring may run along the edge tiles.

**Knockouts.** A team whose **starting point is surrounded** is knocked out. All of its land goes to the team that surrounded it, and **its players join that team** and keep playing, with any tiles they had saved. The smallest ring that does it is the 12 tiles two steps away from the starting point, which cost 2 each, so it takes at least 24 tiles.

**The team with the most tiles when time runs out wins**; with equal tiles, the team with more correct answers. If only one team is left, the game ends right away. The podium shows the teams and awards for **Most correct answers**, **Top settler** (most tiles placed) and **Master surrounder** (most tiles won by closing rings). The results CSV lists each player under the team they started on, with their answers and the tiles they placed, stole and surrounded.

## Music

Every game mode has **built-in background music** on the projector (phones stay quiet). It's composed in code, so it adds nothing to the download and needs no licenses:

| Mode | Style | Reacts to the game |
|---|---|---|
| Classic | Upbeat game show | Questions get faster and more intense as the timer runs out |
| Tallest Tower | Retro arcade (chiptune) | Builds up as the game clock runs down |
| Submarine Squad | Deep-sea suspense | Speeds up and adds layers as the anglerfish closes in; a calmer theme while diving |
| Tower Fight | Medieval battle | Gets more intense as the towers take damage |
| Robot Attack | Machine-cult chant: a deep drone, organ and brass | Builds up as each quiz phase's timer runs out; urgent during movement |
| Land Grab | Bouncy dance-pop with a four-on-the-floor beat | Lively from the start; more layers and a little faster as the clock runs down |

The lobby plays the music of whichever game mode is selected. Use the **🎵 button and slider** in the projector's top bar to turn music off or change its volume. The 🔊 button still mutes everything.

### Using your own music

Put audio files (MP3, OGG, M4A, WAV, WebM or FLAC) in the **`data/music`** folder next to the program, named after the track they replace. A file replaces the built-in track the next time the host screen loads, with no restart needed. The admin page lists every track and shows which ones use your files.

| File name | Plays during |
|---|---|
| `classic-lobby` · `classic-question` · `classic-leaderboard` · `classic-results` | Classic: lobby, questions, answer reveal and leaderboard, final podium |
| `tower-lobby` · `tower-play` · `tower-results` | Tallest Tower |
| `submarine-lobby` · `submarine-chase` · `submarine-dive` · `submarine-results` | Submarine Squad |
| `fight-lobby` · `fight-play` · `fight-results` | Tower Fight |
| `robot-lobby` · `robot-quiz` · `robot-move` · `robot-results` | Robot Attack: lobby, quiz phase, movement and laser attack, final results |
| `land-lobby` · `land-play` · `land-results` | Land Grab |

For example, `data/music/submarine-chase.mp3`. Your files loop; they don't speed up with the game like the built-in music does. Only use music you're allowed to play: royalty-free or Creative Commons tracks (e.g. Pixabay Music, OpenGameArt, or incompetech with credit). Delete a file to go back to the built-in track.

## AI agents (MCP)

The admin page shows ready-to-copy commands that include the correct paths for your machine. Examples:

```sh
# stdio: works whether or not the Quizzer server is running
claude mcp add quizzer -- /path/to/quizzer-linux-x64 mcp

# HTTP: while Quizzer is running
claude mcp add --transport http quizzer http://localhost:8080/mcp
```

Claude Desktop or any other MCP client (JSON config):

```json
{ "mcpServers": { "quizzer": { "command": "C:\\Quizzer\\quizzer-windows-x64.exe", "args": ["mcp"] } } }
```

If the program isn't next to its `data` folder, add `"--data-dir", "<path to data>"` to the arguments.

| Tool | Purpose |
|---|---|
| `list_quizzes`, `get_quiz` | Browse quizzes; `get_quiz` returns question ids |
| `create_quiz` | Create a quiz with all its questions in one call |
| `update_quiz`, `delete_quiz` | Title, description, default shuffle settings; delete |
| `add_question`, `update_question`, `delete_question`, `reorder_questions` | Per-question edits |
| `set_question_image`, `remove_question_image` | Image from a local path, base64 data or an http(s) URL (PNG/JPEG/GIF/WebP, ≤ 5 MB) |

Edits made over MCP appear in the admin page right away. A game that is already running keeps the version it started with.

### Quiz format

```jsonc
{
  "title": "World Capitals",
  "description": "optional",
  "settings": { "shuffleQuestions": false, "shuffleAnswers": false },
  "questions": [
    { "type": "multiple_choice", "text": "Capital of Australia?",
      "options": ["Sydney", "Canberra", "Melbourne", "Perth"],   // 2–4
      "correct": [1],                                             // 0-based; several = any counts
      "timeLimitSec": 20 },                                       // 5–120, default 20
    { "type": "true_false", "text": "Paris is in France", "correct": [0] }  // [0]=True, [1]=False
  ]
}
```

## Development

Requires [Bun](https://bun.sh). This repo pins it with [mise](https://mise.jdx.dev) (`mise install`).

```sh
bun install
bun run dev        # hot-reloading server on :8080 using ./dev-data
bun test           # unit + end-to-end tests (game engine, REST, WebSockets, MCP)
bun run typecheck
```

Layout:

```
src/shared/         quiz schema (zod) + WebSocket protocol types, shared by server and browser
src/server/         Bun.serve HTTP/WebSocket server, game engine, quiz store, MCP server
src/client/admin/   quiz library + editor (Preact)
src/client/host/    projector screen (Preact)
src/client/player/  phone screen (Preact)
tests/              bun test suites
```

The robot's voice lines are pre-recorded MP3s in `src/client/shared/voice/`, generated with espeak-ng and ffmpeg. They're committed, so building doesn't need either tool. To add or change a line, edit `src/shared/voice-lines.ts` and run `bun scripts/voice.ts` (needs `espeak-ng` and `ffmpeg`).

The Tallest Tower building blocks are images in `src/client/shared/tower/`, made from the generated facade tiles in `scripts/tower-blocks/`. They're committed too. To change them, replace a source PNG (the prompts are in the script) and run `python3 scripts/tower-blocks.py` (needs Pillow and numpy).

The Tower Fight castle is made the same way: `python3 scripts/fight-castle.py` turns the intact tower and its four damage stages in `scripts/fight-castle/` into the images in `src/client/shared/fight/`. If the tower's proportions change, copy the numbers the script prints into `CastleTower` in `src/client/shared/fight-art.tsx`.

The Land Grab tiles in `src/client/shared/land/` come from two generated textures in `scripts/land-tiles/` (grass, and grey paving that takes each team's color): `python3 scripts/land-tiles.py`.

The server is authoritative. It runs the game state machine and timers, scores answers by server time, and pushes a complete view snapshot to each screen after every change, so a reconnecting screen always gets the full picture.

### Building

```sh
bun run build            # dist/quizzer-linux-x64 and dist/quizzer-windows-x64.exe
bun run build linux      # only one target
```

Both executables are cross-compiled from any OS and embed the web UI. Nothing else needs to be installed on the host.

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
| Podium | Top 3 plus the rest, with **Download results (CSV)**, **Play again** and **Done**. |

- **Pacing**: *Manual* waits for you to press **Next** (or Space/→). *Auto-advance* moves on after 5 seconds on the reveal and leaderboard. You can switch pacing mid-game from the top bar.
- **Scoring**: a correct answer is worth 1000 points if given instantly, falling to 500 at the time limit. Wrong or missing answers score 0.
- **Multiple correct answers**: players still tap one option, and any correct option scores.
- **Shuffling** is chosen in the lobby for each game; the quiz's shuffle settings in the editor are the defaults. Shuffling answer positions moves each answer to a random tile (and color), so the correct answer isn't always in the same place. The order is fixed when you press Start and is the same on the projector and every phone. True/False keeps True before False.
- **Streaks**: after 4 correct answers in a row, a player gets 🔥x4 (x5, x6, …) next to their name on the leaderboard, the podium and their phone. A wrong or missed answer resets it.
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

1. At 1/3 and 2/3 of the game, every tower gets a 🥚 **monster egg** placed **4 levels above its highest complete floor** (a tower with 10 full floors gets its egg on level 14), in a random column where that spot is still empty.
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
- An instructor moves on when 70% of their group finds the symbol (or after 20 seconds). Each instructor has 5 symbols.
- Every correct tap takes the sub 2 m deeper. Wrong taps lock the player out for a second.
- Players who join mid-dive wait for the next level.

Each level is worth 100 m. **Deeper levels have a faster fish.** The podium shows the final depth and awards for **Top booster**, **Sharpest eyes** (most symbols found) and **Most correct answers**. The results CSV lists each player's answers, boosts, dive taps and instructor rounds.

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

The server is authoritative. It runs the game state machine and timers, scores answers by server time, and pushes a complete view snapshot to each screen after every change, so a reconnecting screen always gets the full picture.

### Building

```sh
bun run build            # dist/quizzer-linux-x64 and dist/quizzer-windows-x64.exe
bun run build linux      # only one target
```

Both executables are cross-compiled from any OS and embed the web UI. Nothing else needs to be installed on the host.

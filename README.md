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
- **Linux** with a firewall needs the port opened, e.g. `sudo ufw allow 8080/tcp`.
- Some guest/school Wi-Fi networks block devices from talking to each other ("client isolation"). If phones can't load the page, use a network without isolation, or a phone hotspot.

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
| Lobby | Big QR code and URL; names appear as players join. Click a name to remove that player. Pick the pacing, then press **Start**. |
| Question | Question text first, then the answer tiles, a countdown and an answered counter. The question ends when time runs out **or** everyone has answered. Press **S** to skip. |
| Reveal | The correct answer(s) are highlighted and a chart shows how many picked each option. Each phone shows **Correct/Wrong** with the correct answer highlighted. |
| Leaderboard | Top 5, with points gained on the last question. |
| Podium | Top 3 plus the rest, with **Download results (CSV)**, **Play again** and **Done**. |

- **Pacing**: *Manual* waits for you to press **Next** (or Space/→). *Auto-advance* moves on after 5 seconds on the reveal and leaderboard. You can switch pacing mid-game from the top bar.
- **Scoring**: a correct answer is worth 1000 points if given instantly, falling to 500 at the time limit. Wrong or missing answers score 0.
- **Multiple correct answers**: players still tap one option, and any correct option scores.
- **Shuffling** happens once per game, so the projector and every phone show the same order. True/False order is never shuffled.
- **Reconnecting**: if a phone locks, refreshes or drops Wi-Fi, it rejoins as the same player with the same score. Players can also join after the game has started.
- Only one game runs at a time. The admin, host controls and API only work from the host computer itself (`localhost`). Phones can only reach the player page.

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
| `update_quiz`, `delete_quiz` | Title, description, shuffle settings; delete |
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

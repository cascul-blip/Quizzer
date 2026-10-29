# Quizzer

A self-hosted, Kahoot-style quiz game for classrooms and events on a local network.

- **One program** runs on the host computer (Linux or Windows) and serves everything.
- The **projector screen** shows the join QR code and URL, the questions and answer tiles, the answer reveal, a leaderboard, and a podium.
- **Players join from their phone's browser** by scanning the QR code or typing the URL. They don't install anything, and no domain name or internet connection is needed.
- Quizzes support **multiple choice (2–4 options)**, **true/false** and **pin on picture** questions. You can add images, allow several correct answers, shuffle questions and answers, and export results to CSV.
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

- **Pacing**: *Manual* waits for you to press **Next** (or Space/→). *Auto-advance* moves on after 5 seconds on the reveal and leaderboard. You can switch pacing mid-game from the top bar. **Racer** is paced the same way.
- **Scoring**: a correct answer is worth 1000 points if given instantly, falling to 500 at the time limit. Wrong or missing answers score 0.
- **Multiple correct answers**: players still tap one option, and any correct option scores.
- **Pin on picture**: the question has a picture with 2–20 labelled spots, such as the numbered lines of a labelled diagram. Players drag a pin onto the picture. Dropped near a label, it snaps onto that spot, and they press **Submit** to lock it in. One spot is the answer and the others are distractors. In the editor, click the picture to add a spot, drag a spot to move it, click it to make it the answer, and rename it in the list (e.g. "56"). To ask about every spot of a diagram, make one question and duplicate it (⧉) for each location. The reveal shows the right spot and how many players picked each one. Pin questions work in every game mode.
- **Shuffling** is chosen in the lobby for each game; the quiz's shuffle settings in the editor are the defaults. Shuffling answer positions moves each answer to a random tile (and color), so the correct answer isn't always in the same place. The order is fixed when you press Start and is the same on the projector and every phone. True/False keeps True before False.
- **Streaks**: after 4 correct answers in a row, a player gets 🔥x4 (x5, x6, …) next to their name on the leaderboard, the podium and their phone. A wrong or missed answer resets it.
- **Show errors**: on the final screen of every game mode, this button swaps the results for a table of the **10 questions with the most wrong answers**, each with its correct answer, so you can go over them with the class. Press **Show results** to switch back. Classic and Racer count wrong answers only, not questions a player let time out; in the other modes a question can come up more than once, and every wrong answer counts.
- **Protect from abuse**: a lobby checkbox, on by default, for **Tallest Tower**, **Submarine Squad**, **Tower Fight**, **Robot Attack**, **Cup of Death**, **Dragon's Hoard** and **Kingdom Siege**. It slows down players who tap random answers instead of reading. The ✗ screen normally shows for 1 second; after **2 wrong answers in a row** it stays **3 seconds longer**, and after **3 or more in a row**, **4 seconds longer**, with a countdown on the phone. A correct answer resets it. Reloading the page doesn't skip the wait.
- **Results file**: a CSV of every finished game is saved in `data/results/`. The latest one is also at `http://localhost:8080/api/results/latest.csv` on the host computer.
- **Reconnecting**: if a phone locks, refreshes or drops Wi-Fi, it rejoins as the same player with the same score. Players can also join after the game has started.
- Only one game runs at a time. The admin, host controls and API only work from the host computer itself (`localhost`). Phones can only reach the player page.

## Tallest Tower mode

A team game modeled on Kahoot's Tallest Tower. Choose **Game mode → 🏗 Tallest Tower** in the lobby, then pick:

- **Teams** (1–6). Players are placed automatically in join order; the lobby shows the teams live, and the host can drag a name to another team there. Late joiners go to the smallest team.
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

A two-team battle: **Red** and **Blue** each defend a castle tower, with a hill between them. Choose **Game mode → 🏰 Tower Fight** in the lobby, and pick a **Hill** height: Low, Medium, High or 🎲 Random (the default). Players are split into the two teams by join order, and the host can drag a name to the other team in the lobby. Late joiners go to the smaller team. There's no timer: **the game runs until a tower falls** or the host clicks **End game**.

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

- **Quiz.** Everyone answers questions on their phone at their own pace, and **each correct answer earns 1 move ⚡**. A red bar across the top of the projector drains as time runs out, and the music gets more intense. The first quiz phase lasts **30 seconds**, and each round is **2 seconds shorter**, down to 7 seconds. **5 seconds before the end**, the robot locks its targets: **red Xs cover 3/4 of the board, including every tile a player is standing on** (a red gear target on the projector). The robot announces it in a deep voice ("Targets acquired"); the **🗣 button** in the projector's top bar turns the voice off. Phones keep showing questions, so look up at the projector to plan an escape.
- **Move (7 seconds).** Phones show **arrow buttons** and a small map of the board with your position and the red Xs. Each step costs 1 move. Moves left over at the end are lost.

Then the robot's three back arms **fire lasers at every red X**. Anyone standing on one loses a life, and a player who loses all 3 is out. The robot then passes judgment: "Only metal endures" if anyone was knocked out, "The flesh is weak" if players were hit, or "zero one one zero one zero zero one" if everyone dodged. Players who are out keep answering questions for fun but can't move. **Only one player can stand on a tile**, so other players can block your way to a safe spot. The arrow toward an occupied tile or the edge of the board is greyed out. Players who are out leave the board and don't block anyone.

**The board shrinks.** Every 4th round (rounds 4, 8, 12, 16 and 20), the robot destroys the **outer ring of tiles**, taking the board from 12×12 down to 2×2. When the targets are locked, the doomed ring shows as **solid pulsing red** instead of red Xs. Anyone still standing on it when the lasers fire loses a life, as on a red X, and is moved to the closest free tile on what's left of the board. The red Xs always leave **1/4 of the remaining board safe**, so in a shrinking round the safe tiles are all inside the ring.

**The last player standing wins.** If the last players are all knocked out by the same blast, they share the win. A game with only one player runs until they're out. If the host ends the game early, players still in the game are ranked by lives left. The podium shows the standings and awards for **Most correct answers** and **Fancy footwork** (most moves). The results CSV lists each player's rank, the round they went out in, lives left, answers, moves and laser hits.

## Land Grab mode

A team game for **2 to 6 teams** on a shared board of hexagonal grass tiles. Choose **Game mode → 🚩 Land Grab** in the lobby, then pick the number of **Teams** and the **Time** (3, 5, 7 or 10 minutes). Players are placed in join order, and the host can drag a name to another team in the lobby. The board is 10×10 tiles for 2 teams, 12×12 for 3 or 4, and 14×14 for 5 or 6. Each team starts with one tile, its **starting point**, marked with an X in the team's color. The starting points are spread evenly around the middle of the board.

- **Quiz.** Everyone answers questions on their phone at their own pace. **Each correct answer earns 1 tile.** After every **3 answers**, right or wrong, the player goes to the land. A player with nothing to place sees "You have no tiles to place!" for 4 seconds and goes back to the questions.
- **Land.** The phone shows the board: drag to move around, **pinch (or use ＋ / −) to zoom**, tap a tile to pick it, then press **Claim**. There is no time limit, but the game clock keeps running.
  - A **grass tile costs 1**. A tile that belongs to **another team costs 2** (stealing).
  - The **ring of 12 tiles two steps from another team's starting point costs 2**, grass or not (stealing one there is still 2). They are marked in amber on the phone. The ring around your own starting point costs you the normal price.
  - Tiles **on or next to another team's starting point** can't be taken. They are darkened on the phone.
  - **Done** goes back to the questions early. Unused tiles are kept for the next visit, so a player can save up to steal.

**Surrounding.** When a team's tiles form a **complete ring**, everything inside turns that team's color: grass and other teams' tiles alike. The edge of the board doesn't count as part of a ring, so land in a corner or along a side can't be cut off, although a ring may run along the edge tiles.

**Knockouts.** A team whose **starting point is surrounded** is knocked out. All of its land goes to the team that surrounded it, and **its players join that team** and keep playing, with any tiles they had saved. The smallest ring that does it is the 12 tiles two steps away from the starting point, which cost 2 each, so it takes at least 24 tiles.

**The team with the most tiles when time runs out wins**; with equal tiles, the team with more correct answers. If only one team is left, the game ends right away. The podium shows the teams and awards for **Most correct answers**, **Top settler** (most tiles placed) and **Master surrounder** (most tiles won by closing rings). The results CSV lists each player under the team they started on, with their answers and the tiles they placed, stole and surrounded.

## Racer mode

A cooperative mode: the whole class shares one car, a **Porsche 911**, and tries to drive it as far as possible. Choose **Game mode → 🏎 Racer** in the lobby. Questions are asked one at a time, as in Classic, and everyone answers at once. The car starts at **30 mph**. Every question is asked once, **the game ends after the last question**, and the result is the **distance driven**.

How a turn goes:

1. A random player becomes the **driver**. Everyone drives once before anyone drives again.
2. The question appears on the projector and the phones, without its answers. The driver's phone shows a **lever** with three levels: how confident are they that the class will get this one right? They drag the lever to a level and **hold the Go! button** to lock it in. They have **20 seconds**; after that (or if the driver disconnects) the lever is locked where it is. It starts on "Not confident".
3. The answers appear and **everyone answers**, the driver included. The question ends when time runs out or everyone has answered. A player who doesn't answer counts as wrong.
4. The reveal shows the correct answer and what happened to the car.

| Lever | Players who answered right | Result |
|---|---|---|
| **Not confident** | At least 1/4 | No change |
| | Fewer | 1 fail point |
| **Confident** | At least 2/3 | **+20 mph** |
| | At least 1/4 | 1 fail point |
| | Fewer | 2 fail points |
| **Extremely confident** | Everyone | **+40 mph** |
| | At least 2/3 | 1 fail point |
| | At least 1/2 | 2 fail points |
| | Fewer | 3 fail points |

**Each fail point halves the speed**: 60 mph with one fail point becomes 30 mph, with two, 15 mph. A car that drops **under 20 mph crashes**, and its speed goes to 0. A crashed car has no driver and no lever: the question shows for 3 seconds, then its answers. Once **at least half the class** answers a question right, the car is repaired and back on the road at **30 mph**.

Each turn counts as **10 minutes of driving** at the speed the car has after that turn, so 60 mph adds 10 miles and a crashed car adds nothing.

The projector shows the car driving past a city skyline and palm trees, which go by faster as the car speeds up, with the speed and the miles driven. Pacing works as in Classic: *Manual* waits for **Next** (or Space/→) after each reveal, and *Auto-advance* moves on after 5 seconds. Press **S** to skip a countdown: it locks the lever where it is, or closes the question.

The podium shows the distance, the top speed, the number of crashes and awards for **Most correct answers** and **Best driver** (most mph gained while driving), with **Show errors**, **Play again** and **Done**. The results CSV has one row per player: correct, wrong, accuracy, turns driven, mph gained and fail points as driver, plus the class's distance, top speed and crashes.

## Cup of Death mode

Every player for themselves around a round wooden table in a western saloon. Choose **Game mode → ☠️ Cup of Death** in the lobby. Everyone starts with **3 cups** of bubbling green liquid in front of them (the host can choose **1 to 6** with the **Cups** setting in the lobby). Each round has two parts:

- **Dice and quiz.** Every player still alive **rolls a die (1–6)** on their phone and on the projector. That's how many questions they must **answer correctly before the red timer bar runs out**. A wrong answer just moves on to the next question. A player who reaches their number is **SAFE** and waits for the others. The projector shows each player's die and progress (e.g. 2/5) above their head. The first quiz lasts **30 seconds**, and each round is **2 seconds shorter**, down to 10 seconds. The round ends early once everyone is safe.
- **Drink.** Everyone who fell short must drink: their phone shows their remaining cups, and they have **10 seconds** to tap one; time runs out (or a player is disconnected) and a cup is picked for them. **One of each player's cups is poisoned.** The projector then reveals the drinkers one at a time: they lift the cup, gulp, and either survive or keel over with a green skull.

**Cups run out.** A cup that turns out to be safe is gone, so the odds get worse with every miss: with 3 cups it's 1 in 3, then 1 in 2, and a player down to **their last cup** drinks it automatically, and it's always poisoned. A poisoned player is out: their avatar leaves the table, and they can **keep answering questions to learn**.

**The last player standing wins.** If everyone left is poisoned in the same round, they share the win. A game with only one player runs until they're poisoned. If the host ends the game early, everyone still alive shares the win. The podium shows the standings and awards for **Most correct answers**, **Luckiest drinker** (most drinks survived), **Never thirsty** (most rounds safe without drinking) and **Unluckiest** (poisoned by their very first cup, earliest). The results CSV lists each player's rank, the round they were poisoned in, cups left, answers, drinks survived and rounds safe.

## Dragon's Hoard mode

A two-act game that starts cooperative and turns competitive. Choose **Game mode → 🐉 Dragon's Hoard** in the lobby. Settings: **Teams** (2–6, default 2, but never more teams than players: with 3 players and 3 teams everyone is their own team), **Dragon toughness** (Easy, Normal, Hard), **Battle time** (3, 5 or 7 minutes), **Fire breath** (every 30, 45 or 60 seconds) and **Scramble time** (2–5 minutes). The teams show in the lobby as in Land Grab, and the host can drag a name to another team. Teams only matter in Act 2. With a single player there is one team.

**Act 1: Slay the Dragon (co-op).** The projector shows a dragon curled around a mountain of gold, with one health bar for the whole class. Everyone answers at their own pace, and **every correct answer is 1 hit**. The dragon has **players × 6 / 10 / 15** health (Easy / Normal / Hard), at least 30; a player who joins during the battle adds their hits (the bar keeps its percentage). Under 66% and under 33% health the dragon roars and the **fire breath comes 10 seconds sooner** (never more often than every 20 seconds).

- **Fire breath.** A 3-second warning, then everyone's own question is paused and the whole class gets the **Shield of Faith** question (Ephesians 6:16): the question the class has gotten wrong most so far (never the same one twice in a row; a random one if nobody has missed anything yet). It has the question's own time limit, between 10 and 20 seconds, and ends early once everyone has answered. If **at least 2/3 of the connected players** get it right, the **Shield of Faith holds** and the dragon takes 5% of its health as bonus damage; otherwise the **fire gets through** and it heals 10%. The answer shows on the projector and every phone for 4 seconds, then the questions go on where they left off. A player who joins during a fire breath waits until it's over.
- **The end of the battle.** The dragon is **slain** when its health reaches 0. If the battle time runs out, it **escapes with half its hoard**: Act 2 still happens, but Coins and Big pile chests pay half.

**Act 2: The Hoard Scramble (teams).** After an 8-second transition (each phone shows "You're on Team ___!"), everyone keeps answering, and **every correct answer opens 1 of 3 chests** (10 seconds to tap one, or one opens by itself). Gold belongs to the team.

| Chest | Chance | What it does |
|---|---|---|
| Coins | 35% | +25 gold (13 if the dragon escaped) |
| Big pile | 20% | +60 gold (30 if the dragon escaped) |
| Lucky charm | 8% | The player's next 3 coin chests pay double |
| Grab 10% / Grab 25% | 10% / 4% | Take that share of another team's gold |
| Dragon's last breath | 10% | The team loses 10% of its gold into the Jackpot |
| Dragon scale | 4% | Blocks the next grab against the team |
| Bats | 8% | Nothing |
| Jackpot | 1% | The team wins the whole Jackpot |

- **Grabs.** The phone lists the other teams with their gold; the player has 8 seconds, or the richest team is picked. A team with 0 gold can't be picked, and a team can only be grabbed from once every 5 seconds. A dragon scale blocks the grab ("Blocked by a dragon scale!"). With nobody to grab from (a single team, or every other team at 0), the chest pays as Coins.
- **The Jackpot** starts at 100 gold + 10 per player and grows with every trap. It can't come up in the first 60 seconds of the scramble, or while it is empty, and starts again at 0 once it's won.

**The team with the most gold when the scramble ends wins**; with equal gold, the team with more correct answers in Act 2. A player who joins during the scramble goes to the smallest team. If the host ends the game during Act 1, the dragon counts as escaped. The podium shows the team gold, the Act 1 result ("Dragon slain in 3:42!" or "The dragon escaped!") and awards for **Dragon slayer** (most hits), **Faithful Defender** (most Shield of Faith questions right), **Master thief** (most gold grabbed) and **Most correct answers**. The results CSV has one row per player: team, team rank and gold, correct, wrong, accuracy (Shield of Faith questions included), dragon hits, Shield of Faith right and wrong, chests opened, gold found, gold grabbed, the team's gold lost to grabs, gold lost to traps and jackpots won, plus the class's dragon result, time to slay and Shield of Faith held and failed.

The painted art comes from `scripts/dragon-art.py` (the cave and the dragon) and `scripts/dragon-hoard-art.py` (everything else); the fire breath is drawn in code (`src/client/shared/dragon-art.tsx`).

## Bomb Squad mode

A co-op defusal quiz for a small class. Choose **Game mode → 💣 Bomb Squad** in the lobby. **Together** (the default) is one bomb and one timer for the class, with each squad clearing its own modules. **Race** gives every squad its own bomb and timer; it needs at least 2 squads. Other settings: **Squads** (1–6; until you pick a number, the fewest that keep every squad at 6 or under — a class of 3 or 6 stays one squad), **Modules** per squad (2, 3 or 4, default 3), **Wires** per module (2, 3 or 4, default 3), **Timer** (3, 5, 7 or 10 minutes, default 5) and **Wrong cut** (−10, −15, −20, −30 or −40 seconds, default −15). There are no strikes, and Protect from abuse does not apply. Squads show in the lobby and a name can be dragged to another squad. A squad of 1 plays like a timed quiz and holds every wire.

Everyone sees the question. The answer choices are split across the squad's phones as coloured wires, and only the phone holding a wire can cut it: tap it, then hold **Cut** for 1.5 seconds (letting go cancels). The other phones see who is cutting. A right wire sparks, lights one more green lamp, and the right answer shows for 2 seconds before the next question. A wrong wire buzzes, flashes red, comes off the timer, and the same question continues. A module chimes when all of its wires are cleared. True/False is only True and False. A typed answer uses the phone's text box (the keypad painted on the bomb is decoration). A picture question shows the photo, and each phone holds its own spots. With more players than choices, the extras are decoys. Together, a squad that finishes waits and cheers the others on; the class defuses the bomb when every squad is done. In a race, the first squad to finish wins and the others keep going until they finish or explode. Rank is finish time, then modules cleared, then fewest wrong cuts.

Running out of time is an explosion: a white flash, a fireball, smoke, debris and a screen shake, with the words "BOOM! The bomb exploded." The host's End game button skips that and opens the podium. The podium awards **Steady Hands** (most right cuts), **Careful Cutter** (fewest wrong cuts, with at least 2 right cuts) and **Team Player** (most right wires the squad cut on the first try). The results CSV has one row per player.

The painted art comes from `scripts/bomb-art.py` (sources in `scripts/bomb-art/`); the clock digits, the flash and the shake are drawn in code (`src/client/shared/bomb-art.tsx`). Phones use the smaller copies and never show the workbench.

## Kingdom Siege mode

A co-op lane-defense game in the style of Plants vs. Zombies. Choose **Game mode → 🛡️ Kingdom Siege** in the lobby. Settings: **Waves** (5, 10 or ♾ Endless, default 5) and Protect from abuse. There are no teams: the whole class defends one castle wall against waves of goblins, wolves, trolls and giants marching across a tabletop diorama.

- **The board.** 5 lanes of 8 squares, whatever the class size. The castle wall is on the left with **10 hearts** that never heal. Defenders go on squares 1–7; square 8 is where monsters come on, and a small red arrow shows at a lane's right edge 2 seconds before one does. A lane flashes red when a monster is within 2 squares of the wall.
- **Gold.** Every player has **their own purse**: it starts at 50 gold (a late joiner's too) and **every correct answer adds 25** to it. Wrong answers add nothing. Players can only spend their own gold, but on any lane, so everyone has to answer to build. The projector shows everyone's unspent gold added up. A kicked player's unspent gold is lost; their defenders stay.
- **Building on the phone.** The question is always the phone's main screen. **Build** at the bottom lights up once your purse can afford a defender. It opens the lane map (live, with the defenders, red monster dots and danger lanes). Tap an empty square to place the selected defender (the last one you placed, or the cheapest affordable one). Tap a placed defender to see its upgrade cost, and tap it again to buy. The map closes after 8 seconds without a tap.

| Defender | Place / Lv 2 / Lv 3 | What it does |
|---|---|---|
| 🏹 Archer | 50 / 75 / 125 | 4 health. Shoots the nearest monster ahead in its lane, 1 damage every 1.5 s; every 1 s at Lv 2; 2 arrows per shot at Lv 3 |
| ⚔️ Knight | 75 / 100 / 150 | 10 health (16 at Lv 2). Strikes the monster in front of it, 2 damage a second (3 at Lv 3) |
| 🧱 Stone wall | 50 / 50 / 100 | 15 health (25 at Lv 2). Doesn't attack; at Lv 3 its spikes do 1 damage to a monster every time it hits the wall |

An upgrade adds the extra health to what the defender has left, so upgrading a hurt defender partly repairs it. Defenders can't be sold or moved, and nothing heals.

| Monster | Health | Speed | Special | Hearts |
|---|---|---|---|---|
| Goblin | 3 | 1 square / 2 s | Comes in groups of 2–3 | 1 |
| Wolf | 3 | 1 square / 1 s | Leaps the first stone wall in its way | 1 |
| Troll | 12 | 1 square / 3.5 s | Triple damage to stone walls; armored, so arrows do half damage | 2 |
| Giant | 40 + 5 per player | 1 square / 4 s | Waits 3 s with a horn, then stomps for 6 (and 2 to the squares above and below) | 5 |

- **Waves.** After the countdown there's a **15-second build break** (questions already running), then wave 1 (goblins only). Wolves join in wave 2, trolls in wave 3, and waves 5 and 10 end with a giant. Each wave's monster budget is (6 + 3 × (wave − 1)) × class size factor (0.6 + 0.1 per connected player, between 0.7 and 1.4) × difficulty. Between waves there's a 10-second "Wave N incoming" break.
- **Later waves hit harder.** The health in the table is for wave 1: every monster gets **10% more health per wave** after that (a wave 6 goblin has 5, a wave 10 troll 23). A wave's monsters come in over 30 seconds in wave 1, **1 second less each wave** (down to 20 seconds), and from **wave 5** a lane can have 3 monsters coming onto it at once instead of 2.
- **Adaptive difficulty.** The class's accuracy during a wave (and its break) sets the next wave's difficulty: 70% at 40% accuracy or below, 130% at 90% or above, moving at most 20 points per wave. Students don't see it; the results CSV logs it.
- **Waves match a strong board.** When a wave starts, the board is valued in gold (each defender's place and upgrade costs, times the share of its health left, plus everyone's unspent gold). Par is 60 gold per point of the wave's budget. A board worth r × par calls for a **strength boost** of r², which climbs at most 0.35 per wave, only after a wave that cost no hearts, and tops out at 4× (it can drop any amount). The boost multiplies the monster budget by boost^0.3 and every monster's health except the giant's by the rest (boost^0.7): mostly health, because a lane only lets so many monsters on at once. The giant keeps its health but gets faster instead: it walks and swings 1× as fast with no boost, up to 2× at the top boost, in proportion between. An ordinary class stays at or near par and doesn't notice it; a fast, accurate class that builds a fortress keeps meeting waves that dent it. The results CSV logs the defense gold, boost and health multiplier per wave.
- **Endless** never stops: +4 budget per wave after wave 10, a giant every 5th wave and 2 giants from wave 15 on. The podium shows the waves survived, the average difficulty and the class's best Endless run on this quiz (saved in `data/siege-records.json`), with "New record!" when it's beaten.
- **Endings.** "The kingdom stands!" (banners, bells and confetti) if the wall has hearts left after the last wave; "The castle has fallen" (it crumbles in a cloud of dust) at 0 hearts. End game opens the podium straight away ("Ended on wave 4 with 6 hearts left.").

Awards: **Top Archer Captain** (most monsters defeated by archers the player placed), **Master Mason** (most walls placed plus wall upgrades) and **Most correct answers**. The results CSV has one row per player (kicked players included): correct, wrong, accuracy, gold earned and spent, archers, knights and walls placed, upgrades, monsters defeated, plus the class result, waves survived, hearts left and the Endless record. Below it is a wave log: wave, difficulty, defense gold, strength boost, monster budget, monster health multiplier, monsters sent, class accuracy and hearts lost. Late joiners start answering right away; kicked players' defenders stay on the board.

The painted art comes from `scripts/siege-art.py` (sources in `scripts/siege-art/`, positions in `src/client/shared/siege/manifest.md`); the motion, warning arrows, lane flashes, glow, dust and confetti are drawn in code (`src/client/shared/siege-art.tsx`). Phones only get the small defender icons, the coin and the heart; the lane map is drawn in code.

## Music

Every game mode has **built-in background music** on the projector (phones stay quiet). It's composed in code and played on **recordings of real instruments**: grand piano, string sections, brass, flute, harp, organ, timpani and a drum kit, about 4 MB built into the program. The recordings are public domain (CC0) or free to use with credit (see `src/client/shared/music/samples/CREDITS.md`). Tallest Tower and Racer keep their chiptune and 80s-synth sound on purpose. Add `?music=synth` to the host page's address to hear every track on the older synthesized instruments:

| Mode | Style | Reacts to the game |
|---|---|---|
| Classic | Upbeat game show | Questions get faster and more intense as the timer runs out |
| Tallest Tower | Retro arcade (chiptune) | Builds up as the game clock runs down |
| Submarine Squad | Deep-sea suspense | Speeds up and adds layers as the anglerfish closes in; a calmer theme while diving |
| Tower Fight | Medieval battle | Gets more intense as the towers take damage |
| Robot Attack | Romantic orchestral: Beethoven and Grieg arranged for orchestra (*In the Hall of the Mountain King* during the quiz) | Speeds up and adds instruments as each quiz phase's timer runs out; Beethoven's Fifth during movement |
| Land Grab | Calm ambient piano | Speeds up and adds an orchestra as a team gets close to closing a ring; calms down again if the ring is broken |
| Racer | Sunny late-80s arcade-racing chiptune | Tempo and layers rise with the car's speed; slow and sparse when crashed |
| Cup of Death | Original spaghetti-western themes: whistle, twangy guitar, galloping hooves; a honky-tonk saloon piano in the lobby | The gallop speeds up and strings, brass and a church bell join as the quiz timer runs out; a heartbeat and a tolling bell while the cups are picked and drunk |
| Dragon's Hoard | A quiet cave with deep strings and the dragon breathing; a heroic battle theme with brass, drums and choir; a playful plucked scramble with coin sounds | The battle gets more intense as the dragon weakens and the battle clock runs out; a rising rumble, then war drums, during fire breath; the scramble speeds up as its clock runs out |
| Bomb Squad | Spy-jazz: bass, brushes and a vibraphone | The defuse theme adds a tick and more layers, and speeds up, as the bomb runs down (extra urgency under 30 seconds). A fanfare if the bomb is defused; a low boom if it explodes |
| Kingdom Siege | A pastoral lobby with recorder, lute and tabor; a marching battle theme with snare, recorders and brass | The march adds layers as monsters fill the board and as hearts are lost; low brass and timpani for a giant; drums and a held chord during breaks. Church bells and a fanfare if the kingdom stands; a low brass lament if the castle falls |

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
| `racer-lobby` · `racer-drive` · `racer-results` | Racer |
| `cup-lobby` · `cup-quiz` · `cup-drink` · `cup-results` | Cup of Death: lobby, dice and quiz, picking and drinking, final results |
| `dragon-lobby` · `dragon-battle` · `dragon-fire` · `dragon-scramble` · `dragon-results` | Dragon's Hoard: lobby, battle, fire breath (warning and Shield of Faith question), hoard scramble, final podium |
| `bomb-lobby` · `bomb-defuse` · `bomb-results` | Bomb Squad: lobby, defusing, the defused or exploded ending and the podium |
| `siege-lobby` · `siege-battle` · `siege-results` | Kingdom Siege: lobby; countdown, build breaks and waves; the kingdom stands or the castle falls, and the podium |

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
| `set_question_image`, `remove_question_image` | Image from a local path, base64 data or an http(s) URL (PNG/JPEG/GIF/WebP, ≤ 5 MB). Large images are stored scaled to 1280 px as WebP (lossless for PNG) so phones load them quickly |

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
    { "type": "true_false", "text": "Paris is in France", "correct": [0] },  // [0]=True, [1]=False
    { "type": "pin", "text": "Where is the deltoid?", "image": "media/ab12cd.png",
      "spots": [{ "x": 0.42, "y": 0.18 }, { "x": 0.35, "y": 0.3 }],  // 2–20, fractions of the image (0,0 = top-left)
      "options": ["56", "57"],                                      // spot labels; omit for A, B, C…
      "correct": [0] }                                              // exactly one spot
  ]
}
```

## Development

Requires [Bun](https://bun.sh). This repo pins it with [mise](https://mise.jdx.dev) (`mise install`).

```sh
bun install
bun run dev        # hot-reloading server on :8080 using ./dev-data (--dev)
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

The robot's voice lines are pre-recorded MP3s in `src/client/shared/voice/`, the Sovereign takes of the four lines in `src/shared/voice-lines.ts`. They're committed, so building doesn't need espeak or ffmpeg.

The Tallest Tower building blocks are images in `src/client/shared/tower/`, made from the generated facade tiles in `scripts/tower-blocks/`. They're committed too. To change them, replace a source PNG (the prompts are in the script) and run `python3 scripts/tower-blocks.py` (needs Pillow and numpy).

The Tower Fight art in `src/client/shared/fight/` (the painterly castle stages and their cloth masks, the catapult, sky, ground and effects) is made by its own art build outside this repo; `python3 scripts/phone-art.py` makes the half-size phone copies. If the castle's proportions change, update `CASTLE_ASPECT` and `CASTLE_FLAG_PART` above `CastleTower` in `src/client/shared/fight-art.tsx`.

The Land Grab art in `src/client/shared/land/` (the storybook parchment maps, tiles, shields, cards and plinths) is made by its own art build outside this repo; `src/client/shared/land/manifest.md` says where each piece goes and how it is tinted.

The Racer pixel art in `src/client/shared/racer/` (the car, the skyline and the palm tree) is made from the generated images in `scripts/racer-art/` by `python3 scripts/racer-art.py` (needs Pillow and numpy).

The server is authoritative. It runs the game state machine and timers, scores answers by server time, and pushes a complete view snapshot to each screen after every change, so a reconnecting screen always gets the full picture.

### Building

```sh
bun run build            # dist/quizzer-linux-x64 and dist/quizzer-windows-x64.exe
bun run build linux      # only one target
```

Both executables are cross-compiled from any OS and embed the web UI. Nothing else needs to be installed on the host. A rebuild only replaces the executables, so a `dist/data` folder next to them is kept.

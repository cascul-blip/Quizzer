# Quizzer

Players join a host's quiz from their phones and play together in the selected game mode.

## Language

**Game mode**:
A way of playing a quiz that the host selects in the lobby, such as Classic, Racer or Gift Grab. Each game mode has one name; a seasonal theme may decorate how it is shown.
_Avoid_: game type, variant

**Mode settings**:
The options the host chooses in the lobby for one game mode, such as Gift Grab's minutes or Kingdom Siege's waves. They carry over to the next lobby.
_Avoid_: mode options, setup

**Protect from abuse**:
A lobby switch, on by default, for the game modes it applies to: a player who answers wrong several times in a row waits longer before their next question. Like mode settings, it carries over to the next lobby.
_Avoid_: anti-spam, abuse mode

**Mode entry**:
Everything one game mode brings to Quizzer, declared together: how its game runs, what the projector and phones show, its mode settings in the lobby, and its music. The server, the projector and the phone each have one mode entry per game mode.
_Avoid_: mode config, mode registration

**Shared mode entry**:
The part of a game mode's mode entry that the server, the projector and the phone all read: its one plain name, whether it is paced, whether Protect from abuse applies, whether phones show a lobby banner, which phone messages belong to it, and the shapes of its mode settings and gameplay views. Each game mode declares it once, and the three mode entries build on it.
_Avoid_: mode descriptor, mode metadata

**Themed mode**:
A game mode that can be shown in a seasonal theme (classic or Christmas). Its default theme, the name and icon it shows in each theme, and the music track each of its screens plays in each theme are declared together in one table. Several themed modes may share a track; the table is the one place that says so.
_Avoid_: skinned mode, seasonal mode

**Results sheet**:
What a finished game saves for the host as a spreadsheet: one row per player in the game mode's order, under the columns the mode declares, and optionally a free-form appendix such as Kingdom Siege's wave log. Every row has one cell per column.
_Avoid_: results table, results CSV (the CSV is the file written from it)

**Standings**:
The places of a finished (or running) game: entries sorted by the game mode's comparison order, such as Tallest Tower's floors then blocks placed, with competition ranks (1, 2, 2, 4) where entries equal on every key share a place. One module (`src/server/game/standings.ts`) computes them; the podium, the phone's rank and the results sheet's Rank column all read from it. Showdown ranks by points, then correct answers; players equal on both share a place, listed higher on the ladder first.
_Avoid_: leaderboard (Classic's between-question screen), ranking loop

**Podium**:
The finished game's places, awards and each player's result, worked out once when the game finishes and unchanged after. A game mode gives it its entries (players, or teams for Tallest Tower and Land Grab), its Standings order, a way to find a player's entry, and its awards. Each award is a label (declared in the mode's shared file, so the projector reads the same text) and a value: the highest value wins, everyone tied on it shares the award, and nobody gets it when the highest value is 0. The podium screen, the phone's result and the results sheet all read from it.
_Avoid_: awards helper, results summary

**Battlefield**:
Kingdom Siege's lanes and squares, with the defenders players place on them, the monsters marching down them, and the castle's hearts. The battlefield decides who hits whom and what may stand where; the projector and the phone's lane map both show it.
_Avoid_: board, map (the phone's lane map is only a view of it)

**Phase timer**:
The one timer a game mode's server class keeps for the phase it is in, built on the injected clock. Setting a phase cancels the previous phase's pending continuation, so a stale timer cannot fire. It reports the phase's remaining time and progress, and holds the mode's other timers (Robot Attack's warning before a round ends, a player's cooldown) in named slots that are cancelled when replaced and on dispose.
_Avoid_: countdown timer, phase clock

**Game-length clock**:
The overall deadline of a minute-limited game mode (Tallest Tower, Land Grab, Gift Grab), on top of its phase timer. It reports the time left and runs the game's finish exactly once, whether the deadline or an early end by the host comes first.
_Avoid_: deadline timer, match clock

**Game finish**:
The one step that ends a game, shared by every game mode: the mode's own clean-up, cancel every timer on its phase timer, enter the podium once, hand the finished game to the hub, and broadcast even if handing over fails. Finishing again does nothing. The game-length clock finishes through it. It enters the podium and broadcasts even if the clean-up or the hand-over throws; the hub logs its own failures, so the mode catches nothing.
_Avoid_: finish handler, podium step

**Streamed session**:
The parts every streamed game mode assembles, built together: Roster, QuestionStream, Phase timer, Game finish, an optional Game-length clock, the start guard and the hub callbacks. The mode still owns its join, kick and answer.
_Avoid_: base game, mode lifecycle

**Paced session**:
The paced counterpart of the Streamed session: the parts every paced game mode assembles, built together: Roster, Paced question round (with its Phase timer), Game finish, the start guard and the hub callbacks. It ends a game by settling and revealing an open question first, and broadcasts once per disconnect, answer or pacing change. The mode still owns its join, kick, answer and next.
_Avoid_: base game, mode lifecycle

**Streamed question**:
A question one player gets on their own phone in a self-paced game mode, such as Tallest Tower or Kingdom Siege. Each player moves through questions at their own speed, and an answer names the question by its sequence number.
_Avoid_: self-paced question, stream question

**After-answer wait**:
The time after answering a Streamed question before the next answer is legal, including any Protect from abuse penalty. The QuestionStream owns this deadline. Tallest Tower also waits before allowing the first drop, and Land Grab before allowing Claim or Steal. Their activity screens show the wait instead of the answer feedback.

**Paced question round**:
The one module that runs the question cycle of a paced mode (Classic, Racer, Showdown, Memory Game): the question index, the intro, the open question with its deadline plus grace, the reveal and its auto-advance after five seconds, the pacing, the question view, and taking answers: it refuses an answer after the deadline plus grace or a second one from the same player, checks the answer, records the chosen option or the typed text cut to the maximum length, keeps typed answers hidden until the reveal, and closes the question early once every connected player asked has answered. The paced counterpart of the QuestionStream. A mode composes it, says which players are asked (Showdown asks only the duelists in arenas), adds its own scoring to each answer and brings what it adds through hooks (how a question settles, what follows the reveal) and its own phases (Racer's confidence step, Classic's leaderboard).
_Avoid_: question loop, round engine

**Paced question**:
A question the whole game answers together, opened and closed for everyone at once, as in Classic, Racer and Showdown. An answer names the question by its index in the quiz.
_Avoid_: shared question, round question

**Memory Game**:
A game mode in which players earn chips by answering paced questions and score points by matching pairs on a shared board.

**Memory board**:
The shared grid of paired cards in Memory Game. Card positions stay fixed, and matched cards leave empty spaces.

**Pan and zoom** is a phone board control in Land Grab and Memory Game. Dragging moves a zoomed board, and pinching changes its scale. Land Grab also has zoom buttons. A tap can select a position.

**Question phase**:
The part of Memory Game in which players earn chips by answering a batch of paced questions.

**Reveal phase**:
The part of Memory Game in which players take turns spending their earned chips to reveal cards on the shared board.
_Avoid_: reveal mode

**Chip**:
A Memory Game reward for a correct answer. One chip pays for one attempt to match a pair of cards.

**Reveal turn**:
One player's timed attempt to match two cards in Memory Game by selecting and confirming them one at a time. Each card flips as soon as it is confirmed. A matched pair then slides off the board, and a missed pair flips back face down.
_Avoid_: reveal opportunity

**Lobby handoff** is the transition that carries the players who joined the lobby into the selected game when the host presses Start. Each player keeps their identity and can reconnect to the game from their phone.

**Join information** is where players join: the address the host selected, the join URL built from it and the port, and the QR code for that URL. The projector, the host's `/api/info` and the startup output show the same join information.

**Quiz revision** is the saved version of a quiz that an editor opened or last saved. Each successful edit creates a new revision, even when two edits happen in the same millisecond.

**Phone attachment** is the association of an open phone connection with a player identity. A player can have multiple attached connections and becomes disconnected when the last one closes or switches to another player. Attachments carry over through the Lobby handoff.

**Host command** is an instruction the host sends, in the lobby or during a game, such as Start, changing mode settings, or ending the game.

**View delivery** is how the server sends projector snapshots and phone views. A phone can receive a patch based on its last view and catch up from the latest view when its socket drains.

**High Noon** is Showdown's top arena, Arena 1 on Main Street, which the top two players fight in. Its winner stays there. Below it the arenas are numbered streets.

**Reveal step** is one point in Showdown's projector animation for a round's reveal. The duelists face off, draw, fire, settle, then walk to their new arenas.

**View batching** is building every view of one broadcast together, so work the views share (a ranking, a podium) is done once. A game mode opts in through its mode entry (Classic and Showdown do).

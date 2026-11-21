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

**Battlefield**:
Kingdom Siege's lanes and squares, with the defenders players place on them, the monsters marching down them, and the castle's hearts. The battlefield decides who hits whom and what may stand where; the projector and the phone's lane map both show it.
_Avoid_: board, map (the phone's lane map is only a view of it)

**Streamed question**:
A question one player gets on their own phone in a self-paced game mode, such as Tallest Tower or Kingdom Siege. Each player moves through questions at their own speed, and an answer names the question by its sequence number.
_Avoid_: self-paced question, stream question

**Paced question**:
A question the whole game answers together, opened and closed for everyone at once, as in Classic, Racer and Showdown. An answer names the question by its index in the quiz.
_Avoid_: shared question, round question

**Lobby handoff** is the transition that carries the players who joined the lobby into the selected game when the host presses Start. Each player keeps their identity and can reconnect to the game from their phone.

**Join information** is where players join: the address the host selected, the join URL built from it and the port, and the QR code for that URL. The projector, the host's `/api/info` and the startup output show the same join information.

**Quiz revision** is the saved version of a quiz that an editor opened or last saved. Each successful edit creates a new revision, even when two edits happen in the same millisecond.

**Phone attachment** is the association of an open phone connection with a player identity. A player can have multiple attached connections and becomes disconnected when the last one closes or switches to another player. Attachments carry over through the Lobby handoff.

**Host command** is an instruction the host sends, in the lobby or during a game, such as Start, changing mode settings, or ending the game.

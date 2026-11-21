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

**Battlefield**:
Kingdom Siege's lanes and squares, with the defenders players place on them, the monsters marching down them, and the castle's hearts. The battlefield decides who hits whom and what may stand where; the projector and the phone's lane map both show it.
_Avoid_: board, map (the phone's lane map is only a view of it)

**Lobby handoff** is the transition that carries the players who joined the lobby into the selected game when the host presses Start. Each player keeps their identity and can reconnect to the game from their phone.

**Join information** is where players join: the address the host selected, the join URL built from it and the port, and the QR code for that URL. The projector, the host's `/api/info` and the startup output show the same join information.

**Quiz revision** is the saved version of a quiz that an editor opened or last saved. Each successful edit creates a new revision, even when two edits happen in the same millisecond.

**Phone attachment** is the association of an open phone connection with a player identity. A player can have multiple attached connections and becomes disconnected when the last one closes or switches to another player. Attachments carry over through the Lobby handoff.

**Host command** is an instruction the host sends, in the lobby or during a game, such as Start, changing mode settings, or ending the game.

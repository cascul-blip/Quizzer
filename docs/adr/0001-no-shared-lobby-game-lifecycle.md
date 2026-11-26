# No shared lifecycle module under the mode games

The mode games (tower, duel, siege, …) each keep their own `join`, `kick`, `answer` and phase machine. We rejected a shared lifecycle module or base for them.

Roster and QuestionStream already hold the behaviour that really repeats. What is left diverges in the middle of each method: `join` deals a question, pushes to a ladder or splices into a bag; `kick` cleans up mode state; `answer` has mode-specific guards and rewards. A shared module would need an `onJoined`/`onLeft`/`canAnswer` hook per step, and those hooks would be the per-mode code that exists now. The standards also forbid branching on mode, so the module could not branch either.

Small repeated steps go into Roster instead (`adoptFrom`, `setConnected`). Revisit only if a new mode's join/kick/answer turns out identical to an existing one.

Note (issue #298): the paced modes (Classic, Racer, Showdown) now share the answer-taking step through the Paced question round (`src/server/game/paced-round.ts`): the phase and question checks, refusing late or duplicate answers, recording the answer, and closing early. Only that step moved. Each mode still keeps its own `join`, `kick` and `answer`, supplies which players are asked, and adds its own guards and scoring, so this decision stands.

Modes share a Phase timer built on the injected clock. Replacing a phase cancels its pending continuation, and named timer slots allow a mode to replace individual timers or cancel all of them on disposal. The mode still owns what each timer does.

Note (game finish): every mode now ends through one Game finish (`GameFinish` in `src/server/game/phase-timer.ts`) built on its phase timer: run the mode's clean-up, cancel all timers, enter the podium once, hand the game to the hub, broadcast. Like the phase timer, it is a shared step, not a base: the mode still supplies its own clean-up and its own `end()` steps, so this decision stands.

Note (Streamed session, issue #352): each streamed mode now composes a Streamed session (`src/server/game/streamed-session.ts`) that builds the parts this decision already lets modes share: Roster, QuestionStream, Phase timer, Game finish, the optional Game-length clock, the start guard and the hub callbacks. It is a private field, not a base, and takes no `onJoined`/`onLeft` hooks: its steps are single calls, and each mode's `join`, `kick`, `answer` and `start` call one and then do the mode's own work (adding and removing a player don't broadcast; the mode calls `changed()` once its own clean-up is done), so this decision stands.

Note (Paced session, issue #364): paced modes now compose a Paced session (`src/server/game/paced-session.ts`), the paced counterpart, that builds the Roster, Paced question round, Game finish, the start guard and the hub callbacks, and owns `end()` (an open question is settled and revealed before the podium) and the broadcast-once rule for disconnects, answers and pacing. It is a private field, not a base, and takes no join/leave hooks: each mode's `join`, `kick`, `answer` and `next` call one of its steps and then do the mode's own work, so this decision stands.

During the Lobby handoff, activation may publish a view synchronously. The hub installs the game before activating it so any update reads from the game. If activation fails, the hub restores the lobby and disposes of the new game. The [mode guide](../agents/game-modes.md#lobby-handoff) lists the handoff scenarios.

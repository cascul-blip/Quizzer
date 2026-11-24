# No shared lifecycle module under the mode games

The mode games (tower, duel, siege, …) each keep their own `join`, `kick`, `answer` and phase machine. We rejected a shared lifecycle module or base for them.

Roster and QuestionStream already hold the behaviour that really repeats. What is left diverges in the middle of each method: `join` deals a question, pushes to a ladder or splices into a bag; `kick` cleans up mode state; `answer` has mode-specific guards and rewards. A shared module would need an `onJoined`/`onLeft`/`canAnswer` hook per step, and those hooks would be the per-mode code that exists now. The standards also forbid branching on mode, so the module could not branch either.

Small repeated steps go into Roster instead (`adoptFrom`, `setConnected`). Revisit only if a new mode's join/kick/answer turns out identical to an existing one.

Note (issue #298): the paced modes (Classic, Racer, Showdown) now share the answer-taking step through the Paced question round (`src/server/game/paced-round.ts`): the phase and question checks, refusing late or duplicate answers, recording the answer, and closing early. Only that step moved. Each mode still keeps its own `join`, `kick` and `answer`, supplies which players are asked, and adds its own guards and scoring, so this decision stands.

Modes share a Phase timer built on the injected clock. Replacing a phase cancels its pending continuation, and named timer slots allow a mode to replace individual timers or cancel all of them on disposal. The mode still owns what each timer does.

During the Lobby handoff, activation may publish a view synchronously. The hub installs the game before activating it so any update reads from the game. If activation fails, the hub restores the lobby and disposes of the new game. The [mode guide](../agents/game-modes.md#lobby-handoff) lists the handoff scenarios.

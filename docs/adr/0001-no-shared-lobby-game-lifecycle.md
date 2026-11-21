# No shared lifecycle module under the mode games

The mode games (tower, duel, siege, …) each keep their own `join`, `kick`, `answer` and phase machine. We rejected a shared lifecycle module or base for them.

Roster and QuestionStream already hold the behaviour that really repeats. What is left diverges in the middle of each method: `join` deals a question, pushes to a ladder or splices into a bag; `kick` cleans up mode state; `answer` has mode-specific guards and rewards. A shared module would need an `onJoined`/`onLeft`/`canAnswer` hook per step, and those hooks would be the per-mode code that exists now. The standards also forbid branching on mode, so the module could not branch either.

Small repeated steps go into Roster instead (`adoptFrom`, `setConnected`). Revisit only if a new mode's join/kick/answer turns out identical to an existing one.

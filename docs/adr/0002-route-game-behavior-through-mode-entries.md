# Route game behavior through mode entries

Quizzer looks up the server, projector, and phone entries by game mode. Each entry owns its side of the behavior and builds on the shared mode entry. This keeps a mode's setup and dispatch together and lets exhaustive tables and types surface missing entries when a mode is added.

Shared protocol pieces and themed mode facts live outside the individual mode files. Mode files consume those shared pieces, and the common protocol derives its unions from the collected entries. Keeping the dependencies in that direction lets common view types and theme tables serve all modes without creating import cycles.

Code outside a mode's entry looks the entry up by `game.runningMode` instead of asking which mode is running, and `tests/standards.test.ts` rejects comparing a mode (or a client view's kind, mode or banner) against a literal. A game mode times its phases, its game length and its other timers on its Phase timer, not on the Clock directly, so tests control every timer through one injected Clock and no mode keeps its own copy of a phase deadline.

See the [mode guide](../agents/game-modes.md) for the current wiring and checks.

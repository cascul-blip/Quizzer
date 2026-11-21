## Agent skills

### Issue tracker

Track Quizzer issues and specs in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five labels in `docs/agents/triage-labels.md` when triaging issues.

### Domain docs

Quizzer uses one root glossary and one directory for architecture decisions.
See `docs/agents/domain.md` before exploring the codebase.

### Building

`bun run build` replaces the `dist/` executables the user runs. To check the build, use `bun run build -- linux --outdir <scratch dir>`. To check the code, use `bun run check` (typecheck then tests, one after the other as CI runs them).

### Game modes

Adding or removing a game mode: read `docs/agents/game-modes.md`.

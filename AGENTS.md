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

If sandboxed network tests report `getifaddrs` with `errno: 1` or `EPERM: operation not permitted, listen`, run focused tests while diagnosing, then request local networking for `bun run check`.

### Game modes

Game mode changes, lobby handoff, or host controls: read `docs/agents/game-modes.md`.

## Agent skills

### Issue tracker

Track Quizzer issues and specs in GitHub Issues. See `docs/agents/issue-tracker.md`.

Before reporting implementation complete, account for every requirement in the issue or spec, including named test scenarios. Implement and verify each one, or report what remains and why.

### Triage labels

Use the five labels in `docs/agents/triage-labels.md` when triaging issues.

### Domain docs

Quizzer uses one root glossary and one directory for architecture decisions.
See `docs/agents/domain.md` before exploring the codebase.

### Review

For module extractions, run the Standards review on the working tree before committing. See the Extractions section in `CODING_STANDARDS.md`.

### Building

`bun run build` replaces the `dist/` executables the user runs; check the build with `bun run build -- linux --outdir <scratch dir>`. Check the code with `bun run check`, the same command CI runs. Run `bun run format` after a codemod.

For phone component DOM tests, see `tests/stream-question.test.tsx` for the Happy DOM and Preact setup.

`bun test` and `bun run check` run outside the sandbox (`.claude/settings.json`), because the server tests listen on loopback.

### Game modes

Game mode changes, lobby handoff, or host controls: read `docs/agents/game-modes.md`.

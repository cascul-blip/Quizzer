## Agent skills

### Issue tracker

Track Quizzer issues and specs in GitHub Issues. See `docs/agents/issue-tracker.md`.

Before reporting implementation complete, account for every requirement in the issue or spec, including named test scenarios. Implement and verify each one, or report what remains and why.

### Triage labels

Use the five labels in `docs/agents/triage-labels.md` when triaging issues.

### Domain docs

Quizzer uses one root glossary and one directory for architecture decisions.
See `docs/agents/domain.md` before exploring the codebase.

### Building

`bun run build` replaces the `dist/` executables the user runs. To check the build, use `bun run build -- linux --outdir <scratch dir>`. To check the code, use `bun run check` (Biome format and import check, typecheck, then tests, one after the other as CI runs them). Run `bun run format` to fix formatting and import order, including after a codemod.

For phone component DOM tests, see `tests/stream-question.test.tsx` for the Happy DOM and Preact setup.

If sandboxed network tests report `getifaddrs` with `errno: 1` or `EPERM: operation not permitted, listen`, treat loopback as blocked for the rest of the session in that environment. Request local networking for the final `bun run check` against the finished diff. While approval is pending, run targeted suites that do not need loopback with `bun test <test files>`. Capture the full check in a temporary log and report its summary and any failures.

### Game modes

Game mode changes, lobby handoff, or host controls: read `docs/agents/game-modes.md`.

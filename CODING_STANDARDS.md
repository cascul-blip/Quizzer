# Coding standards

Judgement calls the reviewer applies to a diff. `bun run typecheck` and `bun test` run in CI, so this file leaves out anything they catch.

## Tests

- **Shared fixtures**: tests that need a temp directory or store create it in `beforeEach` and clean it up in `afterEach`, as `tests/mcp.test.ts` and `tests/store.test.ts` do, not with a `try/finally` in each test.
- **Domain names**: name `describe` blocks and tests with `GLOSSARY.md` terms for the behaviour under test ("Lobby handoff over WebSockets"). A test that covers shared behaviour goes in its own block, not under whichever game mode it happens to use.

## Game modes

- **One table per fact**: anything that varies by game mode (its display name, whether it carries pacing, how it starts, its results CSV) lives in one exhaustive `switch` ending in `satisfies never`, or in a `Record<GameMode, …>`, so adding or removing a mode is a compile error at every site. Flag new `instanceof` chains or hand-written lists of mode strings.

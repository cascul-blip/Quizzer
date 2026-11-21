# Coding standards

Judgement calls the reviewer applies to a diff. `bun run typecheck` and `bun test` run in CI, so this file leaves out anything they catch.

## Tests

- **Shared fixtures**: a temp directory or store is made in a hook and cleaned up in its pair: `beforeEach`/`afterEach` when tests change it (`tests/store.test.ts`, `tests/hub.test.ts`), `beforeAll`/`afterAll` for an expensive fixture the tests only add to (`tests/mcp.test.ts`, the real server in `tests/server.test.ts`). `tests/standards.test.ts` flags cleanup in a test's own `finally`.
- **Hub tests on fake sockets**: tests of hub behaviour (lobby, teams, answers, reveal, podium) drive a `HubSocket` from `tests/hub-harness.ts`. `tests/server.test.ts` keeps only what a real socket shows: HTTP routes, the upgrade, patches over the wire, resume after a reconnect.
- **Independent expectations**: a test's expected values are written by hand, such as a list of the modes that are paced. A test that reads its expectation from the code under test, such as `MODE_FLAGS[mode].paced`, passes whatever the code says.
- **Domain names**: name `describe` blocks and tests with `GLOSSARY.md` terms for the behaviour under test ("Lobby handoff"). A test that covers shared behaviour goes in its own block, not under whichever game mode it happens to use.

## Types

- **Type names**: a type is named for the value it holds, in `GLOSSARY.md` terms where one exists: `ClassicView` for Classic's phone view, not `Joined`, which names a player's state.
- **Checked casts**: a cast is checked against its source's type. A helper that hides a cast constrains its type parameter by its input, as `entryOf` (`src/client/shared/entry-of.ts`) requires each table entry to have the asked-for entry's fields, rather than casting from `unknown` to whatever the caller names.

## Game modes

- **One table per fact**: anything that varies by game mode (its display name, whether it carries pacing, how it starts, its results CSV) lives in one exhaustive `switch` ending in `satisfies never`, or in a `Record<GameMode, …>`, so adding or removing a mode is a compile error at every site. Flag new `instanceof` chains or hand-written lists of mode strings.
- **Mode entries**: a game mode's server knowledge (its settings, how it starts, pacing, results CSV, phone messages) lives in its mode entry, exported from the mode's own file and collected in `MODES` (`src/server/game/modes.ts`). The hub, lobby and lobby handoff look the entry up and don't branch on the mode.
- **Enforced by `tests/standards.test.ts`**: no code compares a mode against a literal, no client file that uses the mode entries compares a view's kind, mode or banner against a game mode, and no code asks `instanceof` of a game class. A suggested fix must pass these too.

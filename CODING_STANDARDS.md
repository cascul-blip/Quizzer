# Coding standards

Judgement calls the reviewer applies to a diff. `bun run typecheck` and `bun test` run in CI, so this file leaves out anything they catch.

## Tests

- **Shared fixtures**: a temp directory or store is made in a hook and cleaned up in its pair: `beforeEach`/`afterEach` when tests change it (`tests/store.test.ts`, `tests/hub.test.ts`), `beforeAll`/`afterAll` for an expensive fixture the tests only add to (`tests/mcp.test.ts`, the real server in `tests/server.test.ts`). `tests/standards.test.ts` flags cleanup in a test's own `finally`, and `Bun.sleep` as a wait (await the event instead).
- **Hub tests on fake sockets**: tests of hub behaviour (lobby, teams, answers, reveal, podium) drive a `HubSocket` from `tests/hub-harness.ts`. `tests/standards.test.ts` flags direct socket-open calls in test files. `tests/server.test.ts` keeps only what a real socket shows: HTTP routes, the upgrade, patches over the wire, resume after a reconnect.
- **Independent expectations**: a test's expected values are written by hand, such as a list of the modes that are paced. A test that reads its expectation from the code under test, such as `MODE_FLAGS[mode].paced`, passes whatever the code says.
- **Gameplay deadlines**: when changing which module owns a deadline, use a controlled clock at each affected game mode’s normal entry point. Check that the action is blocked one tick before the expected deadline and succeeds at the deadline. Derive the deadline from the expected gameplay durations.
- **Nothing-sent checks over a real socket**: a check that a real-socket client received nothing comes after `await socket.delivered()` (a ping round trip, `tests/server.test.ts`), so every frame the server sent first has arrived. Without it the check passes before any frame could cross the socket.
- **Public surface**: a module extracted from the hub or a game mode gets at least one test through the public surface (the host view, a phone view, an HTTP route, the startup output), not only through its own class. Callers reach it that way, and the wiring between them is the part a direct test misses. A test may set up its scenario through the module when it asserts through the surface.
- **Domain names**: name `describe` blocks and tests with `GLOSSARY.md` terms for the behaviour under test ("Lobby handoff"). `tests/standards.test.ts` rejects a title containing a multi-word _Avoid_ phrase from the glossary; single-word ones ("board", "map") are left to the reviewer. A test that covers shared behaviour goes in its own block, not under whichever game mode it happens to use.

## Extractions

- **Single owner**: after an extraction, each piece of state has one owner; the other side reads it through a getter or callback. A copy kept in step by hand (a sync method, a guard comparing the two) is a finding. Check every state the extracted module reads at a phase boundary (a build break, before the first round) against the original.
- **Direct coverage**: each rule the extracted module owns has a test against its own interface. Existing tests redirected through a new field don't count.
- **Lifecycle helper names**. Compare the name with the effects the caller relies on. For example, `installAndActivate` tells the caller that the helper both installs the game and starts its lifecycle. Review the failure path for effects such as restoring the lobby and disposing of the game.

## Game end

- **End-of-game steps**: work that runs as a game finishes (`onFinish`, a mode entry's `finished`, saving results) logs a failure and carries on, so the steps after it still run and the host still reaches the podium and the results download. `saveResults` (`src/server/game/results.ts`) is the model. A mode does not catch these itself: the hub's `onFinish` logs its own failures and returns, and the mode's Game finish (`GameFinish`) still enters the podium and broadcasts if its clean-up, its Podium or `onFinish` throws (an empty Podium stands in for one that fails to build), then rethrows to whoever called `finish()` (a timer or the host's End).

## Types

- **Type names**: a type is named for the value it holds, in `GLOSSARY.md` terms where one exists: `ClassicView` for Classic's phone view, not `Joined`, which names a player's state.
- **Checked casts**: a cast is checked against its source's type. A helper that hides a cast constrains its type parameter by its input, as `entryOf` (`src/client/shared/entry-of.ts`) requires each table entry to have the asked-for entry's fields, rather than casting from `unknown` to whatever the caller names. A table's keys come from `keysOf` (`src/shared/keys-of.ts`); `tests/standards.test.ts` rejects `Object.keys(…) as`. `scripts/check-new-casts.sh` (in `bun run check`, untracked files included) rejects a new cast in `src/`, and a new `as unknown as` in `tests/`, unless the line above is a `// checked:` comment saying why it holds.

## Game modes

- **Behavior changes**. Review the diff alongside the affected [game-mode guide](docs/agents/game-modes.md), [mode design notes](docs/modes/), and relevant [ADRs](docs/adr/). Check that guidance on ownership, sequencing, and extension points still fits the behavior in the diff. Update affected guidance and record any changed architecture decision in its ADR.

- **One table per fact**: anything that varies by game mode (its display name, whether it carries pacing, how it starts, its results sheet) lives in one exhaustive `switch` ending in `satisfies never`, or in a `Record<GameMode, …>`, so adding or removing a mode is a compile error at every site. Flag new `instanceof` chains or hand-written lists of mode strings.
- **Mode entries**: a game mode's server knowledge (its settings, how it starts, pacing, results sheet, phone messages) lives in its mode entry, exported from the mode's own file and collected in `MODES` (`src/server/game/modes.ts`). The hub, lobby and lobby handoff look the entry up and don't branch on the mode.
- **View time fields**: a time field in a phone or projector view ends in `RemainingMs` (time left), `ElapsedMs` (time since a start) or `DurationMs` (a fixed length); plain `remainingMs`, `elapsedMs` and `durationMs` count. View delivery recognises running timers by these suffixes, so a misnamed countdown resends a phone's view on every tick. `tests/standards.test.ts` checks the view types in `src/shared/modes/` and `src/shared/mode-views.ts`.
- **Enforced by `tests/standards.test.ts`**: server code does not compare a mode against a literal, no client file that uses the mode entries compares a view's kind, mode or banner against a game mode, and server code does not use `instanceof` on a game class. Tests may use `instanceof` to narrow a game fixture. A suggested fix must pass these too.

## Imports

Keep imports acyclic, including type-only imports. When two modules need the same definition, move it into a shared dependency. The import graph check in `tests/standards.test.ts` tracks the existing cycles and flags new ones.

## Comments

When a comment explains what a name, constant or pattern means, rename or restructure the code until the comment says nothing new, then delete it. A comment that restates the code drifts away from it. The common cases:

- **Units in the name**: `distanceMiles`, `cooldownMs`, `heightVh`, not `distance` with `/** Miles. */`.
- **Named constants**: a number whose meaning needs a comment gets a constant (`LOSER_SPOT_X = 0.79`).
- **Named conditions**: a condition that needs a comment becomes a variable or function (`const showsTumbleweed = …`).
- **Named values over codes**: return named constants or a union, not `0`/`1`/`2` explained in a comment.
- **Doc comments add something**: a doc comment that repeats its name (`/** Five health pips. */` on `HealthBar`) or narrates the next line (`// Walking.`) goes.
- **No section dividers**: split a file that needs `// ---------- monsters ----------` banners, or let its declarations read in order. `tests/standards.test.ts` rejects them.

Avoid using comments when possible.  The code should be the explanation of what it does.  If something requires a comment to be understandable then the code should be refactored to make it explanatory what it does.

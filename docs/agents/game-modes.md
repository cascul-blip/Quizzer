# Mode docs

Design notes for the app and individual modes live in `docs/modes/`:

- [Quizzer](../modes/Quizzer.md): the original requirements for the app
- [Cup of Death](../modes/Cup%20of%20Death.md)
- [Land Grab](../modes/Land%20Grab.md)
- [Racer](../modes/Racer.md)
- [Robot Attack](../modes/Robot%20Attack.md)
- [Showdown](../modes/Showdown.md)

Put a new mode's doc in `docs/modes/` and link it here.

# Lobby handoff

GameHub gives the mode entry the quiz, choices, player identities and team assignments, then installs the game before activation. It remembers the lobby choices after activation succeeds. If activation fails, GameHub restores the lobby and disposes of the new game.

Before moving ownership or migrating handoff tests, match each case to existing hub coverage in [hub.test.ts](../../tests/hub.test.ts), [host-commands.test.ts](../../tests/host-commands.test.ts), and [lobby-handoff.test.ts](../../tests/lobby-handoff.test.ts). Add tests for gaps and keep one test for each identical scenario.

| Host command in the lobby | Empty lobby | At least one player |
| --- | --- | --- |
| Start (`host.start`) | Refuse and keep the lobby open for retry. | Launch the selected game mode. |
| Next (`host.next`) | Refuse and keep the lobby open for retry. | Start Classic even when another mode is selected. |
| End (`host.end`) | Go straight to the Classic podium even when another mode is selected. | Go straight to the Classic podium even when another mode is selected. |

# Adding or removing a game mode

A mode's server knowledge lives in its entry: a `ModeEntry` (`src/server/game/mode-entry.ts`) exported from the mode's own file in `src/server/game/`, collected in `MODES` (`src/server/game/modes.ts`). `MODES` is typed over `GameMode`, so a mode without an entry is a compile error. The hub, lobby and handoff look the entry up by `game.runningMode` and never branch on the mode; `tests/standards.test.ts` enforces that.

Lobby imports the registry. Put code that needs both Lobby and the registry in a separate module, as in [phone message dispatch](../../src/server/game/phone-message-dispatch.ts). The cycle check in `tests/standards.test.ts` includes type-only imports.

The projector and the phone have a mode entry each, collected the same way: `HOST_MODES` (`src/client/host/modes.tsx`) holds the mode's stage, its music cue and its lobby part, and `PLAYER_MODES` (`src/client/player/modes.tsx`) its phone screen and lobby banner. Both are typed over `GameMode`. Each `main.tsx` looks the entry up by `view.kind`, which is the mode, and never branches on the mode, and neither does `src/client/host/music-cues.ts`, which plays the entry's cue; `tests/standards.test.ts` enforces that for all three files. The server sends dedicated projector and joined-phone lobby views with `kind: "lobby"`. The projector, phone and music handler use that kind to select the lobby and use its selected mode for settings, banners and lobby music. Classic’s server class lives in `src/server/game/classic.ts` and its mode entry lives in `src/server/game/classic-entry.ts`.

The lobby part of a projector entry (`LobbyModeEntry`) is the mode's line in the Game mode menu, its settings panel with its hint text, an optional preview below the settings, and its lobby track, the music the lobby plays while the mode is selected. The projector lobby and its music selection both look up the selected mode in `HOST_MODES`.

The [shared mode entry](../../GLOSSARY.md#language) for each mode lives in `src/shared/modes/<mode>.ts`. The entries are collected in `SHARED_MODES` (`src/shared/mode-entries.ts`). `GameMode` is the keys of `SHARED_MODES`, and `dispatchPhoneMessage` checks which shared mode entry lists a phone message and invokes that mode’s server handler when its game is running. The server's `ModeEntry` spreads the shared mode entry, and the phone's `banner` must be set exactly when `lobbyBanner` is (compiler). The lobby draws the Pacing and Shuffle question order rows for a paced mode and hands them to its settings panel, which places them (`tests/lobby-modes.test.ts` checks it does), and the Protect from abuse row for a mode that protects. On the server, a `ModeEntry`'s `pacing` must be a function exactly when the mode is paced (compiler), and the lobby handoff decides Protect from abuse from the flag and the host’s setting, then includes the effective value in the handoff facts.

The following checklist covers adding a mode. "Compiler" marks the places where `bun run typecheck` reports a mode that is missing. The others fail silently:

- [ ] `src/shared/modes/<mode>.ts`: the mode's own protocol types (phase, settings, views, constants), its phone message union (`<Mode>Msg`, for example `TowerMsg`), and its shared mode entry (`<mode>Shared`, built with `sharedModeEntry<ModeProtocol<...>>()`): the mode's one plain name, its flags, `lobbyBanner`, and `msgTypes`, which the compiler holds to exactly the union's message types. Supply the message union, stored settings type (`NoSettings` for a mode without settings), host view and phone view to `ModeProtocol`. Give it a fifth type argument if the host sends a different settings shape. Both gameplay views must use the mode key as their `kind` (compiler). `protocol.ts` derives the gameplay messages, settings, views and phases from `SHARED_MODES`. Its answer message is `StreamAnswerMsg<"<prefix>">` for a streamed question or `PacedAnswerMsg<"<prefix>">` for a paced question, both from `src/shared/mode-views.ts`. Every file in `modes/` is a mode file: it imports no other mode file and nothing from `protocol.ts`, and collections of modes live outside it (`src/shared/mode-entries.ts`); view pieces several modes share live in `src/shared/mode-views.ts`. `tests/import-graph.test.ts` checks these import boundaries and requires a file for every mode in `SHARED_MODES`.
- [ ] `SHARED_MODES` in `src/shared/mode-entries.ts`: the import and entry for the mode's shared mode entry. `GameMode` follows from it. Also add the name to `GLOSSARY.md` if the glossary lists it.
- [ ] A protected mode's `start` passes the handoff’s `protect` value on to its game.
- [ ] `ModeGame` in `src/server/game/mode-entry.ts`: the mode's game class (compiler).
- [ ] `initialSettings` in `src/server/game/lobby.ts` (compiler).
- [ ] `HOST_MODES` in `src/client/host/modes.tsx`: the mode's stage, gameplay cue and lobby part (compiler), in Game mode menu order. Put the stage, cue (as `<mode>Cue`) and lobby part (as `<mode>Lobby`) in `src/client/host/<mode>.tsx`. A paced mode's settings panel places the shared rows passed as `children`.
- [ ] `PLAYER_MODES` in `src/client/player/modes.tsx`: the mode's phone screen (compiler), and its `banner` if its shared mode entry sets `lobbyBanner` (null otherwise). Put the screen and banner in `src/client/player/<mode>.tsx`.
- [ ] Music tracks: a new track id goes in `THEMED_MODES` for a themed mode's screen, else in `OTHER_TRACKS` (`src/shared/music-tracks.ts`), and its track in `TRACKS` (`src/client/shared/music/tracks.ts`, compiler once the id exists).
- [ ] Themes: a themed mode's entry in `THEMED_MODES` (`src/shared/themed-modes.ts`): its default theme, its screens, and for each theme its name, icon and the track each screen plays. The cue and lobby track read tracks with `themedTrack` and choose only intensity; `MUSIC_TRACKS` builds the mode's rows from the table, and `tests/themed-modes.test.ts` pins every theme × screen → track (fails until updated). Theme words beyond the name (Kingdom Siege's defenders, say) go in the mode file.
- [ ] Art, by convention per mode: `src/shared/<mode>-rules.ts`, and `src/client/shared/<mode>-art.tsx`, `<mode>-skin.tsx` (`createSkin("<mode>")`) and `<mode>/` (assets).
- [ ] Tests: in `tests/game-modes.test.ts`, the `CHANGED`, `TEAMS` and `PHONE_MSG` tables (compiler). Put the mode's own rules in `tests/<mode>.test.ts`.
- [ ] `README.md`: the mode's section, and the list of modes under "Protect from abuse".

To remove a mode, delete it from each of these places, then run `bun run typecheck`, which lists any references left.

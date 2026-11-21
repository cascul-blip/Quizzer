# Adding or removing a game mode

A mode's server knowledge lives in its entry: a `ModeEntry` (`src/server/game/mode-entry.ts`) exported from the mode's own file in `src/server/game/`, collected in `MODES` (`src/server/game/modes.ts`). `MODES` is typed over `GameMode`, so a mode without an entry is a compile error. The hub, lobby and handoff look the entry up by `game.runningMode` and never branch on the mode; `tests/standards.test.ts` enforces that.

The projector and the phone have a mode entry each, collected the same way: `HOST_MODES` (`src/client/host/modes.tsx`) holds the mode's stage and its lobby part, and `PLAYER_MODES` (`src/client/player/modes.tsx`) its phone screen and lobby banner. Both are typed over `GameMode`. Each `main.tsx` looks the entry up by `view.kind`, which is the mode, and never branches on the mode; `tests/standards.test.ts` enforces that for both files. The lobby belongs to no mode: on the projector it is the first phase of Classic's view, so Classic's stage shows it from `src/client/host/lobby.tsx`; on the phone, `src/client/player/main.tsx` shows it before looking up the entry.

The lobby part of a projector entry (`LobbyModeEntry`) is the mode's line in the Game mode menu, its settings panel with its hint text, and an optional preview below the settings. The lobby reads these from `LOBBY_MODES` (`src/client/host/lobby-modes.tsx`), which `HOST_MODES` copies them from: `LOBBY_MODES` leaves out the stages, so the lobby can import it without an import cycle through Classic's stage. `lobby.tsx` never branches on the mode either; `tests/standards.test.ts` enforces that.

Two facts about a mode are shared by the server and the projector, declared once in `MODE_FLAGS` (`src/shared/mode-flags.ts`): `paced` and `protect`. The lobby draws the Pacing and Shuffle question order rows for a paced mode and hands them to its settings panel, which places them (`tests/lobby-modes.test.ts` checks it does), and the Protect from abuse row for a mode that protects. On the server, a `ModeEntry`'s `pacing` must be a function exactly when the mode is paced (compiler), and a protected mode's game reads the host's choice through `lobbyProtect`.

Work outside the entries, by hand. "Compiler" marks the places where `bun run typecheck` reports a mode that is missing. The others fail silently:

- [ ] `src/shared/protocol.ts`: `GameMode`, the mode's settings in `ModeSettingsMap` (and `ModeSettingsInput` if the host's input differs), its phone messages in `PlayerMsg`, its phase in the `PlayerView` "none" union, and its host and player views in `HostView` and `PlayerView`, with the mode as their `kind`.
- [ ] `src/shared/mode-names.ts`: the one plain name (compiler). Also add it to `GLOSSARY.md` if the glossary lists it.
- [ ] `MODE_FLAGS` in `src/shared/mode-flags.ts`: whether the mode is paced and whether Protect from abuse applies (compiler). A protected mode passes `lobbyProtect(lobby, mode)` to its game when the lobby hands its players over.
- [ ] `MSG_MODE` in `src/server/game/mode-entry.ts`: each phone message mapped to its mode (compiler). `ModeGame` in the same file: the mode's game class (compiler).
- [ ] `initialSettings` in `src/server/game/game.ts` (compiler).
- [ ] `LOBBY_MODES` in `src/client/host/lobby-modes.tsx`: the mode's lobby part (compiler), at the place the mode goes in the Game mode menu: its `label`, its `Settings` panel with its hint text (placing `children`, the shared rows, if the mode is paced), and any `Preview`. Put it in `src/client/host/<mode>.tsx` as `<mode>Lobby`.
- [ ] `HOST_MODES` in `src/client/host/modes.tsx`: the mode's stage and its lobby part from `LOBBY_MODES` (compiler). Put the stage in `src/client/host/<mode>.tsx`.
- [ ] `PLAYER_MODES` in `src/client/player/modes.tsx`: the mode's phone screen (compiler), and its `banner` if the server entry sets `lobbyBanner` (null otherwise). Put the screen and banner in `src/client/player/<mode>.tsx`.
- [ ] `src/client/host/music-cues.ts`: the lobby track in `LOBBY` (compiler), and a case in `musicFor` (compiler).
- [ ] Music tracks: a new track id goes in `MUSIC_TRACKS` (`src/shared/music-tracks.ts`) and its track in `TRACKS` (`src/client/shared/music/tracks.ts`, compiler once the id exists).
- [ ] Art and themes, by convention per mode: `src/shared/<mode>-theme.ts` and `<mode>-rules.ts`, and `src/client/shared/<mode>-art.tsx`, `<mode>-skin.tsx` and `<mode>/` (assets).
- [ ] Tests: in `tests/game-modes.test.ts`, the `CHANGED`, `TEAMS` and `PHONE_MSG` tables (compiler). Put the mode's own rules in `tests/<mode>.test.ts`.
- [ ] `README.md`: the mode's section, and the list of modes under "Protect from abuse".

To remove a mode, delete it from each of these places, then run `bun run typecheck`, which lists any references left.

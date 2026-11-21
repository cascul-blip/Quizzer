# Adding or removing a game mode

A mode's server knowledge lives in its entry: a `ModeEntry` (`src/server/game/mode-entry.ts`) exported from the mode's own file in `src/server/game/`, collected in `MODES` (`src/server/game/modes.ts`). `MODES` is typed over `GameMode`, so a mode without an entry is a compile error. The hub, lobby and handoff look the entry up by `game.runningMode` and never branch on the mode; `tests/standards.test.ts` enforces that.

The projector and the phone have a mode entry each, collected the same way: `HOST_MODES` (`src/client/host/modes.tsx`) holds the mode's stage, and `PLAYER_MODES` (`src/client/player/modes.tsx`) its phone screen and lobby banner. Both are typed over `GameMode`. Each `main.tsx` looks the entry up by `view.kind`, which is the mode, and never branches on the mode; `tests/standards.test.ts` enforces that for both files. The lobby belongs to no mode: on the projector it is the first phase of Classic's view, so Classic's stage shows it from `src/client/host/lobby.tsx`; on the phone, `src/client/player/main.tsx` shows it before looking up the entry.

Work outside the entries, by hand. "Compiler" marks the places where `bun run typecheck` reports a mode that is missing. The others fail silently:

- [ ] `src/shared/protocol.ts`: `GameMode`, the mode's settings in `ModeSettingsMap` (and `ModeSettingsInput` if the host's input differs), its phone messages in `PlayerMsg`, its phase in the `PlayerView` "none" union, and its host and player views in `HostView` and `PlayerView`, with the mode as their `kind`.
- [ ] `src/shared/mode-names.ts`: the one plain name (compiler). Also add it to `GLOSSARY.md` if the glossary lists it.
- [ ] `MSG_MODE` in `src/server/game/mode-entry.ts`: each phone message mapped to its mode (compiler). `ModeGame` in the same file: the mode's game class (compiler).
- [ ] `initialSettings` in `src/server/game/game.ts` (compiler).
- [ ] `HOST_MODES` in `src/client/host/modes.tsx`: the mode's stage (compiler). Put the stage in `src/client/host/<mode>.tsx`.
- [ ] `Lobby` in `src/client/host/lobby.tsx`: the mode's `<option>`, its settings panel, the "Protect from abuse" list of modes, and any lobby preview.
- [ ] `PLAYER_MODES` in `src/client/player/modes.tsx`: the mode's phone screen (compiler), and its `banner` if the server entry sets `lobbyBanner` (null otherwise). Put the screen and banner in `src/client/player/<mode>.tsx`.
- [ ] `src/client/host/music-cues.ts`: the lobby track in `LOBBY` (compiler), and a case in `musicFor` (compiler).
- [ ] Music tracks: a new track id goes in `MUSIC_TRACKS` (`src/shared/music-tracks.ts`) and its track in `TRACKS` (`src/client/shared/music/tracks.ts`, compiler once the id exists).
- [ ] Art and themes, by convention per mode: `src/shared/<mode>-theme.ts` and `<mode>-rules.ts`, and `src/client/shared/<mode>-art.tsx`, `<mode>-skin.tsx` and `<mode>/` (assets).
- [ ] Tests: in `tests/game-modes.test.ts`, the `CHANGED`, `TEAMS` and `PHONE_MSG` tables (compiler), and the `PACED` set. Put the mode's own rules in `tests/<mode>.test.ts`.
- [ ] `README.md`: the mode's section, and the list of modes under "Protect from abuse".

To remove a mode, delete it from each of these places, then run `bun run typecheck`, which lists any references left.

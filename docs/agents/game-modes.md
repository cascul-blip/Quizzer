# Adding or removing a game mode

A mode's server knowledge lives in its entry: a `ModeEntry` (`src/server/game/mode-entry.ts`) exported from the mode's own file in `src/server/game/`, collected in `MODES` (`src/server/game/modes.ts`). `MODES` is typed over `GameMode`, so a mode without an entry is a compile error. The hub, lobby and handoff look the entry up by `game.runningMode` and never branch on the mode; `tests/standards.test.ts` enforces that.

The projector and the phone have a mode entry each, collected the same way: `HOST_MODES` (`src/client/host/modes.tsx`) holds the mode's stage, its music cue and its lobby part, and `PLAYER_MODES` (`src/client/player/modes.tsx`) its phone screen and lobby banner. Both are typed over `GameMode`. Each `main.tsx` looks the entry up by `view.kind`, which is the mode, and never branches on the mode, and neither does `src/client/host/music-cues.ts`, which plays the entry's cue; `tests/standards.test.ts` enforces that for all three files. The lobby belongs to no mode: both projector and phone select the lobby by phase before looking up the gameplay stage or screen. The server lobby sends the existing Classic lobby view. On Start, it hands the selected mode entry the quiz, choices, player identities and team assignments. Classic receives the handoff just like the other modes. For compatibility, `host.next` and `host.end` received while the lobby is open target Classic regardless of the selected mode. `host.next` starts Classic and `host.end` takes it straight to the podium. The projector’s Start control uses `host.start` to launch the selected mode.

The lobby part of a projector entry (`LobbyModeEntry`) is the mode's line in the Game mode menu, its settings panel with its hint text, an optional preview below the settings, and its lobby track, the music the lobby plays while the mode is selected. The projector lobby and its music selection both look up the selected mode in `HOST_MODES`.

Two facts about a mode are shared by the server and the projector, declared once in `MODE_FLAGS` (`src/shared/mode-flags.ts`): `paced` and `protect`. The lobby draws the Pacing and Shuffle question order rows for a paced mode and hands them to its settings panel, which places them (`tests/lobby-modes.test.ts` checks it does), and the Protect from abuse row for a mode that protects. On the server, a `ModeEntry`'s `pacing` must be a function exactly when the mode is paced (compiler), and the lobby handoff decides Protect from abuse from the flag and the host’s setting, then includes the effective value in the handoff facts.

Work outside the entries, by hand. "Compiler" marks the places where `bun run typecheck` reports a mode that is missing. The others fail silently:

- [ ] `src/shared/protocol.ts`: `GameMode`, the mode's settings in `ModeSettingsMap` (and `ModeSettingsInput` if the host's input differs), its phone messages in `PlayerMsg`, its phase in the `PlayerView` "none" union, and its host and player views in `HostView` and `PlayerView`, with the mode as their `kind`.
- [ ] `src/shared/mode-names.ts`: the one plain name (compiler). Also add it to `GLOSSARY.md` if the glossary lists it.
- [ ] `MODE_FLAGS` in `src/shared/mode-flags.ts`: whether the mode is paced and whether Protect from abuse applies (compiler). A protected mode's `start` passes the handoff’s `protect` value on to its game.
- [ ] `MSG_MODE` in `src/server/game/mode-entry.ts`: each phone message mapped to its mode (compiler). `ModeGame` in the same file: the mode's game class (compiler).
- [ ] `initialSettings` in `src/server/game/lobby.ts` (compiler).
- [ ] `HOST_MODES` in `src/client/host/modes.tsx`: the mode's stage, gameplay cue and lobby part (compiler), in Game mode menu order. Put the stage, cue (as `<mode>Cue`) and lobby part (as `<mode>Lobby`) in `src/client/host/<mode>.tsx`. A paced mode's settings panel places the shared rows passed as `children`.
- [ ] `PLAYER_MODES` in `src/client/player/modes.tsx`: the mode's phone screen (compiler), and its `banner` if the server entry sets `lobbyBanner` (null otherwise). Put the screen and banner in `src/client/player/<mode>.tsx`.
- [ ] Music tracks: a new track id goes in `MUSIC_TRACKS` (`src/shared/music-tracks.ts`) and its track in `TRACKS` (`src/client/shared/music/tracks.ts`, compiler once the id exists).
- [ ] Art and themes, by convention per mode: `src/shared/<mode>-theme.ts` and `<mode>-rules.ts`, and `src/client/shared/<mode>-art.tsx`, `<mode>-skin.tsx` and `<mode>/` (assets).
- [ ] Tests: in `tests/game-modes.test.ts`, the `CHANGED`, `TEAMS` and `PHONE_MSG` tables (compiler). Put the mode's own rules in `tests/<mode>.test.ts`.
- [ ] `README.md`: the mode's section, and the list of modes under "Protect from abuse".

To remove a mode, delete it from each of these places, then run `bun run typecheck`, which lists any references left.

// why: checked by `bun run typecheck`, not run: entryOf refuses a table whose entries lack the asked-for entry's fields.
import type { LobbyModeEntry } from "../src/client/host/lobby-modes.tsx";
import { PLAYER_MODES } from "../src/client/player/modes.tsx";
import { entryOf } from "../src/client/shared/entry-of.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";

// @ts-expect-error a phone entry has no lobby label, settings or track
entryOf<LobbyModeEntry<GameMode>>(PLAYER_MODES, "classic");

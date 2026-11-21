import { MODE_FLAGS } from "../../shared/mode-flags.ts";
import type { Pacing } from "../../shared/protocol.ts";
import { type Game, GameError } from "./game.ts";
import type { LiveGame, StartContext } from "./mode-entry.ts";
import { entryOf, MODES } from "./modes.ts";

export type { LiveGame } from "./mode-entry.ts";

interface HandoffOptions extends Omit<StartContext, "protect"> {
  install: (game: LiveGame) => void;
  log: (message: string) => void;
}

/** Start the selected mode and return its pacing if it carries forward to the next lobby. */
export function startLobbyGame(lobby: Game, pacing: Pacing | undefined, { install, log, ...ctx }: HandoffOptions): Pacing | undefined {
  if (lobby.phase !== "lobby") {
    lobby.start(pacing);
    return lobby.pacing;
  }
  if (lobby.players.size === 0) throw new GameError("Wait for at least one player to join");
  // The one place "Protect from abuse" is decided: off in a mode whose MODE_FLAGS don't protect, whatever the lobby's setting.
  const protect = MODE_FLAGS[lobby.mode].protect && lobby.protect;
  const { game, log: line } = MODES[lobby.mode].start(lobby, { ...ctx, protect });
  // Classic starts in the lobby's own Game; every other mode takes the lobby's players into a new one.
  if (game !== lobby) {
    lobby.dispose();
    // Starting can immediately notify the hub, which must already see the new game.
    install(game);
  }
  game.start(pacing);
  if (line) log(line);
  return entryOf(game).pacing?.(game).pacing;
}

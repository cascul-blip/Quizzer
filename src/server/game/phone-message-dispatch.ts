import type { GameMode } from "../../shared/mode-entries.ts";
import type { ClientMsg } from "../../shared/protocol.ts";
import { GameError } from "./common.ts";
import { Lobby } from "./lobby.ts";
import type { ModeGame, ModeMsg } from "./mode-entry.ts";
import { modeOfMsg } from "./mode-entry.ts";
import { MODES } from "./modes.ts";

export function dispatchPhoneMessage<M extends GameMode>(
  game: (ModeGame[M] & { runningMode: M }) | Lobby | null,
  playerId: string | null,
  msg: Exclude<ClientMsg, { type: "join" | "resume" }>,
): "resend" | void {
  const owner = modeOfMsg(msg.type);
  if (!owner) throw new GameError(`Unknown message ${msg.type}`);
  if (!game || !playerId) return;

  if (game instanceof Lobby) {
    if (msg.type === "setAvatar") game.setAvatar(playerId, msg.avatar, msg.accessory);
    return;
  }

  // A late message from a different game mode is ignored.
  if (owner !== game.runningMode) return;
  // checked: the shared entry for game.runningMode lists exactly the message types its handler accepts.
  return MODES[game.runningMode].handle(game, playerId, msg as ModeMsg<M>);
}

import { answerOf } from "../../shared/answer-match.ts";
import { classicShared } from "../../shared/modes/classic.ts";
import { buildClassicResults, ClassicGame } from "./classic.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";

export const classicMode: ModeEntry<"classic"> = {
  ...classicShared,
  lobbyControlError: (message) => message,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = new ClassicGame(lobby.quiz, {
      ...handoffOptions(ctx),
      pacing: lobby.pacing,
      shuffle: lobby.shuffle,
    });
    game.setup = lobby.choices;
    game.adoptPlayers(lobby.players);
    return { game, log: null };
  },
  pacing: (game) => game,
  teams: () => null,
  results: buildClassicResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "answer":
        game.answer(playerId, Number(msg.qIndex), answerOf(msg));
        return;
      case "setAvatar":
        game.setAvatar(playerId, msg.avatar, msg.accessory);
        return;
      default:
        return unhandled(msg);
    }
  },
};

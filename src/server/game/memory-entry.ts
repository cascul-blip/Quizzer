import { answerOf } from "../../shared/answer-match.ts";
import { memoryShared } from "../../shared/modes/memory.ts";
import { MemoryGame } from "./memory.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
import { sheet } from "./results.ts";

export const memoryMode: ModeEntry<"memory"> = {
  ...memoryShared,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = new MemoryGame(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s)` };
  },
  pacing: (game) => game,
  teams: () => null,
  results: (game) =>
    sheet(
      [
        { header: "Rank", value: (p) => p.rank },
        { header: "Nickname", value: (p) => p.nickname },
        { header: "Matched pairs", value: (p) => p.pairs },
        { header: "Correct answers", value: (p) => p.correct },
        { header: "Total time (s)", value: (p) => (p.totalMs / 1_000).toFixed(3) },
      ],
      game.ranked(),
    ),
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "memory.answer":
        return game.answer(playerId, Number(msg.index), answerOf(msg)) ? undefined : "resend";
      case "memory.confirm":
        return game.confirm(playerId, msg.turnId, msg.positions) ? undefined : "resend";
      default:
        return unhandled(msg);
    }
  },
};

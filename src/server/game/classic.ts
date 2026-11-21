import { answerOf } from "../../shared/answer-match.ts";
import { MODE_NAMES } from "../../shared/mode-names.ts";
import { Game } from "./game.ts";
import { handoffOptions, unhandled, type ModeEntry } from "./mode-entry.ts";
import { toCsv } from "./results.ts";

/** One row per player (by rank) with per-question answer, correctness, points and time. */
export function buildResultsCsv(game: Game): string {
  const header: string[] = ["Rank", "Nickname", "Score", "Correct answers"];
  game.questions.forEach((q, i) => {
    const n = i + 1;
    header.push(`Q${n} answer (${q.text})`, `Q${n} correct`, `Q${n} points`, `Q${n} time (s)`);
  });
  const rows: (string | number)[][] = game.ranked().map((p) => {
    const row: (string | number)[] = [p.rank, p.nickname, p.score, p.answers.filter((a) => a?.correct).length];
    game.questions.forEach((q, i) => {
      const a = p.answers[i];
      if (a) row.push((q.type === "text" ? a.text : q.options[a.option]) ?? "", a.correct ? "yes" : "no", a.points, (a.ms / 1000).toFixed(2));
      else row.push("", "no answer", 0, "");
    });
    return row;
  });
  return toCsv([header, ...rows]);
}

export const classicMode: ModeEntry<"classic"> = {
  name: MODE_NAMES.classic,
  lobbyControlError: (message) => message,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = new Game(lobby.quiz, lobby.lobbyView, {
      ...handoffOptions(ctx),
      pacing: lobby.pacing,
      shuffle: lobby.shuffle,
    });
    game.adoptPlayers(lobby.players);
    return { game, log: null };
  },
  pacing: (game) => game,
  teams: () => null,
  lobbyBanner: false,
  resultsCsv: buildResultsCsv,
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

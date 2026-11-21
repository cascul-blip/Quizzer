import { answerOf } from "../../shared/answer-match.ts";
import { classicShared } from "../../shared/modes/classic.ts";
import { ClassicGame } from "./game.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";

type ClassicPlayer = ReturnType<ClassicGame["ranked"]>[number];

/** One row per player (by rank) with per-question answer, correctness, points and time. */
function classicColumns(game: ClassicGame): Column<ClassicPlayer>[] {
  const columns: Column<ClassicPlayer>[] = [
    { header: "Rank", value: (p) => p.rank },
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Score", value: (p) => p.score },
    { header: "Correct answers", value: (p) => p.answers.filter((a) => a?.correct).length },
  ];
  game.questions.forEach((q, i) => {
    const n = i + 1;
    columns.push(
      {
        header: `Q${n} answer (${q.text})`,
        value: (p) => {
          const a = p.answers[i];
          return a ? ((q.type === "text" ? a.text : q.options[a.option]) ?? "") : "";
        },
      },
      {
        header: `Q${n} correct`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.correct ? "yes" : "no") : "no answer";
        },
      },
      { header: `Q${n} points`, value: (p) => p.answers[i]?.points ?? 0 },
      {
        header: `Q${n} time (s)`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.ms / 1000).toFixed(2) : "";
        },
      },
    );
  });
  return columns;
}

export function buildClassicResults(game: ClassicGame): ResultsSheet {
  return sheet(classicColumns(game), game.ranked());
}

export const classicMode: ModeEntry<"classic"> = {
  ...classicShared,
  lobbyControlError: (message) => message,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = new ClassicGame(lobby.quiz, lobby.lobbyView, {
      ...handoffOptions(ctx),
      pacing: lobby.pacing,
      shuffle: lobby.shuffle,
    });
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

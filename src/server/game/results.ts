import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Game } from "./game.ts";
import type { SubGame } from "./submarine.ts";
import type { TowerGame } from "./tower.ts";

function csvCell(v: string | number): string {
  const s = String(v);
  // Prefix formula-looking text so spreadsheets don't execute it.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

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
      if (a) row.push(q.options[a.option] ?? "", a.correct ? "yes" : "no", a.points, (a.ms / 1000).toFixed(2));
      else row.push("", "no answer", 0, "");
    });
    return row;
  });
  return toCsv([header, ...rows]);
}

function toCsv(rows: (string | number)[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Tallest Tower: one row per player, grouped by team in final team order. */
export function buildTowerResultsCsv(game: TowerGame): string {
  const header = ["Team", "Team rank", "Team floors", "Team blocks", "Nickname", "Correct", "Wrong", "Accuracy %", "Blocks placed", "Blocks missed", "Monster hatched"];
  const rows: (string | number)[][] = [];
  for (const t of game.rankedTeams()) {
    const members = [...game.players.values()].filter((p) => p.team === t.index).sort((a, b) => b.placed - a.placed || b.correct - a.correct);
    for (const p of members) {
      const answered = p.correct + p.wrong;
      rows.push([t.name, t.rank, t.floors, t.placed, p.nickname, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.placed, p.missed, p.hatched]);
    }
  }
  return toCsv([header, ...rows]);
}

/** Submarine Squad: one row per player; the squad's final depth is in every row. */
export function buildSubResultsCsv(game: SubGame): string {
  const header = ["Nickname", "Correct", "Wrong", "Boosts", "Dive taps (correct)", "Instructor rounds", "Squad depth (m)", "Level reached"];
  const rows: (string | number)[][] = [...game.players.values()]
    .sort((a, b) => b.boosts - a.boosts || b.correct - a.correct)
    .map((p) => [p.nickname, p.correct, p.wrong, p.boosts, p.diveHits, p.instructorRounds, game.depth, game.level]);
  return toCsv([header, ...rows]);
}

export function resultsFileName(game: { quizId: string }, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${stamp}_${game.quizId}.csv`;
}

export function writeResultsFile(game: { quizId: string }, csv: string, resultsDir: string): string {
  const file = join(resultsDir, resultsFileName(game));
  writeFileSync(file, csv);
  return file;
}

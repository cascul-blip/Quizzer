import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Game } from "./game.ts";

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
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function resultsFileName(game: Game, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${stamp}_${game.quizId}.csv`;
}

export function writeResultsFile(game: Game, csv: string, resultsDir: string): string {
  const file = join(resultsDir, resultsFileName(game));
  writeFileSync(file, csv);
  return file;
}

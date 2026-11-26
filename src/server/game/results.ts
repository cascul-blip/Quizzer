import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type Cell = string | number;

/** why: Excel only reads the CSV as UTF-8 when it starts with a BOM. */
export const BOM = "\ufeff";

export interface Column<Row> {
  header: string;
  value(row: Row): Cell;
}

export interface ResultsSheet {
  header: string[];
  rows: Cell[][];
  appendix?: Cell[][];
}

export function sheet<Row>(columns: readonly Column<Row>[], rowsInRankOrder: Iterable<Row>, appendix?: Cell[][]): ResultsSheet {
  return { header: columns.map((c) => c.header), rows: [...rowsInRankOrder].map((r) => columns.map((c) => c.value(r))), appendix };
}

export function accuracy(p: { correct: number; wrong: number }): Cell {
  const answered = p.correct + p.wrong;
  return answered ? Math.round((p.correct / answered) * 100) : "";
}

export function records(s: ResultsSheet): Record<string, Cell>[] {
  return s.rows.map((r) => Object.fromEntries(s.header.map((h, i) => [h, r[i]!])));
}

function csvCell(v: Cell): string {
  const s = String(v);
  // why: prefix formula-looking text so spreadsheets don't execute it.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function resultsCsv(s: ResultsSheet): string {
  s.rows.forEach((r, i) => {
    if (r.length !== s.header.length) throw new Error(`Results row ${i + 1} has ${r.length} cells for ${s.header.length} columns`);
  });
  return toCsv([s.header, ...s.rows, ...(s.appendix ? [[], ...s.appendix] : [])]);
}

function resultsFileName(game: { quizId: string }, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${stamp}_${game.quizId}.csv`;
}

export function writeResultsFile(game: { quizId: string }, csv: string, resultsDir: string): string {
  const file = join(resultsDir, resultsFileName(game));
  writeFileSync(file, csv);
  return file;
}

/** why: CSV validation or file errors must not prevent the game from finishing or the host from downloading the available rows. */
export function saveResults(game: { quizId: string }, s: ResultsSheet, resultsDir: string, log: (msg: string) => void): { csv: string; file: string | null } {
  let csv: string;
  try {
    csv = resultsCsv(s);
  } catch (e) {
    log(`Could not save results: ${(e as Error).message}`);
    return { csv: toCsv([s.header, ...s.rows]), file: null };
  }
  try {
    const file = writeResultsFile(game, csv, resultsDir);
    log(`Results saved to ${file}`);
    return { csv, file };
  } catch (e) {
    log(`Could not save results: ${(e as Error).message}`);
    return { csv, file: null };
  }
}

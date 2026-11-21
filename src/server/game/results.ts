import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type Cell = string | number;

/** Byte order mark the results CSV starts with, so Excel opens UTF-8 correctly. */
export const BOM = "\ufeff";

/** One results column: its header and how to read its cell from a row. */
export interface Column<Row> {
  header: string;
  value(row: Row): Cell;
}

/** A mode's finished results, ready to write as a CSV. */
export interface ResultsSheet {
  header: string[];
  rows: Cell[][];
  /** Extra lines after a blank line, such as a per-wave log; free-form. */
  appendix?: Cell[][];
}

/** Builds a sheet from a mode's columns and its rows, already in rank order. */
export function sheet<Row>(columns: readonly Column<Row>[], rows: Iterable<Row>, appendix?: Cell[][]): ResultsSheet {
  return { header: columns.map((c) => c.header), rows: [...rows].map((r) => columns.map((c) => c.value(r))), appendix };
}

/** Percent correct, or empty when the player answered nothing. */
export function accuracy(p: { correct: number; wrong: number }): Cell {
  const answered = p.correct + p.wrong;
  return answered ? Math.round((p.correct / answered) * 100) : "";
}

/** Each row as header → cell, for checking values by column. */
export function records(s: ResultsSheet): Record<string, Cell>[] {
  return s.rows.map((r) => Object.fromEntries(s.header.map((h, i) => [h, r[i]!])));
}

function csvCell(v: Cell): string {
  const s = String(v);
  // Prefix formula-looking text so spreadsheets don't execute it.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows as a CSV file for spreadsheets: cells quoted where needed, UTF-8 with a BOM. */
export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The sheet as a CSV; throws when a row's length differs from the header's. */
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

/**
 * Writes the game's results to the results folder and logs where. Never throws, so the game still finishes:
 * file is null when the sheet is malformed or writing failed, and csv then holds whatever rows could be written.
 */
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

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { SiegeRecord } from "../shared/protocol.ts";
import { siegeRecordsPath } from "./paths.ts";

type Records = Record<string, SiegeRecord>;

function isRecord(v: unknown): v is SiegeRecord {
  const r = v as SiegeRecord;
  return !!r && typeof r === "object" && Number.isFinite(r.waves) && Number.isFinite(r.avgScale) && typeof r.date === "string";
}

function readAll(dataDir: string): Records {
  const file = siegeRecordsPath(dataDir);
  if (!existsSync(file)) return {};
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => isRecord(v))) as Records;
  } catch {
    return {};
  }
}

/** The class's best Kingdom Siege Endless run on this quiz, or null. A missing or broken file counts as no record. */
export function loadSiegeRecord(dataDir: string, quizId: string): SiegeRecord | null {
  return readAll(dataDir)[quizId] ?? null;
}

/** Save a new best run for this quiz (written to a temp file first, so a crash can't leave half a file). */
export function saveSiegeRecord(dataDir: string, quizId: string, record: SiegeRecord): void {
  const all = readAll(dataDir);
  all[quizId] = record;
  const file = siegeRecordsPath(dataDir);
  writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2));
  renameSync(`${file}.tmp`, file);
}

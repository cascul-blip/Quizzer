import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { SiegeRecord } from "../shared/modes/siege.ts";
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
    // why: a damaged records file should never prevent an Endless run from starting.
    return {};
  }
}

export function loadSiegeRecord(dataDir: string, quizId: string): SiegeRecord | null {
  return readAll(dataDir)[quizId] ?? null;
}

export function saveSiegeRecord(dataDir: string, quizId: string, record: SiegeRecord): void {
  const all = readAll(dataDir);
  all[quizId] = record;
  const file = siegeRecordsPath(dataDir);
  writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2));
  // why: a crash during the write must leave previous quiz records readable.
  renameSync(`${file}.tmp`, file);
}

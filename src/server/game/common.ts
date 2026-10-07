import { ERRORS_SHOWN, TEAMS, type QuestionError, type TeamInfo } from "../../shared/protocol.ts";

// Building blocks shared by every game mode.

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const MAX_PLAYERS = 200;
export const MAX_NICKNAME = 20;

export class GameError extends Error {}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Shuffle a question's options; correct indices are remapped. True/False keeps its familiar order. */
export function shuffleOptions<Q extends { type: string; options: string[]; correct: number[] }>(q: Q, rng: () => number): Q {
  if (q.type === "true_false") return q;
  const order = shuffle(q.options.map((_, i) => i), rng);
  return { ...q, options: order.map((i) => q.options[i]!), correct: q.correct.map((c) => order.indexOf(c)).sort((a, b) => a - b) };
}

export function cleanNickname(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("Please enter a nickname");
  const name = raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim();
  if (!name) throw new GameError("Please enter a nickname");
  if ([...name].length > MAX_NICKNAME) throw new GameError(`Nickname must be at most ${MAX_NICKNAME} characters`);
  return name;
}

/** The questions with the most wrong answers, worst first (ties in quiz order); questions nobody got wrong are left out. */
export function topErrors(questions: { text: string; options: string[]; correct: number[] }[], wrongCounts: number[], limit = ERRORS_SHOWN): QuestionError[] {
  return questions
    .map((q, i) => ({ wrong: wrongCounts[i] ?? 0, text: q.text, answers: q.correct.map((c) => q.options[c]!), i }))
    .filter((e) => e.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.i - b.i)
    .slice(0, limit)
    .map(({ i, ...e }) => e);
}

export function teamInfo(index: number): TeamInfo {
  const t = TEAMS[index % TEAMS.length]!;
  return { index, name: t.name, color: t.color };
}

/** Round-robin by join order: 1st player → team 0, 2nd → team 1, … */
export function assignTeams(count: number, teamCount: number): number[] {
  return Array.from({ length: count }, (_, i) => i % Math.max(1, teamCount));
}

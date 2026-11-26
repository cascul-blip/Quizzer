import type { QuestionError, TeamInfo } from "../../shared/mode-views.ts";
import type { ShuffleOptions } from "../../shared/protocol.ts";
import { ERRORS_SHOWN, TEAMS } from "../../shared/protocol.ts";
import type { Question } from "../../shared/quiz-schema.ts";

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
/** why: one device can't hold the server or fill the roster; loopback is exempt. */
export const MAX_SOCKETS_PER_ADDRESS = 8;
export const MAX_JOINS_PER_ADDRESS = 3;
const MAX_NICKNAME = 20;

export class GameError extends Error {}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** why: True/False keeps its familiar order and pin spots stay put; correct indices are remapped. */
export function shuffleOptions<Q extends { type: string; options: string[]; correct: number[] }>(q: Q, rng: () => number): Q {
  if (q.type === "true_false" || q.type === "text" || q.type === "pin") return q;
  const order = shuffle(
    q.options.map((_, i) => i),
    rng,
  );
  return { ...q, options: order.map((i) => q.options[i]!), correct: q.correct.map((c) => order.indexOf(c)).sort((a, b) => a - b) };
}

export function cleanNickname(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("Please enter a nickname");
  const name = raw
    .replace(/[\p{C}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) throw new GameError("Please enter a nickname");
  if ([...name].length > MAX_NICKNAME) throw new GameError(`Nickname must be at most ${MAX_NICKNAME} characters`);
  return name;
}

/** why: worst first, ties in quiz order; questions nobody got wrong are left out. */
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

export function assignTeams(count: number, teamCount: number): number[] {
  return Array.from({ length: count }, (_, i) => i % Math.max(1, teamCount));
}

export const AUTO_REVEAL_MS = 5000;
/** why: answers sent just before the deadline may arrive slightly after it. */
export const GRACE_MS = 500;

/** why: same order for everyone in the game; correct indices are remapped. */
export function preparePlayOrder(source: Question[], opts: ShuffleOptions, rng: () => number = Math.random): Question[] {
  let questions = source.map((q) => ({ ...q, options: [...q.options], correct: [...q.correct] }));
  if (opts.questions) questions = shuffle(questions, rng);
  if (opts.answers) questions = questions.map((q) => shuffleOptions(q, rng));
  return questions;
}

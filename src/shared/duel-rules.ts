export type DuelOutcome = "win" | "lose" | "stay";

export interface DuelAnswerInfo {
  /** why: null means didn't answer (or was away). */
  correct: boolean | null;
  answerDurationMs: number | null;
}

export function pairArenas<T>(order: readonly T[]): T[][] {
  const arenas: T[][] = [];
  if (order.length === 0) return arenas;
  if (order.length < 4) return [[...order]];
  const pairs = Math.floor(order.length / 2);
  for (let i = 0; i < pairs; i++) arenas.push(order.slice(2 * i, 2 * i + 2));
  if (order.length % 2 === 1) arenas[pairs - 1]!.push(order[order.length - 1]!);
  return arenas;
}

const AnswerRank = { RIGHT: 0, WRONG: 1, NO_ANSWER: 2 } as const;
const tier = (d: DuelAnswerInfo) => (d.correct === true ? AnswerRank.RIGHT : d.correct === false ? AnswerRank.WRONG : AnswerRank.NO_ANSWER);

export function compareDuelists(a: DuelAnswerInfo, b: DuelAnswerInfo): number {
  const t = tier(a) - tier(b);
  if (tier(a) !== tier(b) || tier(a) === AnswerRank.NO_ANSWER) return t;
  const am = a.answerDurationMs ?? Number.MAX_SAFE_INTEGER;
  const bm = b.answerDurationMs ?? Number.MAX_SAFE_INTEGER;
  return am - bm;
}

export function duelOutcome(duelists: readonly DuelAnswerInfo[]): { outcomes: DuelOutcome[]; draw: boolean } {
  const outcomes: DuelOutcome[] = duelists.map(() => "stay");
  if (duelists.length < 2) return { outcomes, draw: false };
  if (!duelists.some((d) => d.correct === true)) return { outcomes, draw: true };
  const idx = duelists.map((_, i) => i).sort((a, b) => compareDuelists(duelists[a]!, duelists[b]!) || a - b);
  const n = idx.length;
  if (compareDuelists(duelists[idx[0]!]!, duelists[idx[1]!]!) < 0) outcomes[idx[0]!] = "win";
  if (compareDuelists(duelists[idx[n - 2]!]!, duelists[idx[n - 1]!]!) < 0) outcomes[idx[n - 1]!] = "lose";
  return { outcomes, draw: !outcomes.includes("win") && !outcomes.includes("lose") };
}

export function climbLadder<T>(order: readonly T[], arenas: readonly (readonly T[])[], outcomes: readonly (readonly DuelOutcome[])[]): T[] {
  const sorted = arenas.map((arena, k) => {
    const out = outcomes[k] ?? [];
    const rank = (i: number) => (out[i] === "win" ? 0 : out[i] === "lose" ? 2 : 1);
    return arena
      .map((id, i) => ({ id, i }))
      .sort((a, b) => rank(a.i) - rank(b.i) || a.i - b.i)
      .map((e) => e.id);
  });
  const ladder = sorted.flat();
  let end = 0;
  for (let k = 0; k < arenas.length - 1; k++) {
    end += arenas[k]!.length;
    const upperLoses = (outcomes[k] ?? []).includes("lose");
    const lowerWins = (outcomes[k + 1] ?? []).includes("win");
    if (upperLoses && lowerWins) [ladder[end - 1], ladder[end]] = [ladder[end]!, ladder[end - 1]!];
  }
  const placed = new Set(ladder);
  return [...ladder, ...order.filter((id) => !placed.has(id))];
}

export function arenaPoints(arenaNumber: number, arenaCount: number): number {
  return Math.max(1, arenaCount - arenaNumber + 1);
}

export function arenaOf<T>(order: readonly T[]): Map<T, number> {
  const map = new Map<T, number>();
  pairArenas(order).forEach((arena, k) => arena.forEach((id) => map.set(id, k + 1)));
  return map;
}

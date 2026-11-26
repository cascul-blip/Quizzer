export type DuelOutcome = "win" | "lose" | "stay";

export interface DuelAnswerInfo {
  /** why: null means didn't answer (or was away). */
  correct: boolean | null;
  answerDurationMs: number | null;
}

/** why: an odd count makes the bottom arena a 3-way duel; under 4 players share one arena. */
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

/** why: negative when `a` did better (comparator contract). */
export function compareDuelists(a: DuelAnswerInfo, b: DuelAnswerInfo): number {
  const t = tier(a) - tier(b);
  if (tier(a) !== tier(b) || tier(a) === AnswerRank.NO_ANSWER) return t;
  const am = a.answerDurationMs ?? Number.MAX_SAFE_INTEGER;
  const bm = b.answerDurationMs ?? Number.MAX_SAFE_INTEGER;
  return am - bm;
}

/** why: only a strict best wins and a strict worst loses, so exact ties stay; nobody right is a draw. */
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

/** why: a boundary swaps only when the upper arena has a loser and the lower a winner; late joiners go last. */
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

/** why: `arena` is 1-based from the top, so the bottom arena is worth 1. */
export function arenaPoints(arena: number, arenaCount: number): number {
  return Math.max(1, arenaCount - arena + 1);
}

/** why: arenas are 1-based. */
export function arenaOf<T>(order: readonly T[]): Map<T, number> {
  const map = new Map<T, number>();
  pairArenas(order).forEach((arena, k) => arena.forEach((id) => map.set(id, k + 1)));
  return map;
}

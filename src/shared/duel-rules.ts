// Showdown: the arena ladder as pure functions.
// Used by the server engine and by the screens (to explain and replay a round).
// No imports on purpose: this file must stay usable from both sides.

/** What a duel did to one duelist: "win" moves up a boundary, "lose" moves down. */
export type DuelOutcome = "win" | "lose" | "stay";

/** One duelist's answer as the rules see it. */
export interface DuelAnswerInfo {
  /** Null: didn't answer (or was away). */
  correct: boolean | null;
  /** Answer time from the question opening; null if they didn't answer. */
  ms: number | null;
}

/**
 * Pair the ladder from the top: Arena 1 gets the first two, Arena 2 the next two, …
 * With an odd count the bottom arena is a 3-way duel; a single player gets an arena of their own.
 */
export function pairArenas<T>(order: readonly T[]): T[][] {
  const arenas: T[][] = [];
  if (order.length === 0) return arenas;
  if (order.length < 4) return [[...order]];
  const pairs = Math.floor(order.length / 2);
  for (let i = 0; i < pairs; i++) arenas.push(order.slice(2 * i, 2 * i + 2));
  if (order.length % 2 === 1) arenas[pairs - 1]!.push(order[order.length - 1]!);
  return arenas;
}

/** 0 right, 1 wrong, 2 no answer. */
const tier = (d: DuelAnswerInfo) => (d.correct === true ? 0 : d.correct === false ? 1 : 2);

/** Negative when `a` did better: right before wrong before no answer, then the faster one. */
export function compareDuelists(a: DuelAnswerInfo, b: DuelAnswerInfo): number {
  const t = tier(a) - tier(b);
  if (t !== 0 || tier(a) === 2) return t;
  const am = a.ms ?? Number.MAX_SAFE_INTEGER;
  const bm = b.ms ?? Number.MAX_SAFE_INTEGER;
  return am - bm;
}

/**
 * Who won one arena. Nobody right → draw (everyone stays). Otherwise the strictly best duelist wins
 * and the strictly worst loses; anyone else (a 3-way duel's middle player, or an exact tie) stays.
 * Among the wrong, no answer is worse than a wrong answer, then the later answer is worse.
 * A duelist alone in an arena just stays (not a draw).
 */
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

/**
 * The ladder after a round. `arenas` are the round's arenas (top first) and `outcomes` their results, index for index.
 * Within each arena the winner moves to its top and the loser to its bottom; then at each boundary the upper
 * arena's loser swaps with the lower arena's winner, only when both exist (a draw blocks the boundary).
 * Arena 1's winner stays on top and the bottom arena's loser stays at the bottom.
 * Players in `order` who weren't in any arena (late joiners) keep their order after everyone who was.
 */
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
    // The loser is the last of the upper arena and the winner the first of the lower one: adjacent places.
    if (upperLoses && lowerWins) [ladder[end - 1], ladder[end]] = [ladder[end]!, ladder[end - 1]!];
  }
  const placed = new Set(ladder);
  return [...ladder, ...order.filter((id) => !placed.has(id))];
}

/** 1-based arena of each player in a ladder order. */
export function arenaOf<T>(order: readonly T[]): Map<T, number> {
  const map = new Map<T, number>();
  pairArenas(order).forEach((arena, k) => arena.forEach((id) => map.set(id, k + 1)));
  return map;
}

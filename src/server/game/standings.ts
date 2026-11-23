/** One step of a comparison order: entries compared by a number, larger or smaller first. */
export type RankKey<T> = (a: T, b: T) => number;

const cmp = (x: number, y: number) => (x < y ? -1 : x > y ? 1 : 0);

/** An entry with its place in the standings. */
export type Ranked<T> = T & { rank: number };

/** The larger value ranks higher. */
export function most<T>(value: (t: T) => number): RankKey<T> {
  return (a, b) => cmp(value(b), value(a));
}

/** The smaller value ranks higher. */
export function fewest<T>(value: (t: T) => number): RankKey<T> {
  return (a, b) => cmp(value(a), value(b));
}

/**
 * Standings: entries sorted by a mode's comparison order, with competition ranks (1, 2, 2, 4).
 * Entries equal on every key of `order` share a place. `then` only orders entries within a shared place.
 * The sort is stable, so entries equal on every key keep their input order.
 */
export function rankBy<T extends object>(items: readonly T[], order: RankKey<T>[], then: RankKey<T>[] = []): Ranked<T>[] {
  const by = (keys: RankKey<T>[]) => (a: T, b: T) => {
    for (const key of keys) {
      const c = key(a, b);
      if (c !== 0) return c;
    }
    return 0;
  };
  const place = by(order);
  const sorted = [...items].sort(by([...order, ...then]));
  let rank = 0;
  return sorted.map((item, i) => {
    if (i === 0 || place(sorted[i - 1]!, item) !== 0) rank = i + 1;
    return { ...item, rank };
  });
}

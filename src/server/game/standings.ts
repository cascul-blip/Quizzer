export type RankKey<T> = (a: T, b: T) => number;

const cmp = (x: number, y: number) => (x < y ? -1 : x > y ? 1 : 0);

export type Ranked<T> = T & { rank: number };

export function most<T>(value: (t: T) => number): RankKey<T> {
  return (a, b) => cmp(value(b), value(a));
}

export function fewest<T>(value: (t: T) => number): RankKey<T> {
  return (a, b) => cmp(value(a), value(b));
}

/** why: competition ranks (1, 2, 2, 4); `then` only orders within a shared place, and the stable sort keeps input order for full ties. */
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

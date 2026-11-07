/** Shared reveal timing and outcomes for host and phone snowball scenes. */
export const SNOW_RELEASE_MS = 930;
export const SNOW_IMPACT_MS = 1450;
export const SNOW_PUFF_MS = 650;
export const SNOW_END_MS = 2350;

export function snowballFrame(t: number): number {
  if (t < 590) return 0;
  if (t < 710) return 1;
  if (t < 840) return 2;
  if (t < SNOW_RELEASE_MS) return 3;
  if (t < 1060) return 4;
  if (t < 1220) return 5;
  return 6;
}

/** A draw misses everyone; in a three-way round only the loser is struck. */
export function snowballShots(people: readonly { outcome: "win" | "lose" | "stay" }[], draw: boolean): { from: number; to: number; miss: boolean }[] {
  if (draw) return people.map((_, i) => ({ from: i, to: (i + 1) % people.length, miss: true })).filter(s => s.from !== s.to);
  const from = people.findIndex(p => p.outcome === "win");
  const to = people.findIndex(p => p.outcome === "lose");
  if (from >= 0 && to >= 0) return [{ from, to, miss: false }];
  // A tied bottom has no loser to hit. Tied leaders may both hit the sole loser.
  if (from >= 0 && people.length > 1) return [{ from, to: (from + 1) % people.length, miss: true }];
  if (to >= 0) return people.flatMap((_, i) => i === to ? [] : [{ from: i, to, miss: false }]);
  return [];
}

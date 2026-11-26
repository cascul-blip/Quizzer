const MAX_POINTS = 1000;

/** why: Kahoot-style, falling linearly to half points at the time limit. */
export function scoreAnswer(correct: boolean, elapsedMs: number, timeLimitSec: number): number {
  if (!correct) return 0;
  const limitMs = timeLimitSec * 1000;
  const t = Math.min(Math.max(elapsedMs, 0), limitMs) / limitMs;
  return Math.round(MAX_POINTS * (1 - t / 2));
}

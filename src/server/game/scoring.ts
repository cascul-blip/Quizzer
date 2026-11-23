const MAX_POINTS = 1000;

/**
 * Kahoot-style speed scoring: a correct answer is worth 1000 points when given
 * instantly, falling linearly to 500 at the time limit. Wrong answers score 0.
 */
export function scoreAnswer(correct: boolean, elapsedMs: number, timeLimitSec: number): number {
  if (!correct) return 0;
  const limitMs = timeLimitSec * 1000;
  const t = Math.min(Math.max(elapsedMs, 0), limitMs) / limitMs;
  return Math.round(MAX_POINTS * (1 - t / 2));
}

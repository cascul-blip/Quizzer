export const MAX_POINTS = 1000;

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

/** Standard competition ranking (1, 2, 2, 4): ties share a rank. */
export function rankScores<T extends { score: number }>(items: T[]): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((item, i) => {
    if (item.score !== prev) {
      rank = i + 1;
      prev = item.score;
    }
    return { ...item, rank };
  });
}

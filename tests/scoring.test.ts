import { describe, expect, test } from "bun:test";
import { rankScores, scoreAnswer } from "../src/server/game/scoring.ts";

describe("scoreAnswer", () => {
  test("instant correct answer earns the maximum", () => expect(scoreAnswer(true, 0, 20)).toBe(1000));
  test("correct at the time limit earns half", () => expect(scoreAnswer(true, 20_000, 20)).toBe(500));
  test("halfway earns 750", () => expect(scoreAnswer(true, 10_000, 20)).toBe(750));
  test("late (grace period) answers are clamped to the limit", () => expect(scoreAnswer(true, 20_400, 20)).toBe(500));
  test("negative elapsed is clamped to zero", () => expect(scoreAnswer(true, -50, 20)).toBe(1000));
  test("wrong answers score zero", () => expect(scoreAnswer(false, 0, 20)).toBe(0));
});

describe("rankScores", () => {
  test("ties share a rank and the next rank skips", () => {
    const r = rankScores([
      { n: "a", score: 10 },
      { n: "b", score: 30 },
      { n: "c", score: 30 },
      { n: "d", score: 5 },
    ]);
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });
});

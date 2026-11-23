import { describe, expect, test } from "bun:test";
import { fewest, most, rankBy } from "../src/server/game/standings.ts";

describe("Standings", () => {
  test("an empty list ranks to an empty list", () => {
    expect(rankBy([], [most((x: { score: number }) => x.score)])).toEqual([]);
  });

  test("ties share a place and the next place skips (1, 2, 2, 4)", () => {
    const r = rankBy(
      [
        { n: "a", score: 10 },
        { n: "b", score: 30 },
        { n: "c", score: 30 },
        { n: "d", score: 5 },
      ],
      [most((x) => x.score)],
    );
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });

  test("a multi-key order: the second key splits a tie on the first", () => {
    const r = rankBy(
      [
        { n: "a", floors: 2, placed: 5 },
        { n: "b", floors: 3, placed: 1 },
        { n: "c", floors: 2, placed: 9 },
        { n: "d", floors: 2, placed: 5 },
      ],
      [most((x) => x.floors), most((x) => x.placed)],
    );
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
      ["d", 3],
    ]);
  });

  test("fewest puts the smaller value first, and Infinity compares", () => {
    const r = rankBy(
      [
        { n: "a", v: Infinity },
        { n: "b", v: 1 },
        { n: "c", v: Infinity },
      ],
      [fewest((x) => x.v)],
    );
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
    ]);
  });

  test("entries equal on every key keep their input order (the sort is stable)", () => {
    const r = rankBy(
      [
        { n: "a", score: 5, correct: 1 },
        { n: "b", score: 9, correct: 0 },
        { n: "c", score: 5, correct: 1 },
        { n: "d", score: 5, correct: 2 },
        { n: "e", score: 5, correct: 1 },
      ],
      [most((x) => x.score)],
      [most((x) => x.correct)],
    );
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["b", 1],
      ["d", 2],
      ["a", 2],
      ["c", 2],
      ["e", 2],
    ]);
  });

  test("a display order sorts within a shared place without splitting it", () => {
    const r = rankBy(
      [
        { n: "a", score: 5, correct: 1 },
        { n: "b", score: 5, correct: 3 },
        { n: "c", score: 9, correct: 0 },
      ],
      [most((x) => x.score)],
      [most((x) => x.correct)],
    );
    expect(r.map((x) => [x.n, x.rank])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 2],
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import { arenaOf, climbLadder, compareDuelists, duelOutcome, pairArenas, type DuelAnswerInfo } from "../src/shared/duel-rules.ts";

const right = (ms: number): DuelAnswerInfo => ({ correct: true, ms });
const wrong = (ms: number): DuelAnswerInfo => ({ correct: false, ms });
const none: DuelAnswerInfo = { correct: null, ms: null };

describe("pairArenas", () => {
  test("pairs from the top; an odd count makes the bottom arena a 3-way duel", () => {
    expect(pairArenas([])).toEqual([]);
    expect(pairArenas(["a"])).toEqual([["a"]]);
    expect(pairArenas(["a", "b"])).toEqual([["a", "b"]]);
    expect(pairArenas(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
    expect(pairArenas(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
    expect(pairArenas(["a", "b", "c", "d", "e"])).toEqual([["a", "b"], ["c", "d", "e"]]);
    expect(pairArenas([1, 2, 3, 4, 5, 6])).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(pairArenas([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2], [3, 4], [5, 6, 7]]);
    expect(pairArenas(Array.from({ length: 30 }, (_, i) => i))).toHaveLength(15);
  });

  test("arenaOf numbers each player's arena from 1", () => {
    expect([...arenaOf(["a", "b", "c", "d", "e"])]).toEqual([["a", 1], ["b", 1], ["c", 2], ["d", 2], ["e", 2]]);
  });
});

describe("duelOutcome (2-way)", () => {
  test("right beats wrong and no answer", () => {
    expect(duelOutcome([right(5000), wrong(1000)])).toEqual({ outcomes: ["win", "lose"], draw: false });
    expect(duelOutcome([none, right(9000)])).toEqual({ outcomes: ["lose", "win"], draw: false });
  });
  test("both right: faster wins; an exact tie is a draw", () => {
    expect(duelOutcome([right(3000), right(2999)])).toEqual({ outcomes: ["lose", "win"], draw: false });
    expect(duelOutcome([right(3000), right(3000)])).toEqual({ outcomes: ["stay", "stay"], draw: true });
  });
  test("both wrong or no answer: draw", () => {
    expect(duelOutcome([wrong(100), wrong(5000)])).toEqual({ outcomes: ["stay", "stay"], draw: true });
    expect(duelOutcome([wrong(100), none])).toEqual({ outcomes: ["stay", "stay"], draw: true });
    expect(duelOutcome([none, none])).toEqual({ outcomes: ["stay", "stay"], draw: true });
  });
  test("a duelist alone just stays (not a draw)", () => {
    expect(duelOutcome([right(100)])).toEqual({ outcomes: ["stay"], draw: false });
    expect(duelOutcome([])).toEqual({ outcomes: [], draw: false });
  });
});

describe("duelOutcome (3-way)", () => {
  test("best wins, worst loses, middle stays", () => {
    expect(duelOutcome([right(4000), right(2000), wrong(1000)])).toEqual({ outcomes: ["stay", "win", "lose"], draw: false });
    expect(duelOutcome([wrong(1000), right(9000), wrong(2000)])).toEqual({ outcomes: ["stay", "win", "lose"], draw: false });
  });
  test("among the wrong, no answer is worse than a wrong answer", () => {
    expect(duelOutcome([none, right(9000), wrong(9500)])).toEqual({ outcomes: ["lose", "win", "stay"], draw: false });
  });
  test("all wrong is a draw", () => {
    expect(duelOutcome([wrong(1000), none, wrong(500)])).toEqual({ outcomes: ["stay", "stay", "stay"], draw: true });
  });
  test("ties: nobody wins a tied top, nobody loses a tied bottom", () => {
    expect(duelOutcome([right(1000), none, none])).toEqual({ outcomes: ["win", "stay", "stay"], draw: false });
    expect(duelOutcome([right(1000), right(1000), wrong(1)])).toEqual({ outcomes: ["stay", "stay", "lose"], draw: false });
  });
  test("compareDuelists orders right < wrong < none, then by time", () => {
    expect(compareDuelists(right(9000), wrong(1))).toBeLessThan(0);
    expect(compareDuelists(wrong(9000), none)).toBeLessThan(0);
    expect(compareDuelists(wrong(1000), wrong(2000))).toBeLessThan(0);
    expect(compareDuelists(none, none)).toBe(0);
  });
});

describe("climbLadder", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));

  test("winners go up a boundary, losers down; Arena 1's winner and the bottom loser stay", () => {
    const order = ids(6); // [a b] [c d] [e f]
    const arenas = pairArenas(order);
    // a beats b, d beats c, f beats e
    const next = climbLadder(order, arenas, [["win", "lose"], ["lose", "win"], ["lose", "win"]]);
    // b ↔ d at boundary 1-2, c ↔ f at boundary 2-3
    expect(pairArenas(next)).toEqual([["a", "d"], ["b", "f"], ["c", "e"]]);
  });

  test("within an arena the winner moves to the top, so the ladder is the ranking", () => {
    expect(climbLadder(["a", "b"], [["a", "b"]], [["lose", "win"]])).toEqual(["b", "a"]);
    // A draw keeps the order.
    expect(climbLadder(["a", "b"], [["a", "b"]], [["stay", "stay"]])).toEqual(["a", "b"]);
  });

  test("a draw blocks both of its boundaries", () => {
    const order = ids(6);
    const next = climbLadder(order, pairArenas(order), [["win", "lose"], ["stay", "stay"], ["win", "lose"]]);
    expect(next).toEqual(order);
    const next2 = climbLadder(order, pairArenas(order), [["stay", "stay"], ["win", "lose"], ["lose", "win"]]);
    // Boundary 1-2 is blocked (draw above); boundary 2-3: d (lost) ↔ f (won).
    expect(pairArenas(next2)).toEqual([["a", "b"], ["c", "f"], ["d", "e"]]);
  });

  test("a 3-way bottom arena: its winner goes up, its loser stays at the bottom, the middle stays", () => {
    const order = ids(5); // [a b] [c d e]
    const next = climbLadder(order, pairArenas(order), [["lose", "win"], ["stay", "lose", "win"]]);
    expect(next).toEqual(["b", "e", "a", "c", "d"]);
    expect(pairArenas(next)).toEqual([["b", "e"], ["a", "c", "d"]]);
  });

  test("a lone duelist (after a kick) stays and blocks its boundaries", () => {
    const next = climbLadder(["a", "b", "c"], [["a", "b"], ["c"]], [["win", "lose"], ["stay"]]);
    expect(next).toEqual(["a", "b", "c"]);
  });

  test("players without an arena this round (late joiners) stay at the bottom in order", () => {
    const next = climbLadder(["a", "b", "c", "d", "x", "y"], [["a", "b"], ["c", "d"]], [["lose", "win"], ["win", "lose"]]);
    expect(next).toEqual(["b", "c", "a", "d", "x", "y"]);
  });

  test("one player, two players", () => {
    expect(climbLadder(["a"], [["a"]], [["stay"]])).toEqual(["a"]);
    expect(climbLadder(["a", "b"], [["a", "b"]], [["win", "lose"]])).toEqual(["a", "b"]);
  });
});

import { describe, expect, test } from "bun:test";
import { buildPodium, emptyPodium } from "../src/server/game/podium.ts";
import { most } from "../src/server/game/standings.ts";

type Player = { id: string; nickname: string; score: number; correct: number; moves: number; team: string };
const player = (id: string, score: number, extra: Partial<Player> = {}): Player => ({ id, nickname: id, score, correct: 0, moves: 0, team: "", ...extra });
const NO_AWARDS = { labels: {}, values: {} };

function solo(players: Player[], awards: { labels: Record<string, string>; values: Record<string, (p: Player) => number> } = NO_AWARDS) {
  return buildPodium({ entries: players, order: [most((p) => p.score)], then: [most((p) => p.correct)], players, entryOf: (p) => p, awards });
}

describe("Podium", () => {
  test("entries equal in the Standings order share a place, and the next place skips (1, 2, 2, 4)", () => {
    const podium = solo([player("Ann", 9), player("Bo", 5), player("Cy", 5), player("Di", 1)]);
    expect(podium.places.map((e) => [e.id, e.place])).toEqual([
      ["Ann", 1],
      ["Bo", 2],
      ["Cy", 2],
      ["Di", 4],
    ]);
    expect(podium.rows.map((r) => [r.player.nickname, r.place])).toEqual([
      ["Ann", 1],
      ["Bo", 2],
      ["Cy", 2],
      ["Di", 4],
    ]);
    expect(podium.result("Cy")).toEqual({ place: 2, playerCount: 4, awards: [] });
  });

  test("the extra order only orders entries within a shared place", () => {
    const podium = solo([player("Bo", 5), player("Ann", 9), player("Cy", 5, { correct: 3 })]);
    expect(podium.places.map((e) => [e.id, e.place])).toEqual([
      ["Ann", 1],
      ["Cy", 2],
      ["Bo", 2],
    ]);
  });

  test("a player's result is their team's place", () => {
    const teams = [
      { name: "Red", tiles: 2 },
      { name: "Blue", tiles: 7 },
    ];
    const players = [player("Ann", 0, { team: "Red" }), player("Bo", 0, { team: "Blue" }), player("Cy", 0, { team: "Red" })];
    const podium = buildPodium({
      entries: teams,
      order: [most((t) => t.tiles)],
      players,
      entryOf: (p) => teams.find((t) => t.name === p.team)!,
      awards: NO_AWARDS,
    });
    expect(podium.places.map((t) => [t.name, t.place])).toEqual([
      ["Blue", 1],
      ["Red", 2],
    ]);
    expect(podium.result("Ann")).toEqual({ place: 2, playerCount: 3, awards: [] });
    expect(podium.rows.map((r) => [r.player.nickname, r.place])).toEqual([
      ["Bo", 1],
      ["Ann", 2],
      ["Cy", 2],
    ]);
  });

  test("everyone tied on the highest value shares an award, and nobody gets it when the highest value is 0", () => {
    const podium = solo([player("Ann", 1, { correct: 4 }), player("Bo", 2, { correct: 4 }), player("Cy", 3, { correct: 1 })], {
      labels: { mostCorrect: "Most correct answers", mostMoves: "Fancy footwork" },
      values: { mostCorrect: (p) => p.correct, mostMoves: (p) => p.moves },
    });
    expect(podium.awards).toEqual({ mostCorrect: { value: 4, nicknames: ["Ann", "Bo"] }, mostMoves: null });
    expect(podium.result("Bo")!.awards).toEqual(["Most correct answers"]);
    expect(podium.result("Cy")!.awards).toEqual([]);
  });

  test("is unchanged when players change after it is built", () => {
    const ann = player("Ann", 1, { correct: 2 });
    const podium = solo([ann, player("Bo", 2)], { labels: { mostCorrect: "Most correct answers" }, values: { mostCorrect: (p) => p.correct } });
    ann.score = 10;
    ann.correct = 9;
    expect(podium.result("Ann")).toEqual({ place: 2, playerCount: 2, awards: ["Most correct answers"] });
    expect(podium.awards.mostCorrect).toEqual({ value: 2, nicknames: ["Ann"] });
    expect(podium.rows[1]!.player.correct).toBe(2);
  });

  test("a player not in the game has no result", () => {
    expect(solo([player("Ann", 1)]).result("Zed")).toBeNull();
  });

  test("an empty Podium has no places, rows or award winners, and no result for anyone", () => {
    const podium = emptyPodium<Player, Player, "mostCorrect">({ mostCorrect: "Most correct answers" });
    expect([podium.places, podium.rows, podium.awards, podium.result("Ann")]).toEqual([[], [], { mostCorrect: null }, null]);
  });
});

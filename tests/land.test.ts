import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { CONQUEST_MS, COUNTDOWN_MS, FEEDBACK_MS, LandGame, type LandPlayer } from "../src/server/game/land.ts";
import { buildLandResultsCsv } from "../src/server/game/results.ts";
import { EMPTY, hexDistance, neighbors } from "../src/shared/land-board.ts";
import { LAND_EMPTY_MS } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: 6 }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe", "never"],
      correct: [0],
    })),
  });
}

function setup(names: string[], opts: { teams?: number; minutes?: number } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("land");
  lobby.setLand({ teams: opts.teams ?? 2, minutes: opts.minutes ?? 5 });
  for (const n of names) lobby.join(n);
  const game = LandGame.fromLobby(lobby, { clock, onFinish: () => finished++ });
  return { clock, game, lobby, finished: () => finished };
}

function play(names: string[], opts?: Parameters<typeof setup>[1]) {
  const s = setup(names, opts);
  s.game.start();
  s.clock.advance(COUNTDOWN_MS);
  expect(s.game.phase).toBe("playing");
  return s;
}

const byName = (game: LandGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: LandGame, clock: FakeClock, p: LandPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

/** Answer one round of questions, `right` of them correctly. */
function round(game: LandGame, clock: FakeClock, p: LandPlayer, right: number) {
  for (let i = 0; i < 3; i++) answer(game, clock, p, i < right);
}

/** Put the player on the land with plenty of claims (skipping the questions). */
function fund(p: LandPlayer, claims = 99) {
  p.claims = claims;
  p.state = "claim";
}

const ringAround = (game: LandGame, tile: number, radius: number) => game.owners.map((_, t) => t).filter((t) => hexDistance(game.size, tile, t) === radius);

describe("lobby → land", () => {
  test("settings are validated and teams are previewed", () => {
    const { lobby } = setup(["A", "B", "C"], { teams: 3 });
    expect(lobby.hostView().teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["A"], ["B"], ["C"]]);
    expect(() => lobby.setLand({ teams: 1, minutes: 5 })).toThrow();
    expect(() => lobby.setLand({ teams: 7, minutes: 5 })).toThrow();
    expect(() => lobby.setLand({ teams: 2, minutes: 4 })).toThrow();
    for (const minutes of [3, 5, 7, 10]) lobby.setLand({ teams: 2, minutes });
    expect(lobby.hostView().land).toEqual({ teams: 2, minutes: 10 });
  });

  test("board size follows the team count and each team owns its starting tile", () => {
    for (const [teams, size] of [[2, 10], [4, 12], [6, 14]] as const) {
      const { game } = setup(["A"], { teams });
      const v = game.hostView();
      expect(v.board.size).toBe(size);
      expect(v.board.owners).toHaveLength(size * size);
      expect(v.board.starts.map((s) => v.board.owners[s.tile])).toEqual(Array.from({ length: teams }, (_, i) => i));
      expect(v.teams.map((t) => t.tiles)).toEqual(Array(teams).fill(1));
    }
  });
});

describe("rounds of questions", () => {
  test("after 3 answers the player goes to the land with one claim per correct answer", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, false);
    expect(a.state).toBe("question");
    expect(game.playerView(a.id)!).toMatchObject({ state: "question", claims: 1, answered: 2, board: null });
    answer(game, clock, a, true);
    const v = game.playerView(a.id)!;
    expect(v).toMatchObject({ state: "claim", claims: 2, answered: 0, question: null });
    expect(v.board!.size).toBe(10);
    // No questions while on the land.
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
  });

  test("no correct answers: the message shows for 4 s, then questions come back", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    answer(game, clock, a, false);
    answer(game, clock, a, false);
    const cur = a.current!;
    game.answer(a.id, cur.seq, 1);
    expect(game.playerView(a.id)!).toMatchObject({ state: "empty", emptyMs: FEEDBACK_MS + LAND_EMPTY_MS, question: null, board: null });
    clock.advance(FEEDBACK_MS + LAND_EMPTY_MS - 1);
    expect(a.state).toBe("empty");
    expect(game.place(a.id, 0)).toBe(false);
    clock.advance(1);
    expect(game.playerView(a.id)!).toMatchObject({ state: "question", answered: 0 });
    expect(game.playerView(a.id)!.question).not.toBeNull();
  });

  test("banked claims skip the message", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    round(game, clock, a, 1);
    expect(game.done(a.id)).toBe(true);
    expect(a.state).toBe("question");
    round(game, clock, a, 0);
    expect(game.playerView(a.id)!).toMatchObject({ state: "claim", claims: 1 });
  });
});

describe("placing tiles", () => {
  test("a tile costs one claim; the player returns to questions when they run out", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    round(game, clock, a, 2);
    expect(game.place(a.id, 0)).toBe(true);
    expect(game.owners[0]).toBe(0);
    expect(game.playerView(a.id)!).toMatchObject({ state: "claim", claims: 1, teamTiles: 2 });
    expect(game.place(a.id, 0)).toBe(false); // already ours
    expect(game.place(a.id, 1)).toBe(true);
    expect(game.playerView(a.id)!).toMatchObject({ state: "question", claims: 0, teamTiles: 3, me: { placed: 2, stolen: 0 } });
    expect(game.hostView().lastPlace).toMatchObject({ tile: 1, team: 0, stolen: false });
    expect(game.place(a.id, 2)).toBe(false);
  });

  test("stealing costs 2 claims; one claim isn't enough", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    round(game, clock, b, 1);
    game.place(b.id, 55);
    round(game, clock, a, 1);
    expect(game.place(a.id, 55)).toBe(false);
    expect(game.done(a.id)).toBe(true);
    round(game, clock, a, 2);
    expect(a.claims).toBe(3);
    expect(game.place(a.id, 55)).toBe(true);
    expect(game.owners[55]).toBe(0);
    expect(a).toMatchObject({ claims: 1, stolen: 1, state: "claim" });
    expect(game.hostView().lastPlace).toMatchObject({ tile: 55, stolen: true });
  });

  test("tiles on or next to an opposing start are refused", () => {
    const { game } = play(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    fund(a);
    fund(b);
    const blueStart = game.teams[1]!.start;
    expect(game.place(a.id, blueStart)).toBe(false);
    for (const n of neighbors(game.size, blueStart)) expect(game.place(a.id, n)).toBe(false);
    expect(game.place(b.id, neighbors(game.size, blueStart)[0]!)).toBe(true);
    expect(game.place(a.id, -1)).toBe(false);
    expect(game.place(a.id, 1000)).toBe(false);
  });

  test("a player with claims but nothing affordable goes straight back to questions", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    // The whole board is Blue's, apart from the starts.
    game.owners.forEach((o, t) => {
      if (o === EMPTY) game.owners[t] = 1;
    });
    round(game, clock, a, 1);
    expect(a).toMatchObject({ state: "question", claims: 1 });
    round(game, clock, a, 1);
    expect(a).toMatchObject({ state: "claim", claims: 2 });
  });
});

describe("surrounding", () => {
  test("closing a ring captures everything inside, including enemy tiles", () => {
    const { game } = play(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    fund(a);
    fund(b);
    const mid = 8 * 10 + 4;
    game.place(b.id, mid);
    const ring = neighbors(game.size, mid);
    for (const t of ring.slice(1)) game.place(a.id, t);
    expect(game.owners[mid]).toBe(1);
    expect(game.hostView().lastCapture).toBeNull();
    game.place(a.id, ring[0]!);
    expect(game.owners[mid]).toBe(0);
    expect(game.hostView().lastCapture).toMatchObject({ team: 0, nickname: "A", tiles: [mid], knockedOut: [] });
    expect(a.captured).toBe(1);
    expect(game.hostView().teams.map((t) => t.tiles)).toEqual([8, 1]);
  });

  test("walling off a corner captures nothing", () => {
    const { game } = play(["A", "B"]);
    const a = byName(game, "A");
    fund(a);
    for (const t of neighbors(game.size, 0)) game.place(a.id, t);
    expect(game.owners[0]).toBe(EMPTY);
    expect(game.hostView().lastCapture).toBeNull();
  });

  test("surrounding a start knocks the team out: its land and players join the conquerors", () => {
    const { game, clock, finished } = play(["A", "B", "C"], { teams: 3 });
    const a = byName(game, "A");
    const b = byName(game, "B");
    fund(a);
    fund(b, 3);
    const far = 0;
    game.place(b.id, far);
    const ring = ringAround(game, game.teams[1]!.start, 2);
    expect(ring).toHaveLength(12);
    for (const t of ring) expect(game.place(a.id, t)).toBe(true);
    expect(game.teams[1]).toMatchObject({ out: true, conqueredBy: 0, outOrder: 1 });
    expect(game.owners[game.teams[1]!.start]).toBe(0);
    expect(game.owners[far]).toBe(0);
    expect(game.owners.includes(1)).toBe(false);
    // 12 placed + the start and its 6 neighbours + Blue's far tile.
    expect(game.teamTiles(0)).toBe(1 + 12 + 7 + 1);
    expect(game.hostView().lastCapture).toMatchObject({ team: 0, knockedOut: [1] });
    expect(game.phase).toBe("playing");
    expect(finished()).toBe(0);

    // Blue's player is Red now, keeps their claims and can keep playing.
    const bv = game.playerView(b.id)!;
    expect(bv.team.name).toBe("Red");
    expect(bv.conquered).toMatchObject({ from: "Blue", by: "Red" });
    expect(bv).toMatchObject({ state: "claim", claims: 2 });
    expect(game.place(b.id, 5)).toBe(true);
    expect(game.owners[5]).toBe(0);
    // Blue's old start is no longer protected.
    expect(game.costFor(2, neighbors(game.size, game.teams[1]!.start)[0]!)).toBe(2);

    const host = game.hostView();
    expect(host.teams.map((t) => [t.name, t.out, t.members.map((m) => m.nickname)])).toEqual([
      ["Red", false, ["A", "B"]],
      ["Blue", true, []],
      ["Yellow", false, ["C"]],
    ]);
    expect(host.board.starts[1]).toMatchObject({ team: 1, out: true });
    // Late joiners never land on a knocked-out team.
    expect(game.join("Late").team).toBe(2);
    clock.advance(1);
  });

  test("the game ends early when only one team is left", () => {
    const { game, clock, finished } = play(["A", "B"]);
    const a = byName(game, "A");
    fund(a);
    for (const t of ringAround(game, game.teams[1]!.start, 2)) game.place(a.id, t);
    expect(game.phase).toBe("conquered");
    expect(finished()).toBe(0);
    expect(game.place(a.id, 0)).toBe(false);
    clock.advance(CONQUEST_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.playerView(a.id)!.result).toMatchObject({ teamRank: 1, teamCount: 2, won: true });
    expect(game.playerView(byName(game, "B").id)!.result).toMatchObject({ teamRank: 1, won: true });
    // The game clock doesn't fire a second finish.
    clock.advance(10 * 60_000);
    expect(finished()).toBe(1);
  });
});

describe("results", () => {
  test("time runs out: most tiles wins, correct answers break ties", () => {
    const { game, clock, finished } = play(["A", "B", "C"], { teams: 3, minutes: 3 });
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n)) as [LandPlayer, LandPlayer, LandPlayer];
    round(game, clock, a, 1);
    game.place(a.id, 0);
    round(game, clock, b, 2);
    game.place(b.id, 1);
    game.done(b.id);
    round(game, clock, c, 3);
    for (const t of [2, 3, 4]) game.place(c.id, t);
    expect(game.rankedTeams().map((t) => [t.name, t.rank, t.tiles])).toEqual([
      ["Yellow", 1, 4],
      ["Blue", 2, 2],
      ["Red", 3, 2],
    ]);
    clock.advance(3 * 60_000);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    const host = game.hostView();
    expect(host.hasResults).toBe(true);
    expect(host.awards).toEqual({
      mostCorrect: { value: 3, nicknames: ["C"] },
      topSettler: { value: 3, nicknames: ["C"] },
      topSurrounder: null,
    });
    expect(game.playerView(c.id)!.result).toEqual({ teamRank: 1, teamCount: 3, tiles: 4, won: true, awards: ["Most correct answers", "Top settler"] });
    expect(game.playerView(a.id)!.result).toMatchObject({ teamRank: 3, won: false });
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
  });

  test("equal teams share a rank; knocked-out teams come last", () => {
    const { game } = play(["A", "B", "C"], { teams: 3 });
    expect(game.rankedTeams().map((t) => t.rank)).toEqual([1, 1, 1]);
    const a = byName(game, "A");
    fund(a);
    for (const t of ringAround(game, game.teams[2]!.start, 2)) game.place(a.id, t);
    expect(game.rankedTeams().map((t) => [t.name, t.rank])).toEqual([
      ["Red", 1],
      ["Blue", 2],
      ["Yellow", 3],
    ]);
  });

  test("the results CSV lists players under the team they started on", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    round(game, clock, a, 2);
    game.place(a.id, 0);
    fund(a);
    for (const t of ringAround(game, game.teams[1]!.start, 2)) game.place(a.id, t);
    clock.advance(CONQUEST_MS);
    const rows = buildLandResultsCsv(game).replace("﻿", "").trim().split("\r\n");
    expect(rows[0]).toBe("Team,Team rank,Team tiles,Knocked out by,Nickname,Correct,Wrong,Accuracy %,Tiles placed,Tiles stolen,Tiles surrounded");
    expect(rows[1]).toBe("Red,1,21,,A,2,1,67,13,0,7");
    expect(rows[2]).toBe("Blue,2,0,Red,B,0,0,,0,0,0");
  });

  test("kicking a player on the message screen cancels their timer", () => {
    const { game, clock } = play(["A", "B"]);
    const a = byName(game, "A");
    for (let i = 0; i < 2; i++) answer(game, clock, a, false);
    game.answer(a.id, a.current!.seq, 1);
    expect(game.kick(a.id)?.nickname).toBe("A");
    clock.advance(LAND_EMPTY_MS + FEEDBACK_MS);
    expect(game.players.has(a.id)).toBe(false);
  });
});

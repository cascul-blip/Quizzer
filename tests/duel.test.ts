import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { AUTO_REVEAL_MS, AWARD_BIGGEST_CLIMB, AWARD_LONGEST_REIGN, AWARD_MOST_WINS, DuelGame, GRACE_MS, INTRO_MS, type DuelPlayer } from "../src/server/game/duel.ts";
import { buildDuelResultsCsv } from "../src/server/game/results.ts";
import { DUEL_DEFAULT_ROUNDS, type Pacing, type ShuffleOptions } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(count = 20): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe"],
      correct: [0],
    })),
  });
}

/** Shuffles leave everything in place, so the ladder starts in join order. */
const keepOrder = () => 0.999999;

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

function setup(names: string[], opts: { questions?: number; rounds?: number; pacing?: Pacing; shuffle?: ShuffleOptions; rng?: () => number } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(opts.questions), { clock, pacing: opts.pacing });
  lobby.setMode("duel");
  if (opts.rounds) lobby.setDuel({ rounds: opts.rounds });
  if (opts.shuffle) lobby.setShuffle(opts.shuffle);
  for (const n of names) lobby.join(n);
  const game = DuelGame.fromLobby(lobby, { clock, rng: opts.rng ?? keepOrder, onFinish: () => finished++ });
  game.start();
  return { clock, game, lobby, finished: () => finished };
}

const byName = (game: DuelGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;
const ladderNames = (game: DuelGame) => game.ranked().map((p) => p.nickname);
const arenaNames = (game: DuelGame) => game.arenas.map((a) => a.map((id) => game.players.get(id)!.nickname));

function answer(game: DuelGame, p: DuelPlayer, right: boolean): boolean {
  const q = game.currentQuestion!;
  const option = right ? q.correct[0]! : q.options.findIndex((_, i) => !q.correct.includes(i));
  return game.answer(p.id, game.qIndex, option);
}

/**
 * Play the current round to its reveal. `plan` lists who answers, in order, right (true) or wrong (false),
 * 100 ms apart. Players left out don't answer; the host closes the question if it is still open.
 */
function round(game: DuelGame, clock: FakeClock, plan: [string, boolean][]) {
  expect(game.phase).toBe("intro");
  clock.advance(INTRO_MS);
  expect(game.phase).toBe("open");
  for (const [name, right] of plan) {
    clock.advance(100);
    expect(answer(game, byName(game, name), right)).toBe(true);
  }
  if (game.phase === "open") game.next();
  expect(game.phase).toBe("reveal");
}

describe("Showdown", () => {
  test("lobby setting: rounds 10/15/20, default 15", () => {
    const lobby = new Game(quiz());
    expect(lobby.duel).toEqual({ rounds: DUEL_DEFAULT_ROUNDS });
    expect(lobby.hostView().duel).toEqual({ rounds: 15 });
    lobby.setMode("duel");
    lobby.setDuel({ rounds: 20 });
    expect(lobby.hostView()).toMatchObject({ mode: "duel", duel: { rounds: 20 }, teams: null });
    expect(() => lobby.setDuel({ rounds: 12 })).toThrow("Unsupported number of rounds");
    expect(() => lobby.setDuel({ rounds: "10" as unknown as number })).not.toThrow();
    expect(lobby.duel.rounds).toBe(10);
    expect(new Game(quiz(), { duel: { rounds: 20 } }).duel.rounds).toBe(20);
  });

  test("starts straight into round 1: the ladder in arenas, options hidden", () => {
    const { game } = setup(["A", "B", "C", "D", "E", "F"]);
    expect(game.phase).toBe("intro");
    expect(arenaNames(game)).toEqual([["A", "B"], ["C", "D"], ["E", "F"]]);
    const v = game.hostView();
    expect(v).toMatchObject({ kind: "duel", phase: "intro", round: 1, rounds: 15, pacing: "manual", answeredCount: 0, playerCount: 6, correct: null, lastRound: null, awards: null, errors: null, hasResults: false });
    expect(v.quiz).toEqual({ id: "sample-abcd", title: "Sample", questionCount: 20 });
    expect(v.question).toMatchObject({ index: 0, total: 15, text: "Question 0", options: [], remainingMs: INTRO_MS });
    expect(v.arenas.map((a) => [a.arena, a.duelists.map((d) => [d.nickname, d.connected, d.answered])])).toEqual([
      [1, [["A", true, false], ["B", true, false]]],
      [2, [["C", true, false], ["D", true, false]]],
      [3, [["E", true, false], ["F", true, false]]],
    ]);
    expect(v.players.map((p) => [p.nickname, p.rank, p.arena, p.startArena])).toEqual([
      ["A", 1, 1, 1],
      ["B", 2, 1, 1],
      ["C", 3, 2, 2],
      ["D", 4, 2, 2],
      ["E", 5, 3, 3],
      ["F", 6, 3, 3],
    ]);
    const c = game.playerView(byName(game, "C").id)!;
    expect(c).toMatchObject({ kind: "duel", phase: "intro", round: 1, rounds: 15, arena: 2, arenaCount: 3, myChoice: null, reveal: null, myDuel: null, result: null });
    expect(c.me).toMatchObject({ nickname: "C", arena: 2, rank: 3, wins: 0 });
    expect(c.opponents.map((o) => o.nickname)).toEqual(["D"]);
    expect(c.question!.options).toEqual([]);
    expect(game.playerView("nobody")).toBeNull();
    // Answers wait for the options.
    expect(answer(game, byName(game, "A"), true)).toBe(false);
    expect(() => game.start()).toThrow("already started");
  });

  test("a game needs players and questions", () => {
    const clock = new FakeClock();
    const empty = DuelGame.fromLobby(new Game(quiz(), { clock }), { clock });
    expect(() => empty.start()).toThrow("at least one player");
    expect(() => new DuelGame(quiz(0), { shuffle: { questions: false, answers: false } })).toThrow("no questions");
  });

  test("6 players: one round of duels and the ladder moves", () => {
    const { game, clock } = setup(["A", "B", "C", "D", "E", "F"]);
    // A right vs B wrong; C and D both right, D faster; E and F both wrong → draw.
    round(game, clock, [
      ["D", true],
      ["C", true],
      ["A", true],
      ["B", false],
      ["E", false],
      ["F", false],
    ]);
    const v = game.hostView();
    expect(v.correct).toEqual([0]);
    expect(v.answeredCount).toBe(6);
    expect(v.question!.options).toEqual(["yes", "no", "maybe"]);
    // The arenas still show the round as it was played.
    expect(v.arenas.map((a) => a.duelists.map((d) => d.nickname))).toEqual([["A", "B"], ["C", "D"], ["E", "F"]]);
    expect(v.lastRound!.round).toBe(1);
    expect(v.lastRound!.arenas.map((a) => [a.arena, a.draw, a.duelists.map((d) => [d.nickname, d.correct, d.ms, d.outcome, d.nextArena])])).toEqual([
      [1, false, [["A", true, 300, "win", 1], ["B", false, 400, "lose", 2]]],
      [2, false, [["C", true, 200, "lose", 2], ["D", true, 100, "win", 1]]],
      // The draw blocks the boundary above it: C stays in Arena 2.
      [3, true, [["E", false, 500, "stay", 3], ["F", false, 600, "stay", 3]]],
    ]);
    expect(ladderNames(game)).toEqual(["A", "D", "B", "C", "E", "F"]);
    expect(v.players.map((p) => [p.nickname, p.arena, p.wins, p.losses, p.draws, p.correct, p.wrong, p.reign])).toEqual([
      ["A", 1, 1, 0, 0, 1, 0, 1],
      ["D", 1, 1, 0, 0, 1, 0, 0],
      ["B", 2, 0, 1, 0, 0, 1, 0],
      ["C", 2, 0, 1, 0, 1, 0, 0],
      ["E", 3, 0, 0, 1, 0, 1, 0],
      ["F", 3, 0, 0, 1, 0, 1, 0],
    ]);
    const d = game.playerView(byName(game, "D").id)!;
    expect(d).toMatchObject({ phase: "reveal", arena: 2, myChoice: 0, reveal: { choice: 0, correct: [0], wasCorrect: true, ms: 100 }, me: { arena: 1, rank: 2, wins: 1 } });
    expect(d.opponents.map((o) => o.nickname)).toEqual(["C"]);
    expect(d.myDuel!.arena).toBe(2);

    game.next();
    expect(game.phase).toBe("intro");
    expect(game.round).toBe(2);
    expect(arenaNames(game)).toEqual([["A", "D"], ["B", "C"], ["E", "F"]]);
    expect(game.playerView(byName(game, "B").id)!.opponents.map((o) => o.nickname)).toEqual(["C"]);
  });

  test("7 players: the bottom arena is a 3-way duel", () => {
    const { game, clock } = setup(["A", "B", "C", "D", "E", "F", "G"]);
    expect(arenaNames(game)).toEqual([["A", "B"], ["C", "D"], ["E", "F", "G"]]);
    expect(game.playerView(byName(game, "F").id)!.opponents.map((o) => o.nickname)).toEqual(["E", "G"]);
    // Arena 2: C beats D. Arena 3: G right (wins), E wrong (middle), F no answer (loses).
    round(game, clock, [
      ["A", true],
      ["B", true],
      ["C", true],
      ["D", false],
      ["E", false],
      ["G", true],
    ]);
    const arenas = game.lastRound!.arenas;
    expect(arenas[0]!.duelists.map((d) => d.outcome)).toEqual(["win", "lose"]);
    expect(arenas[2]!.duelists.map((d) => [d.nickname, d.correct, d.outcome, d.nextArena])).toEqual([
      ["E", false, "stay", 3],
      ["F", null, "lose", 3],
      ["G", true, "win", 2],
    ]);
    // B ↔ C at boundary 1-2, D ↔ G at boundary 2-3; F stays at the bottom.
    expect(ladderNames(game)).toEqual(["A", "C", "B", "G", "D", "E", "F"]);
    game.next();
    expect(arenaNames(game)).toEqual([["A", "C"], ["B", "G"], ["D", "E", "F"]]);
  });

  test("the question closes early once every connected duelist has answered; away players count as no answer", () => {
    const { game, clock } = setup(["A", "B", "C", "D"]);
    game.setConnected(byName(game, "D").id, false);
    clock.advance(INTRO_MS);
    expect(answer(game, byName(game, "A"), true)).toBe(true);
    expect(answer(game, byName(game, "A"), false)).toBe(false);
    expect(answer(game, byName(game, "B"), true)).toBe(true);
    expect(game.phase).toBe("open");
    expect(game.hostView().answeredCount).toBe(2);
    expect(answer(game, byName(game, "C"), true)).toBe(true);
    expect(game.phase).toBe("reveal");
    // A and B answered at the same moment: a draw. C beats the absent D.
    expect(game.lastRound!.arenas.map((a) => [a.draw, a.duelists.map((d) => d.outcome)])).toEqual([
      [true, ["stay", "stay"]],
      [false, ["win", "lose"]],
    ]);
    // Arena 1 drew, so C can't climb; D is still on the ladder.
    expect(ladderNames(game)).toEqual(["A", "B", "C", "D"]);
    expect(game.hostView().arenas[1]!.duelists.map((d) => [d.nickname, d.connected])).toEqual([["C", true], ["D", false]]);
  });

  test("a player who disconnects while the question is open may complete it", () => {
    const { game, clock } = setup(["A", "B"]);
    clock.advance(INTRO_MS);
    answer(game, byName(game, "A"), true);
    expect(game.phase).toBe("open");
    game.setConnected(byName(game, "B").id, false);
    expect(game.phase).toBe("reveal");
    expect(ladderNames(game)).toEqual(["A", "B"]);
  });

  test("the timer: intro → open → closes after the time limit plus grace; auto pacing moves on", () => {
    const { game, clock } = setup(["A", "B"], { pacing: "auto" });
    clock.advance(INTRO_MS - 1);
    expect(game.phase).toBe("intro");
    clock.advance(1);
    expect(game.phase).toBe("open");
    expect(game.hostView()).toMatchObject({ phaseRemainingMs: 20_000, phaseDurationMs: 20_000 });
    clock.advance(20_000);
    // A last-moment answer still counts within the grace.
    expect(answer(game, byName(game, "B"), true)).toBe(true);
    expect(game.lastRound).toBeNull();
    clock.advance(GRACE_MS);
    expect(game.phase).toBe("reveal");
    expect(game.lastRound!.arenas[0]!.duelists.map((d) => [d.nickname, d.ms, d.outcome])).toEqual([["A", null, "lose"], ["B", 20_000, "win"]]);
    expect(ladderNames(game)).toEqual(["B", "A"]);
    expect(game.hostView().phaseRemainingMs).toBe(AUTO_REVEAL_MS);
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("intro");
    expect(arenaNames(game)).toEqual([["B", "A"]]);
    // Manual pacing waits for the host on the reveal.
    game.setPacing("manual");
    round(game, clock, []);
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
    game.skip();
    expect(game.phase).toBe("reveal");
    game.setPacing("auto");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("intro");
    expect(game.round).toBe(3);
  });

  test("late joiners wait at the bottom of the ladder and duel from the next round", () => {
    const { game, clock } = setup(["A", "B", "C", "D"]);
    clock.advance(INTRO_MS);
    const late = game.join("Late");
    expect(ladderNames(game)).toEqual(["A", "B", "C", "D", "Late"]);
    const lv = game.playerView(late.id)!;
    expect(lv).toMatchObject({ phase: "open", opponents: [], me: { rank: 5 } });
    expect(lv.arena).toBe(2);
    // Not in an arena this round: can't answer and doesn't hold up the early close.
    expect(answer(game, late, true)).toBe(false);
    for (const n of ["A", "B", "C"]) answer(game, byName(game, n), true);
    expect(game.phase).toBe("open");
    answer(game, byName(game, "D"), false);
    expect(game.phase).toBe("reveal");
    expect(game.lastRound!.arenas.flatMap((a) => a.duelists.map((d) => d.nickname))).not.toContain("Late");
    expect(game.hostView().players.find((p) => p.nickname === "Late")).toMatchObject({ rank: 5, arena: 2, startArena: 2, wins: 0 });
    game.next();
    // A beat B in Arena 1 (stays), C beat D; Late joins the bottom arena: a 3-way duel.
    expect(arenaNames(game)).toEqual([["A", "B"], ["C", "D", "Late"]]);
    expect(byName(game, "Late").startArena).toBe(2);
    expect(game.playerView(late.id)!.opponents.map((o) => o.nickname)).toEqual(["C", "D"]);
  });

  test("kicking mid-round: the ladder closes up and a lone duelist stays", () => {
    const { game, clock } = setup(["A", "B", "C", "D", "E", "F"]);
    clock.advance(INTRO_MS);
    for (const n of ["A", "B", "C", "F", "E"]) {
      clock.advance(100);
      answer(game, byName(game, n), n !== "B");
    }
    expect(game.phase).toBe("open");
    // D is the last one missing: kicking them closes the question.
    expect(game.kick(byName(game, "D").id)!.nickname).toBe("D");
    expect(game.phase).toBe("reveal");
    expect(game.lastRound!.arenas.map((a) => [a.draw, a.duelists.map((d) => [d.nickname, d.outcome])])).toEqual([
      [false, [["A", "win"], ["B", "lose"]]],
      [false, [["C", "stay"]]],
      [false, [["E", "lose"], ["F", "win"]]],
    ]);
    // C's arena has no winner or loser: both of its boundaries are blocked. F moves to the top of Arena 3.
    expect(ladderNames(game)).toEqual(["A", "B", "C", "F", "E"]);
    game.next();
    expect(arenaNames(game)).toEqual([["A", "B"], ["C", "F", "E"]]);
    expect(game.kick("nobody")).toBeNull();
    // A kicked player whose arena empties takes the arena with them.
    const solo = setup(["A", "B", "C", "D", "E"]);
    solo.game.kick(byName(solo.game, "A").id);
    solo.game.kick(byName(solo.game, "B").id);
    expect(arenaNames(solo.game)).toEqual([["C", "D", "E"]]);
    expect(solo.game.hostView().arenas.map((a) => a.arena)).toEqual([1]);
  });

  test("questions repeat in fresh cycles when the rounds outnumber them; errors count per quiz question", () => {
    const { game, clock } = setup(["A", "B"], { questions: 3, rounds: 10, shuffle: { questions: true, answers: true }, rng: seeded(7) });
    expect(game.questions).toHaveLength(10);
    for (let c = 0; c < 3; c++) expect(game.questions.slice(3 * c, 3 * c + 3).map((q) => q.id).sort()).toEqual(["q0", "q1", "q2"]);
    expect(game.questions[9]).toBeDefined();
    const seen: string[] = [];
    for (let r = 0; r < 10; r++) {
      expect(game.hostView().question).toMatchObject({ index: r, total: 10 });
      seen.push(game.currentQuestion!.id);
      // A always wrong, B wrong only on q0.
      round(game, clock, [
        ["A", false],
        ["B", game.currentQuestion!.id !== "q0"],
      ]);
      game.next();
    }
    expect(game.phase).toBe("podium");
    const q0 = seen.filter((id) => id === "q0").length;
    const errors = game.errors();
    expect(errors.find((e) => e.text === "Question 0")).toEqual({ wrong: 2 * q0, text: "Question 0", answers: ["yes"] });
    expect(errors.reduce((n, e) => n + e.wrong, 0)).toBe(10 + q0);
    expect(errors[0]!.text).toBe("Question 0");
  });

  test("a full game: podium, final ranking, awards, results CSV", () => {
    const { game, clock, finished } = setup(["A", "B", "C", "D", "E", "F"], { rounds: 10 });
    // Round 1: everyone in a lower arena wins: D, F climb; A holds the Throne.
    round(game, clock, [
      ["A", true],
      ["D", true],
      ["F", true],
      ["B", false],
      ["C", false],
      ["E", false],
    ]);
    expect(ladderNames(game)).toEqual(["A", "D", "B", "F", "C", "E"]);
    game.next();
    // Round 2: [A D] [B F] [C E] — the second of each arena wins.
    round(game, clock, [
      ["D", true],
      ["F", true],
      ["E", true],
      ["A", false],
      ["B", false],
      ["C", false],
    ]);
    // D takes the Throne; A ↔ F; B ↔ E.
    expect(ladderNames(game)).toEqual(["D", "F", "A", "E", "B", "C"]);
    game.next();
    expect(game.hostView().round).toBe(3);
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    game.end();
    expect(finished()).toBe(1);
    expect(game.join.bind(game, "Too late")).toThrow("finished");

    const v = game.hostView();
    expect(v).toMatchObject({ phase: "podium", question: null, arenas: [], hasResults: true, correct: null });
    expect(v.players.map((p) => [p.nickname, p.rank, p.arena, p.startArena, p.wins, p.reign])).toEqual([
      ["D", 1, 1, 2, 2, 1],
      ["F", 2, 1, 3, 2, 0],
      ["A", 3, 2, 1, 1, 1],
      ["E", 4, 2, 3, 1, 0],
      ["B", 5, 3, 1, 0, 0],
      ["C", 6, 3, 2, 0, 0],
    ]);
    expect(v.awards).toEqual({
      longestReign: { value: 1, nicknames: ["D", "A"] },
      mostWins: { value: 2, nicknames: ["D", "F"] },
      biggestClimb: { value: 2, nicknames: ["F"] },
    });
    expect(v.errors!.map((e) => [e.text, e.wrong])).toEqual([
      ["Question 0", 3],
      ["Question 1", 3],
    ]);
    const f = game.playerView(byName(game, "F").id)!;
    expect(f).toMatchObject({ phase: "podium", question: null, opponents: [], arena: 1, arenaCount: 3, result: { rank: 2, playerCount: 6, awards: [AWARD_MOST_WINS, AWARD_BIGGEST_CLIMB] } });
    expect(game.playerView(byName(game, "D").id)!.result!.awards).toEqual([AWARD_LONGEST_REIGN, AWARD_MOST_WINS]);
    expect(game.playerView(byName(game, "C").id)!.result).toEqual({ rank: 6, playerCount: 6, awards: [] });

    const csv = buildDuelResultsCsv(game);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe(
      "Rank,Nickname,Final arena,Start arena,Wins,Losses,Draws,Rounds won in Arena 1,Correct,Wrong,R1 answer (Question 0),R1 correct,R1 time (s),R2 answer (Question 1),R2 correct,R2 time (s)",
    );
    expect(lines[1]).toBe("1,D,1,2,2,0,0,1,2,0,yes,yes,0.20,yes,yes,0.10");
    expect(lines[3]).toBe("3,A,2,1,1,1,0,1,1,1,yes,yes,0.10,no,no,0.40");
    expect(lines[6]).toBe("6,C,3,2,0,2,0,0,0,2,no,no,0.50,no,no,0.60");
  });

  test("the host ends the game while a question is open: it is settled first", () => {
    const { game, clock } = setup(["A", "B"]);
    clock.advance(INTRO_MS);
    answer(game, byName(game, "B"), true);
    game.end();
    expect(game.phase).toBe("podium");
    expect(game.played).toBe(1);
    expect(ladderNames(game)).toEqual(["B", "A"]);
    expect(game.awards()).toEqual({ longestReign: { value: 1, nicknames: ["B"] }, mostWins: { value: 1, nicknames: ["B"] }, biggestClimb: null });
  });

  test("one player: an arena of their own, nobody moves", () => {
    const { game, clock } = setup(["Solo"], { rounds: 10 });
    expect(arenaNames(game)).toEqual([["Solo"]]);
    expect(game.playerView(byName(game, "Solo").id)!.opponents).toEqual([]);
    round(game, clock, [["Solo", true]]);
    expect(game.lastRound!.arenas).toEqual([{ arena: 1, draw: false, duelists: [expect.objectContaining({ nickname: "Solo", correct: true, outcome: "stay", nextArena: 1 })] }]);
    expect(byName(game, "Solo")).toMatchObject({ correct: 1, wins: 0, draws: 0 });
  });
});

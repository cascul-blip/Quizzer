import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { AUTO_REVEAL_MS, AWARD_BEST_DRIVER, AWARD_MOST_CORRECT, CONFIDENCE_MS, GRACE_MS, INTRO_MS, RacerGame, type RacerPlayer } from "../src/server/game/racer.ts";
import { buildRacerResultsCsv } from "../src/server/game/results.ts";
import type { Pacing, ShuffleOptions } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import type { RacerConfidence } from "../src/shared/racer-rules.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(count = 8): Quiz {
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

/** Deterministic rng so driver order is reproducible. */
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

function setup(names: string[], opts: { questions?: number; pacing?: Pacing; shuffle?: ShuffleOptions; seed?: number } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(opts.questions), { clock, pacing: opts.pacing });
  lobby.setMode("racer");
  if (opts.shuffle) lobby.setShuffle(opts.shuffle);
  for (const n of names) lobby.join(n);
  const game = RacerGame.fromLobby(lobby, { clock, rng: seeded(opts.seed), onFinish: () => finished++ });
  game.start();
  return { clock, game, lobby, finished: () => finished };
}

const byName = (game: RacerGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;
const driverOf = (game: RacerGame) => game.players.get(game.driver!.id)!;
const others = (game: RacerGame) => [...game.players.values()].filter((p) => p.id !== game.driver?.id);

function answer(game: RacerGame, p: RacerPlayer, right: boolean): boolean {
  const q = game.currentQuestion!;
  const option = right ? q.correct[0]! : q.options.findIndex((_, i) => !q.correct.includes(i));
  return game.answer(p.id, game.qIndex, option);
}

/** The driver sets the lever and goes (or the intro runs out when there is no driver): the question is open. */
function toOpen(game: RacerGame, clock: FakeClock, level: RacerConfidence = "low") {
  if (game.phase === "confidence") {
    expect(game.setLever(game.driver!.id, level)).toBe(true);
    expect(game.go(game.driver!.id)).toBe(true);
  } else {
    expect(game.phase).toBe("intro");
    clock.advance(INTRO_MS);
  }
  expect(game.phase).toBe("open");
}

/** Play the current turn to its reveal: every connected player answers, right if they are named (or "all"). */
function turn(game: RacerGame, clock: FakeClock, level: RacerConfidence, right: string[] | "all" | "none") {
  toOpen(game, clock, level);
  for (const p of [...game.players.values()]) {
    if (p.connected) answer(game, p, right === "all" || (right !== "none" && right.includes(p.nickname)));
  }
  expect(game.phase).toBe("reveal");
}

describe("Racer", () => {
  test("starts straight into turn 1: a driver, the lever on low, 30 mph, options hidden", () => {
    const { game } = setup(["A", "B", "C"]);
    expect(game.phase).toBe("confidence");
    expect(game.qIndex).toBe(0);
    const v = game.hostView();
    expect(v).toMatchObject({ kind: "racer", phase: "confidence", pacing: "manual", lever: "low", confidence: null, answeredCount: 0, playerCount: 3, lastTurn: null });
    expect(v.quiz).toEqual({ id: "sample-abcd", title: "Sample", questionCount: 8 });
    expect(v.question).toMatchObject({ index: 0, total: 8, text: "Question 0", options: [], remainingMs: CONFIDENCE_MS });
    expect([v.phaseRemainingMs, v.phaseDurationMs]).toEqual([CONFIDENCE_MS, CONFIDENCE_MS]);
    expect(v.car).toEqual({ speed: 30, crashed: false, distance: 0, topSpeed: 30, crashes: 0 });
    expect(v.driver).toEqual({ id: driverOf(game).id, nickname: driverOf(game).nickname, avatar: driverOf(game).avatar });
    expect([v.correct, v.answerCounts, v.result, v.awards, v.errors, v.hasResults]).toEqual([null, null, null, null, null, false]);

    const mine = game.playerView(driverOf(game).id)!;
    expect(mine).toMatchObject({ kind: "racer", phase: "confidence", isDriver: true, lever: "low", confidence: null, myChoice: null, reveal: null, result: null });
    expect(mine.question!.options).toEqual([]);
    expect(game.playerView(others(game)[0]!.id)).toMatchObject({ isDriver: false, driver: v.driver, lever: "low" });
    expect(game.playerView("nobody")).toBeNull();
    expect(() => game.start()).toThrow("already started");
  });

  test("a game needs players and questions", () => {
    const clock = new FakeClock();
    const empty = RacerGame.fromLobby(new Game(quiz(), { clock }), { clock });
    expect(() => empty.start()).toThrow("at least one player");
    expect(() => new RacerGame(quiz(0), { shuffle: { questions: false, answers: false } })).toThrow("no questions");
  });

  test("driver bag: everyone drives once before anyone drives again", () => {
    const { game, clock } = setup(["A", "B", "C", "D"]);
    const drivers: string[] = [];
    for (let i = 0; i < 8; i++) {
      drivers.push(game.driver!.nickname);
      turn(game, clock, "low", "all");
      game.next();
    }
    expect(game.phase).toBe("podium");
    expect([...drivers.slice(0, 4)].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...drivers.slice(4)].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...game.players.values()].map((p) => p.turnsDriven)).toEqual([2, 2, 2, 2]);
  });

  test("driver bag: only connected players drive; someone who was away gets their turn once back", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    const first = game.driver!.nickname;
    const away = others(game)[0]!;
    game.setConnected(away.id, false);
    turn(game, clock, "low", "all");
    game.next();
    const second = game.driver!.nickname;
    expect([first, away.nickname]).not.toContain(second);
    turn(game, clock, "low", "all");
    game.next();
    // Only the player who is away is left in the bag: it is refilled and someone connected drives.
    expect([first, second]).toContain(game.driver!.nickname);
    game.setConnected(away.id, true);
    const next: string[] = [];
    for (let i = 0; i < 2; i++) {
      turn(game, clock, "low", "all");
      game.next();
      next.push(game.driver!.nickname);
    }
    expect(next).toContain(away.nickname);
  });

  test("driver bag: late joiners and kicked players", () => {
    const { game, clock } = setup(["A", "B"]);
    const drivers = [game.driver!.nickname];
    const late = game.join("Late");
    for (let i = 0; i < 2; i++) {
      turn(game, clock, "low", "all");
      game.next();
      drivers.push(game.driver!.nickname);
    }
    expect([...drivers].sort()).toEqual(["A", "B", "Late"]);
    // Kicked players never come out of the bag.
    turn(game, clock, "low", "all");
    expect(game.kick(late.id)!.nickname).toBe("Late");
    for (let i = 0; i < 3; i++) {
      game.next();
      expect(game.driver!.nickname).not.toBe("Late");
      turn(game, clock, "low", "all");
    }
  });

  test("the lever: only the driver moves it, everyone sees it, and Go locks it in", () => {
    const { game } = setup(["A", "B", "C"]);
    const driver = driverOf(game);
    const other = others(game)[0]!;
    expect(game.setLever(other.id, "high")).toBe(false);
    expect(game.go(other.id)).toBe(false);
    expect(game.lever).toBe("low");
    expect(game.phase).toBe("confidence");

    expect(game.setLever(driver.id, "sky" as RacerConfidence)).toBe(false);
    expect(game.setLever(driver.id, "high")).toBe(true);
    expect(game.hostView()).toMatchObject({ lever: "high", confidence: null });
    expect(game.playerView(other.id)).toMatchObject({ lever: "high", confidence: null, isDriver: false });
    expect(game.setLever(driver.id, "mid")).toBe(true);
    // Answers wait for the question to open.
    expect(answer(game, other, true)).toBe(false);

    expect(game.go(driver.id)).toBe(true);
    expect(game.phase).toBe("open");
    const v = game.hostView();
    expect(v).toMatchObject({ lever: "mid", confidence: "mid", phaseRemainingMs: 20_000, phaseDurationMs: 20_000 });
    expect(v.question).toMatchObject({ options: ["yes", "no", "maybe"], remainingMs: 20_000 });
    expect(game.playerView(driver.id)).toMatchObject({ isDriver: true, lever: "mid", confidence: "mid" });
    // Too late to change it.
    expect(game.setLever(driver.id, "high")).toBe(false);
    expect(game.go(driver.id)).toBe(false);
    expect(game.confidence).toBe("mid");
  });

  test("the lever is locked where it is when the 20 seconds run out", () => {
    const { game, clock } = setup(["A", "B"]);
    game.setLever(game.driver!.id, "mid");
    clock.advance(5000);
    expect(game.hostView()).toMatchObject({ phase: "confidence", phaseRemainingMs: 15_000, phaseDurationMs: CONFIDENCE_MS });
    expect(game.playerView(game.driver!.id)!.question!.remainingMs).toBe(15_000);
    clock.advance(CONFIDENCE_MS - 5001);
    expect(game.phase).toBe("confidence");
    clock.advance(1);
    expect(game.phase).toBe("open");
    expect(game.confidence).toBe("mid");
  });

  test("a driver who disconnects while choosing is locked in at the current level", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    const driver = driverOf(game);
    // Someone else leaving changes nothing.
    game.setConnected(others(game)[0]!.id, false);
    expect(game.phase).toBe("confidence");
    game.setConnected(others(game)[0]!.id, true);
    game.setLever(driver.id, "high");
    game.setConnected(driver.id, false);
    expect(game.phase).toBe("open");
    expect(game.confidence).toBe("high");
    expect(game.driver!.id).toBe(driver.id);
    // The others all answer right, but the driver is away without an answer: not counted, so everyone was right.
    for (const p of others(game)) answer(game, p, true);
    expect(game.phase).toBe("reveal");
    expect(game.lastTurn).toMatchObject({ confidence: "high", correct: 2, total: 2, gain: 40, speedAfter: 70 });
    expect(driver).toMatchObject({ turnsDriven: 1, mphGained: 40 });
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
  });

  test("a driver who is kicked while choosing is locked in too, and stays named as the turn's driver", () => {
    const { game } = setup(["A", "B", "C"]);
    const driver = driverOf(game);
    game.setLever(driver.id, "mid");
    game.kick(driver.id);
    expect(game.phase).toBe("open");
    expect(game.confidence).toBe("mid");
    for (const p of [...game.players.values()]) answer(game, p, true);
    expect(game.lastTurn).toMatchObject({ driver: { id: driver.id, nickname: driver.nickname }, confidence: "mid", correct: 2, total: 2, gain: 20 });
    expect(game.hostView().players).toHaveLength(2);
    // Nobody left in the game drove that turn.
    expect(game.awards().bestDriver).toBeNull();
  });

  test("host skip: locks the lever in during confidence, closes the question when open", () => {
    const { game } = setup(["A", "B"]);
    game.setLever(game.driver!.id, "mid");
    game.skip();
    expect(game.phase).toBe("open");
    expect(game.confidence).toBe("mid");
    game.skip();
    expect(game.phase).toBe("reveal");
    // Nobody answered: 0 of 2 at "mid" is 2 fails.
    expect(game.lastTurn).toMatchObject({ correct: 0, total: 2, fails: 2, speedAfter: 0, crashed: true });
    game.skip();
    expect(game.phase).toBe("reveal");
  });

  test("the question closes as soon as every connected player has answered", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    toOpen(game, clock, "low");
    const [a, b, c] = [byName(game, "A"), byName(game, "B"), byName(game, "C")];
    expect(answer(game, a, true)).toBe(true);
    expect(answer(game, a, false)).toBe(false); // one answer each
    expect(game.answer(b.id, 1, 0)).toBe(false); // wrong question
    expect(game.answer(b.id, 0, 7)).toBe(false); // no such option
    expect(game.answer(b.id, 0, 0.5)).toBe(false);
    expect(game.hostView()).toMatchObject({ phase: "open", answeredCount: 1 });
    expect(answer(game, b, false)).toBe(true);
    expect(game.phase).toBe("open");
    expect(answer(game, c, true)).toBe(true);
    expect(game.phase).toBe("reveal");
    expect(answer(game, c, true)).toBe(false);
    expect(game.lastTurn).toMatchObject({ correct: 2, total: 3 });
  });

  test("a disconnect or a kick can complete the question", () => {
    for (const leave of ["disconnect", "kick"] as const) {
      const { game, clock } = setup(["A", "B", "C"]);
      toOpen(game, clock, "low");
      answer(game, byName(game, "A"), true);
      answer(game, byName(game, "B"), true);
      expect(game.phase).toBe("open");
      if (leave === "disconnect") game.setConnected(byName(game, "C").id, false);
      else game.kick(byName(game, "C").id);
      expect(game.phase).toBe("reveal");
      expect(game.lastTurn).toMatchObject({ correct: 2, total: 2 });
    }
  });

  test("when time runs out, unanswered counts as wrong; away players count only if they answered", () => {
    const { game, clock } = setup(["A", "B", "C", "D", "E"]);
    toOpen(game, clock, "mid");
    const p = (n: string) => byName(game, n);
    answer(game, p("A"), true);
    answer(game, p("B"), true);
    answer(game, p("C"), true);
    game.setConnected(p("C").id, false); // answered, then left: counts
    game.setConnected(p("D").id, false); // left without answering: doesn't count
    // E is here but never answers: counts as wrong.
    clock.advance(20_000);
    expect(game.phase).toBe("open");
    expect(game.hostView().question!.remainingMs).toBe(0);
    clock.advance(GRACE_MS);
    expect(game.phase).toBe("reveal");
    // 3 of 4 is at least two thirds: +20 mph.
    expect(game.lastTurn).toMatchObject({ confidence: "mid", correct: 3, total: 4, gain: 20, fails: 0, speedBefore: 30, speedAfter: 50 });
    expect([p("A"), p("D"), p("E")].map((x) => [x.correct, x.wrong])).toEqual([
      [1, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  test("an answer just after the deadline still counts (grace)", () => {
    const { game, clock } = setup(["A", "B"]);
    toOpen(game, clock, "low");
    clock.advance(20_000 + GRACE_MS - 1);
    expect(answer(game, byName(game, "A"), true)).toBe(true);
    clock.advance(1);
    expect(game.phase).toBe("reveal");
    expect(game.lastTurn).toMatchObject({ correct: 1, total: 2 });
  });

  test("crash → turns without a driver → repair → driving again", () => {
    const { game, clock } = setup(["A", "B"]);
    const first = driverOf(game);
    turn(game, clock, "high", "none");
    expect(game.lastTurn).toEqual({
      index: 0,
      driver: { id: first.id, nickname: first.nickname, avatar: first.avatar },
      confidence: "high",
      correct: 0,
      total: 2,
      gain: 0,
      fails: 3,
      speedBefore: 30,
      speedAfter: 0,
      crashed: true,
      repaired: false,
      distanceAdded: 0,
    });
    expect(game.car).toEqual({ speed: 0, crashed: true, distance: 0, topSpeed: 30, crashes: 1 });
    expect(first).toMatchObject({ turnsDriven: 1, mphGained: 0, failsAsDriver: 3 });

    // Crashed: a 3 s look at the question, no driver, no lever.
    game.next();
    expect(game.phase).toBe("intro");
    let v = game.hostView();
    expect(v).toMatchObject({ driver: null, lever: null, confidence: null, phaseRemainingMs: INTRO_MS, phaseDurationMs: INTRO_MS });
    expect(v.question).toMatchObject({ index: 1, options: [], remainingMs: INTRO_MS });
    expect(v.lastTurn!.index).toBe(0);
    expect(game.playerView(first.id)).toMatchObject({ isDriver: false, driver: null, lever: null });
    expect(game.setLever(first.id, "mid")).toBe(false);
    expect(game.go(first.id)).toBe(false);
    expect(answer(game, first, true)).toBe(false);
    clock.advance(INTRO_MS - 1);
    expect(game.phase).toBe("intro");
    clock.advance(1);
    expect(game.phase).toBe("open");

    // Nobody right: still a wreck.
    for (const p of game.players.values()) answer(game, p, false);
    expect(game.lastTurn).toMatchObject({ index: 1, driver: null, confidence: null, correct: 0, total: 2, fails: 0, speedAfter: 0, crashed: false, repaired: false, distanceAdded: 0 });
    expect(game.car).toMatchObject({ speed: 0, crashed: true, crashes: 1 });

    // Half the class right: repaired, back at 30 mph.
    game.next();
    expect(game.phase).toBe("intro");
    game.skip(); // the host can cut the intro short
    expect(game.phase).toBe("open");
    answer(game, byName(game, "A"), true);
    answer(game, byName(game, "B"), false);
    expect(game.lastTurn).toMatchObject({ index: 2, driver: null, correct: 1, total: 2, speedBefore: 0, speedAfter: 30, crashed: false, repaired: true, distanceAdded: 5 });
    expect(game.car).toEqual({ speed: 30, crashed: false, distance: 5, topSpeed: 30, crashes: 1 });
    expect([...game.players.values()].map((p) => p.turnsDriven).sort()).toEqual([0, 1]);

    game.next();
    expect(game.phase).toBe("confidence");
    expect(game.driver).not.toBeNull();
    expect(game.lever).toBe("low");
  });

  test("distance adds 10 minutes at each turn's final speed; top speed and driver stats follow", () => {
    const { game, clock } = setup(["Solo"]);
    const solo = byName(game, "Solo");
    turn(game, clock, "mid", "all"); // 50
    game.next();
    turn(game, clock, "high", "all"); // 90
    game.next();
    turn(game, clock, "low", "none"); // 45
    game.next();
    turn(game, clock, "mid", "none"); // 0 of 1: 2 fails → 11.25 → crash
    expect(game.car.distance).toBeCloseTo((50 + 90 + 45) / 6, 9);
    expect(game.car).toMatchObject({ speed: 0, crashed: true, topSpeed: 90, crashes: 1 });
    expect(game.turns).toBe(4);
    expect(solo).toMatchObject({ correct: 2, wrong: 2, turnsDriven: 4, mphGained: 60, failsAsDriver: 3 });
    expect(game.hostView().players[0]).toMatchObject({ nickname: "Solo", connected: true, answered: true, correct: 2, wrong: 2, turnsDriven: 4, mphGained: 60, failsAsDriver: 3 });
  });

  test("nobody connected: no driver, and a question nobody could answer changes nothing", () => {
    const { game, clock } = setup(["Solo"]);
    turn(game, clock, "mid", "all");
    game.setConnected(byName(game, "Solo").id, false);
    game.next();
    expect(game.phase).toBe("intro");
    expect(game.driver).toBeNull();
    clock.advance(INTRO_MS);
    expect(game.phase).toBe("open");
    clock.advance(20_000 + GRACE_MS);
    expect(game.phase).toBe("reveal");
    expect(game.lastTurn).toMatchObject({ index: 1, driver: null, confidence: null, correct: 0, total: 0, gain: 0, fails: 0, speedBefore: 50, speedAfter: 50, crashed: false, repaired: false });
    expect(game.car).toMatchObject({ speed: 50, crashed: false, crashes: 0 });
  });

  test("manual pacing: the reveal waits for the host, question after question, to the podium", () => {
    const { game, clock, finished } = setup(["A", "B"], { questions: 3 });
    for (let i = 0; i < 3; i++) {
      expect(game.qIndex).toBe(i);
      expect(game.hostView().question).toMatchObject({ index: i, total: 3, text: `Question ${i}` });
      turn(game, clock, "low", "all");
      expect(game.hostView()).toMatchObject({ phase: "reveal", phaseRemainingMs: 0, phaseDurationMs: 0 });
      clock.advance(120_000);
      expect(game.phase).toBe("reveal");
      expect(finished()).toBe(0);
      game.next();
    }
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    game.next();
    game.skip();
    game.end();
    expect(finished()).toBe(1);
    expect(game.hostView().result).toEqual({ distance: 15, topSpeed: 30, crashes: 0, turns: 3 });
  });

  test("host next also moves a turn along: locks the lever, closes the question", () => {
    const { game } = setup(["A", "B"]);
    game.next();
    expect(game.phase).toBe("open");
    expect(game.confidence).toBe("low");
    game.next();
    expect(game.phase).toBe("reveal");
    game.next();
    // 0 of 2 at "low" was a fail: 15 mph is a crash, so the next turn has no driver.
    expect(game.phase).toBe("intro");
    game.next();
    expect(game.phase).toBe("open");
  });

  test("auto pacing: the reveal moves on after 5 seconds, and the last one ends the game", () => {
    const { game, clock, finished } = setup(["A", "B"], { questions: 2, pacing: "auto" });
    expect(game.pacing).toBe("auto");
    turn(game, clock, "low", "all");
    expect(game.hostView()).toMatchObject({ phase: "reveal", pacing: "auto", phaseRemainingMs: AUTO_REVEAL_MS, phaseDurationMs: AUTO_REVEAL_MS });
    expect(game.hostView().question!.remainingMs).toBe(0);
    clock.advance(AUTO_REVEAL_MS - 1);
    expect(game.phase).toBe("reveal");
    clock.advance(1);
    expect(game.phase).toBe("confidence");
    expect(game.qIndex).toBe(1);
    turn(game, clock, "low", "all");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
  });

  test("pacing can change mid-game", () => {
    const { game, clock } = setup(["A", "B"]);
    turn(game, clock, "low", "all");
    game.setPacing("auto");
    expect(game.hostView()).toMatchObject({ pacing: "auto", phaseRemainingMs: AUTO_REVEAL_MS });
    clock.advance(1000);
    game.setPacing("manual");
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
    game.setPacing("auto");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("confidence");
    // Outside the reveal it only takes effect at the next reveal.
    game.setPacing("manual");
    clock.advance(CONFIDENCE_MS);
    expect(game.phase).toBe("open");
    game.skip();
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
  });

  test("start(pacing) overrides the lobby's pacing", () => {
    const clock = new FakeClock();
    const lobby = new Game(quiz(), { clock });
    lobby.join("A");
    const game = RacerGame.fromLobby(lobby, { clock, rng: seeded() });
    game.start("auto");
    expect(game.pacing).toBe("auto");
  });

  test("end() mid-question settles the open question, then the podium", () => {
    const { game, clock, finished } = setup(["A", "B"]);
    toOpen(game, clock, "mid");
    answer(game, byName(game, "A"), true);
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    // 1 of 2 at "mid": 1 fail, 15 mph, crash.
    expect(game.lastTurn).toMatchObject({ index: 0, correct: 1, total: 2, fails: 1, crashed: true });
    expect(game.turns).toBe(1);
    expect(byName(game, "A").correct).toBe(1);
    const v = game.hostView();
    expect(v).toMatchObject({ phase: "podium", question: null, driver: null, lever: null, confidence: null, correct: null, answerCounts: null, hasResults: true, phaseRemainingMs: 0 });
    expect(v.result).toEqual({ distance: 0, topSpeed: 30, crashes: 1, turns: 1 });
    // No timer is left behind.
    clock.advance(600_000);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
  });

  test("end() before the question opens just drops the turn", () => {
    const { game, clock, finished } = setup(["A", "B"]);
    turn(game, clock, "mid", "all");
    game.next();
    expect(game.phase).toBe("confidence");
    const driver = driverOf(game);
    game.setLever(driver.id, "high");
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.turns).toBe(1);
    expect(game.lastTurn!.index).toBe(0);
    expect(game.car).toMatchObject({ speed: 50, crashes: 0 });
    expect(driver.turnsDriven + others(game).reduce((n, p) => n + p.turnsDriven, 0)).toBe(1);
  });

  test("dispose() cancels the pending timer", () => {
    const { game, clock } = setup(["A"]);
    game.dispose();
    clock.advance(600_000);
    expect(game.phase).toBe("confidence");
  });

  test("late joiners can join in any phase but the podium, and answer an open question", () => {
    const { game, clock } = setup(["A", "B"], { questions: 2 });
    const c = game.join("C");
    expect(game.playerView(c.id)).toMatchObject({ phase: "confidence", isDriver: false, playerCount: 3 });
    toOpen(game, clock, "high");
    const d = game.join("D");
    expect(() => game.join("d")).toThrow("taken");
    expect(game.playerView(d.id)!.question!.options).toEqual(["yes", "no", "maybe"]);
    for (const n of ["A", "B", "C"]) answer(game, byName(game, n), true);
    // D is here now, so D counts.
    expect(game.phase).toBe("open");
    expect(answer(game, d, true)).toBe(true);
    expect(game.phase).toBe("reveal");
    expect(game.lastTurn).toMatchObject({ correct: 4, total: 4, gain: 40 });
    const e = game.join("E");
    expect(game.playerView(e.id)).toMatchObject({ phase: "reveal", myChoice: null, reveal: { choice: null, correct: [0], wasCorrect: false } });
    game.next();
    turn(game, clock, "low", "all");
    game.next();
    expect(game.phase).toBe("podium");
    expect(() => game.join("F")).toThrow("finished");
  });

  test("reconnecting by token gives a complete snapshot of the turn", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    const driver = driverOf(game);
    const other = others(game)[0]!;
    toOpen(game, clock, "mid");
    answer(game, other, false);
    game.setConnected(other.id, false);
    expect(game.hostView().players.find((p) => p.id === other.id)).toMatchObject({ connected: false, answered: true });
    expect(game.byToken("nope")).toBeNull();
    const back = game.byToken(other.token)!;
    expect(back).toBe(other);
    game.setConnected(back.id, true);
    clock.advance(4000);
    const v = game.playerView(back.id)!;
    expect(v).toMatchObject({ kind: "racer", phase: "open", title: "Sample", isDriver: false, lever: "mid", confidence: "mid", myChoice: 1, reveal: null, playerCount: 3, phaseRemainingMs: 16_000, phaseDurationMs: 20_000 });
    expect(v.driver).toEqual({ id: driver.id, nickname: driver.nickname, avatar: driver.avatar });
    expect(v.question).toMatchObject({ index: 0, total: 8, options: ["yes", "no", "maybe"], remainingMs: 16_000 });
    expect(v.car).toEqual(game.hostView().car);
    // Nothing about right or wrong leaks while the question is open.
    expect(v.me).toEqual({ id: other.id, nickname: other.nickname, avatar: other.avatar, correct: 0, wrong: 0, turnsDriven: 0, mphGained: 0, failsAsDriver: 0 });
  });

  test("the reveal: correct options, answer counts, each player's result and the turn summary", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    toOpen(game, clock, "low");
    const [a, b, c] = [byName(game, "A"), byName(game, "B"), byName(game, "C")];
    game.answer(a.id, 0, 0);
    game.answer(b.id, 0, 2);
    expect(game.hostView()).toMatchObject({ phase: "open", answeredCount: 2, correct: null, answerCounts: null });
    expect(game.playerView(a.id)).toMatchObject({ myChoice: 0, reveal: null });
    game.skip();
    const v = game.hostView();
    expect(v).toMatchObject({ phase: "reveal", answeredCount: 2, correct: [0], answerCounts: [1, 0, 1] });
    expect(v.question!.options).toEqual(["yes", "no", "maybe"]);
    expect(v.lastTurn).toMatchObject({ index: 0, confidence: "low", correct: 1, total: 3, gain: 0, fails: 0, speedBefore: 30, speedAfter: 30, distanceAdded: 5 });
    expect(v.car).toMatchObject({ speed: 30, distance: 5 });
    expect(game.playerView(a.id)).toMatchObject({ myChoice: 0, reveal: { choice: 0, correct: [0], wasCorrect: true }, me: { correct: 1, wrong: 0 }, lastTurn: v.lastTurn, car: v.car });
    expect(game.playerView(b.id)).toMatchObject({ myChoice: 2, reveal: { choice: 2, correct: [0], wasCorrect: false }, me: { correct: 0, wrong: 1 } });
    expect(game.playerView(c.id)).toMatchObject({ myChoice: null, reveal: { choice: null, correct: [0], wasCorrect: false }, me: { correct: 0, wrong: 0 } });
    // The next turn starts clean but keeps the last turn's summary.
    game.next();
    expect(game.hostView()).toMatchObject({ answeredCount: 0, correct: null, answerCounts: null, confidence: null, lastTurn: { index: 0 } });
    expect(game.playerView(a.id)).toMatchObject({ myChoice: null, reveal: null });
  });

  test("the lobby's shuffle choices are used, and every question is asked once", () => {
    const { game, clock } = setup(["A"], { questions: 6, shuffle: { questions: true, answers: true } });
    const ids = game.questions.map((q) => q.id);
    expect([...ids].sort()).toEqual(["q0", "q1", "q2", "q3", "q4", "q5"]);
    expect(ids).not.toEqual(["q0", "q1", "q2", "q3", "q4", "q5"]);
    expect(game.questions.some((q) => q.options.join() !== "yes,no,maybe")).toBe(true);
    for (const q of game.questions) expect(q.options[q.correct[0]!]).toBe("yes");
    const asked: string[] = [];
    while (game.phase !== "podium") {
      asked.push(game.hostView().question!.text);
      turn(game, clock, "low", "all");
      game.next();
    }
    expect([...asked].sort()).toEqual([0, 1, 2, 3, 4, 5].map((i) => `Question ${i}`));
    expect(byName(game, "A").correct).toBe(6);

    const plain = setup(["A"], { questions: 6 }).game;
    expect(plain.questions.map((q) => q.id)).toEqual(["q0", "q1", "q2", "q3", "q4", "q5"]);
  });

  test("podium: shared result, awards with ties, most-missed questions, CSV", () => {
    const { game, clock } = setup(["A", "B", "=C"], { questions: 3 });
    expect(game.hostView().errors).toBeNull();
    const drivers: string[] = [];
    // Two turns at "mid" with enough right answers (+20 each), then a careful one.
    drivers.push(game.driver!.nickname);
    turn(game, clock, "mid", ["B", "=C"]); // A is wrong: 2 of 3
    game.next();
    drivers.push(game.driver!.nickname);
    turn(game, clock, "mid", "all");
    game.next();
    drivers.push(game.driver!.nickname);
    turn(game, clock, "low", "all");
    game.next();
    expect(game.phase).toBe("podium");

    const v = game.hostView();
    expect(v.result!.distance).toBeCloseTo((50 + 70 + 70) / 6, 9);
    expect(v.result).toMatchObject({ topSpeed: 70, crashes: 0, turns: 3 });
    expect(v.awards!.mostCorrect).toEqual({ value: 3, nicknames: ["B", "=C"] });
    expect(v.awards!.bestDriver!.value).toBe(20);
    expect([...v.awards!.bestDriver!.nicknames].sort()).toEqual([...drivers.slice(0, 2)].sort());
    expect(v.errors).toEqual([{ wrong: 1, text: "Question 0", answers: ["yes"] }]);
    expect(v.hasResults).toBe(true);

    for (const p of game.players.values()) {
      const pv = game.playerView(p.id)!;
      expect(pv).toMatchObject({ phase: "podium", question: null, reveal: null, myChoice: null, isDriver: false, driver: null });
      expect(pv.result).toMatchObject({ topSpeed: 70, crashes: 0, turns: 3 });
      expect(pv.result!.distance).toBeCloseTo(190 / 6, 9);
      expect(pv.result!.awards).toEqual([...(p.nickname === "A" ? [] : [AWARD_MOST_CORRECT]), ...(drivers.slice(0, 2).includes(p.nickname) ? [AWARD_BEST_DRIVER] : [])]);
      expect(pv.me).toMatchObject({ correct: p.nickname === "A" ? 2 : 3, wrong: p.nickname === "A" ? 1 : 0, turnsDriven: 1, mphGained: drivers[2] === p.nickname ? 0 : 20, failsAsDriver: 0 });
    }

    const lines = buildRacerResultsCsv(game).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Nickname,Correct,Wrong,Accuracy %,Turns driven,Mph gained,Fail points as driver,Class distance (miles),Top speed (mph),Crashes");
    expect(lines).toHaveLength(4);
    const gained = (n: string) => (drivers[2] === n ? 0 : 20);
    // Formula-looking nicknames are neutralised; the shared result is in every row.
    expect(lines.slice(1).sort()).toEqual([`'=C,3,0,100,1,${gained("=C")},0,31.67,70,0`, `A,2,1,67,1,${gained("A")},0,31.67,70,0`, `B,3,0,100,1,${gained("B")},0,31.67,70,0`].sort());
    expect(lines[3]).toStartWith("A,");
  });

  test("no awards when nobody earned one", () => {
    const { game } = setup(["A", "B"]);
    game.end();
    expect(game.hostView()).toMatchObject({ phase: "podium", awards: { mostCorrect: null, bestDriver: null }, errors: [], result: { distance: 0, topSpeed: 30, crashes: 0, turns: 0 } });
    expect(game.playerView(byName(game, "A").id)!.result!.awards).toEqual([]);
  });
});

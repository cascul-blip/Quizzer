import { describe, expect, test } from "bun:test";
import { AUTO_LEADERBOARD_MS, AUTO_REVEAL_MS, GRACE_MS, Game, GameError, INTRO_MS, preparePlayOrder } from "../src/server/game/game.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function setup(opts: { pacing?: "manual" | "auto" } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const game = new Game(sampleQuiz(), { clock, pacing: opts.pacing, onFinish: () => finished++ });
  return { clock, game, finished: () => finished };
}

function toOpen(game: Game, clock: FakeClock) {
  expect(game.phase).toBe("intro");
  clock.advance(INTRO_MS);
  expect(game.phase).toBe("open");
}

describe("joining", () => {
  test("nicknames are trimmed and unique (case-insensitive)", () => {
    const { game } = setup();
    expect(game.join("  Ann   Lee ").nickname).toBe("Ann Lee");
    expect(() => game.join("ann lee")).toThrow(GameError);
    expect(() => game.join("")).toThrow(GameError);
    expect(() => game.join("x".repeat(21))).toThrow(GameError);
    expect(() => game.join(42)).toThrow(GameError);
  });

  test("cannot start without players", () => {
    const { game } = setup();
    expect(() => game.start()).toThrow(/at least one player/);
  });

  test("resume by token", () => {
    const { game } = setup();
    const p = game.join("A");
    expect(game.byToken(p.token)?.id).toBe(p.id);
    expect(game.byToken("nope")).toBeNull();
  });
});

describe("question flow", () => {
  test("closes early when every connected player has answered, and scores by speed", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    toOpen(game, clock);

    clock.advance(2000);
    expect(game.answer(a.id, 0, 1)).toBe(true); // correct at 2s of 20s → 950
    expect(game.answer(a.id, 0, 2)).toBe(false); // no second answer
    expect(game.phase).toBe("open");
    // Scores are hidden until the reveal.
    expect(a.score).toBe(0);
    clock.advance(1000);
    expect(game.answer(b.id, 0, 0)).toBe(true); // wrong
    expect(game.phase).toBe("reveal");
    expect(a.score).toBe(950);
    expect(b.score).toBe(0);
    expect(game.hostView().answerCounts).toEqual([1, 1, 0, 0]);
    expect(game.hostView().correct).toEqual([1]);
  });

  test("disconnected players don't hold up the question", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    toOpen(game, clock);
    game.answer(a.id, 0, 1);
    expect(game.phase).toBe("open");
    game.setConnected(b.id, false);
    expect(game.phase).toBe("reveal");
  });

  test("times out after the limit plus grace; late answers rejected", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    toOpen(game, clock);
    clock.advance(20_000 + GRACE_MS - 1);
    expect(game.phase).toBe("open");
    // Within grace: accepted but scored as if at the limit.
    expect(game.answer(a.id, 0, 1)).toBe(true);
    expect(a.answers[0]!.points).toBe(500);
    clock.advance(1);
    expect(game.phase).toBe("reveal");
    expect(game.answer(a.id, 0, 1)).toBe(false);
  });

  test("answers for the wrong question or out-of-range options are rejected", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    expect(game.answer(a.id, 0, 1)).toBe(false); // still intro
    clock.advance(INTRO_MS);
    expect(game.answer(a.id, 1, 1)).toBe(false);
    expect(game.answer(a.id, 0, 4)).toBe(false);
    expect(game.answer(a.id, 0, -1)).toBe(false);
    expect(game.answer(a.id, 0, 1.5)).toBe(false);
    expect(game.answer("ghost", 0, 1)).toBe(false);
  });

  test("multiple correct answers: any of them counts", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    const b = game.join("B");
    const c = game.join("C");
    game.start();
    for (let i = 0; i < 2; i++) {
      toOpen(game, clock);
      game.skip();
      game.next(); // → leaderboard
      game.next(); // → intro
    }
    toOpen(game, clock);
    game.answer(a.id, 2, 0);
    game.answer(b.id, 2, 2);
    game.answer(c.id, 2, 1);
    expect([a, b, c].map((p) => p.answers[2]!.correct)).toEqual([true, true, false]);
  });

  test("manual pacing walks through every phase to the podium", () => {
    const { game, clock, finished } = setup();
    game.join("A");
    game.start();
    const seen: string[] = [];
    for (let guard = 0; guard < 50 && game.phase !== "podium"; guard++) {
      seen.push(game.phase);
      game.next();
    }
    expect(seen).toEqual(["intro", "open", "reveal", "leaderboard", "intro", "open", "reveal", "leaderboard", "intro", "open", "reveal"]);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    // Manual pacing never advances on its own.
    clock.advance(60_000);
    expect(game.phase).toBe("podium");
  });

  test("manual pacing waits on reveal", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    clock.advance(60_000);
    expect(game.phase).toBe("reveal");
  });

  test("auto pacing advances reveal → leaderboard → next intro", () => {
    const { game, clock } = setup({ pacing: "auto" });
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    expect(game.phase).toBe("reveal");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("leaderboard");
    clock.advance(AUTO_LEADERBOARD_MS);
    expect(game.phase).toBe("intro");
    expect(game.qIndex).toBe(1);
  });

  test("switching to auto mid-reveal schedules the advance", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    toOpen(game, clock);
    game.skip();
    game.setPacing("auto");
    clock.advance(AUTO_REVEAL_MS);
    expect(game.phase).toBe("leaderboard");
  });

  test("end() jumps to the podium from anywhere", () => {
    const { game, clock, finished } = setup();
    const a = game.join("A");
    game.start();
    toOpen(game, clock);
    game.answer(a.id, 0, 1);
    game.end();
    expect(game.phase).toBe("podium");
    expect(a.score).toBeGreaterThan(0);
    expect(finished()).toBe(1);
    expect(() => game.join("Late")).toThrow(/finished/);
  });

  test("kick removes the player and invalidates their token", () => {
    const { game } = setup();
    const a = game.join("A");
    game.kick(a.id);
    expect(game.players.size).toBe(0);
    expect(game.byToken(a.token)).toBeNull();
    // Nickname becomes available again.
    expect(game.join("A").nickname).toBe("A");
  });
});

describe("views", () => {
  test("players never see the correct answer before the reveal", () => {
    const { game, clock } = setup();
    const a = game.join("A");
    game.join("B");
    game.start();
    let v = game.playerView(a.id);
    expect(v.kind === "player" && v.question?.options).toEqual([]); // intro hides options
    clock.advance(INTRO_MS);
    v = game.playerView(a.id);
    expect(JSON.stringify(v)).not.toContain('"correct"');
    expect(JSON.stringify(game.hostView().correct)).toBe("null");
    game.answer(a.id, 0, 2);
    v = game.playerView(a.id);
    expect(v.kind === "player" && v.myChoice).toBe(2);
    game.skip();
    v = game.playerView(a.id);
    expect(v.kind === "player" && v.result).toEqual({ choice: 2, correct: [1], wasCorrect: false, points: 0 });
  });

  test("remainingMs counts down", () => {
    const { game, clock } = setup();
    game.join("A");
    game.start();
    clock.advance(INTRO_MS + 5000);
    expect(game.hostView().question!.remainingMs).toBe(15_000);
  });
});

describe("preparePlayOrder", () => {
  test("no shuffle keeps order", () => {
    expect(preparePlayOrder(sampleQuiz()).map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  test("answer shuffle remaps correct indices; true/false stays put", () => {
    const quiz = sampleQuiz({ settings: { shuffleQuestions: false, shuffleAnswers: true } });
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const qs = preparePlayOrder(quiz, rng);
      const [q1, q2, q3] = qs;
      expect(q1!.correct.map((i) => q1!.options[i])).toEqual(["4"]);
      expect(q2!.options).toEqual(["True", "False"]);
      expect(q3!.correct.map((i) => q3!.options[i]).sort()).toEqual(["2", "7"]);
    }
    // The source quiz is untouched.
    expect(quiz.questions[0]!.options).toEqual(["3", "4", "5", "22"]);
  });

  test("question shuffle is a permutation", () => {
    const quiz = sampleQuiz({ settings: { shuffleQuestions: true, shuffleAnswers: false } });
    expect(preparePlayOrder(quiz, () => 0).map((q) => q.id).sort()).toEqual(["q1", "q2", "q3"]);
  });
});

import { describe, expect, test } from "bun:test";
import { topErrors } from "../src/server/game/common.ts";
import { COUNTDOWN_MS as FIGHT_COUNTDOWN_MS, FightGame } from "../src/server/game/fight.ts";
import { Game, INTRO_MS } from "../src/server/game/game.ts";
import { COUNTDOWN_MS as LAND_COUNTDOWN_MS, LandGame } from "../src/server/game/land.ts";
import { COUNTDOWN_MS as ROBOT_COUNTDOWN_MS, RobotGame } from "../src/server/game/robot.ts";
import { FEEDBACK_MS, type StreamPlayer } from "../src/server/game/stream.ts";
import { COUNTDOWN_MS as SUB_COUNTDOWN_MS, SubGame } from "../src/server/game/submarine.ts";
import { COUNTDOWN_MS as TOWER_COUNTDOWN_MS, TowerGame } from "../src/server/game/tower.ts";
import { ERRORS_SHOWN, type GameMode, type QuestionError } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

/** `count` questions; question i's correct answer is "yes i" (and "also i" for the last one). */
function quiz(count: number): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: [`yes ${i}`, "no", "maybe", ...(i === count - 1 ? [`also ${i}`] : [])],
      correct: i === count - 1 ? [0, 3] : [0],
    })),
  });
}

describe("topErrors", () => {
  const questions = quiz(14).questions;

  test("worst first, ties in quiz order, nothing for questions nobody got wrong", () => {
    expect(topErrors(questions, [0, 2, 5, 2])).toEqual([
      { wrong: 5, text: "Question 2", answers: ["yes 2"] },
      { wrong: 2, text: "Question 1", answers: ["yes 1"] },
      { wrong: 2, text: "Question 3", answers: ["yes 3"] },
    ]);
    expect(topErrors(questions, [])).toEqual([]);
  });

  test("only the ten worst are listed; every correct option is named", () => {
    const errors = topErrors(questions, questions.map((_, i) => i + 1));
    expect(errors).toHaveLength(ERRORS_SHOWN);
    expect(errors[0]).toEqual({ wrong: 14, text: "Question 13", answers: ["yes 13", "also 13"] });
    expect(errors.at(-1)!.wrong).toBe(5);
  });
});

describe("Classic", () => {
  function play(shuffleAnswers = false) {
    const clock = new FakeClock();
    const game = new Game(quiz(3), { clock });
    if (shuffleAnswers) game.setShuffle({ questions: false, answers: true });
    const [a, b, c] = ["A", "B", "C"].map((n) => game.join(n));
    game.start();
    return { clock, game, a: a!, b: b!, c: c! };
  }
  /** Open the current question and have each listed player answer right (true) or wrong (false). */
  function answerAll(s: ReturnType<typeof play>, picks: [string, boolean][]) {
    s.clock.advance(INTRO_MS);
    const q = s.game.currentQuestion!;
    for (const [id, right] of picks) {
      const option = right ? q.correct[0]! : q.options.findIndex((_, i) => !q.correct.includes(i));
      expect(s.game.answer(id, s.game.qIndex, option)).toBe(true);
    }
    if (s.game.phase === "open") s.game.next();
    s.game.next();
    if (s.game.phase === "leaderboard") s.game.next();
  }

  test("wrong answers are counted per question; unanswered questions are not", () => {
    const s = play();
    answerAll(s, [[s.a.id, false], [s.b.id, true]]); // C lets it time out
    expect(s.game.hostView().errors).toBeNull();
    answerAll(s, [[s.a.id, false], [s.b.id, false], [s.c.id, false]]);
    answerAll(s, [[s.a.id, true], [s.b.id, true], [s.c.id, true]]);
    expect(s.game.phase).toBe("podium");
    expect(s.game.hostView().errors).toEqual([
      { wrong: 3, text: "Question 1", answers: ["yes 1"] },
      { wrong: 1, text: "Question 0", answers: ["yes 0"] },
    ]);
  });

  test("the correct answer is right even when answer positions are shuffled", () => {
    const s = play(true);
    for (let i = 0; i < 3; i++) answerAll(s, [[s.a.id, false]]);
    expect(s.game.hostView().errors).toEqual([
      { wrong: 1, text: "Question 0", answers: ["yes 0"] },
      { wrong: 1, text: "Question 1", answers: ["yes 1"] },
      { wrong: 1, text: "Question 2", answers: expect.arrayContaining(["yes 2", "also 2"]) },
    ]);
  });
});

describe("own-pace modes", () => {
  type Live = TowerGame | SubGame | FightGame | RobotGame | LandGame;
  const modes: [GameMode, number, (lobby: Game, clock: FakeClock) => Live][] = [
    ["tower", TOWER_COUNTDOWN_MS, (l, clock) => TowerGame.fromLobby(l, { clock })],
    ["submarine", SUB_COUNTDOWN_MS, (l, clock) => SubGame.fromLobby(l, { clock })],
    ["fight", FIGHT_COUNTDOWN_MS, (l, clock) => FightGame.fromLobby(l, { clock })],
    ["robot", ROBOT_COUNTDOWN_MS, (l, clock) => RobotGame.fromLobby(l, { clock })],
    ["land", LAND_COUNTDOWN_MS, (l, clock) => LandGame.fromLobby(l, { clock })],
  ];

  for (const [mode, countdown, make] of modes) {
    test(`${mode}: every wrong answer counts, repeats included, and shows at the podium only`, () => {
      const clock = new FakeClock();
      const lobby = new Game(quiz(2), { clock });
      lobby.setMode(mode);
      lobby.join("A");
      lobby.join("B");
      const game = make(lobby, clock);
      game.start();
      clock.advance(countdown);

      const expected = [0, 0];
      for (const p of game.players.values() as Iterable<StreamPlayer & { id: string }>) {
        // Two answers each: wrong, then right. With 2 questions that is one of each question.
        for (const right of [false, true]) {
          const cur = p.current!;
          const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
          expect(game.answer(p.id, cur.seq, option)).toBe(true);
          if (!right) expected[cur.qIndex]!++;
          clock.advance(FEEDBACK_MS);
        }
      }
      expect(game.hostView().errors).toBeNull();
      game.end();
      expect(game.phase).toBe("podium");
      const want: QuestionError[] = [
        { wrong: expected[0]!, text: "Question 0", answers: ["yes 0"] },
        { wrong: expected[1]!, text: "Question 1", answers: ["yes 1", "also 1"] },
      ]
        .filter((e) => e.wrong > 0)
        .sort((a, b) => b.wrong - a.wrong);
      expect(expected[0]! + expected[1]!).toBe(2);
      expect(game.hostView().errors).toEqual(want);
    });
  }
});

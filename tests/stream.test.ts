import { describe, expect, test } from "bun:test";
import { QuestionStream } from "../src/server/game/stream.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

describe("QuestionStream", () => {
  test("keeps each deck independent and avoids repeating across a reshuffle", () => {
    const clock = new FakeClock();
    const { questions } = sampleQuiz();
    const draws = [0, 0];
    const stream = new QuestionStream(questions, false, () => draws.shift() ?? 0.99, clock, { canAnswer: () => true });
    const original = { nickname: "A" };
    const player = stream.registerPlayer(original);
    expect(original).toBe(player);
    const second = stream.registerPlayer({});
    expect(stream.questionView(player)).toBeNull();
    stream.open(player);
    const first = stream.questionView(player);
    stream.open(player);
    expect(stream.questionView(player)).toEqual(first);
    stream.open(second);

    const seen: string[] = [];
    const secondDeck: string[] = [];
    for (let i = 0; i < 6; i++) {
      const question = stream.questionView(player)!;
      seen.push(question.text);
      expect(stream.answer(player, question.seq, 0)).not.toBeNull();
      if (i % 2 === 0) {
        const otherQuestion = stream.questionView(second)!;
        secondDeck.push(otherQuestion.text);
        expect(stream.answer(second, otherQuestion.seq, 0)).not.toBeNull();
      }
      clock.advance(1000);
    }
    const expected = questions.map((q) => q.text).sort();
    expect(seen.slice(0, 3).sort()).toEqual(expected);
    expect(seen.slice(3, 6).sort()).toEqual(expected);
    expect(seen[2]).not.toBe(seen[3]);
    expect(secondDeck).toEqual(questions.map((q) => q.text));
    expect(player.correct + player.wrong).toBe(6);
    expect(second.correct + second.wrong).toBe(3);
  });

  test("rejects invalid, stale, and early answers and resets the penalty after a correct answer", () => {
    const clock = new FakeClock();
    const stream = new QuestionStream(sampleQuiz().questions.slice(0, 1), false, () => 0, clock, { penalizeGuessing: true, canAnswer: () => true });
    const player = stream.registerPlayer({});
    stream.open(player);
    const answer = (option: number) => stream.answer(player, stream.questionView(player)!.seq, option);

    expect(answer(-1)).toBeNull();
    expect(answer(99)).toBeNull();
    expect(answer(0)).toBe(false);
    expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyDurationMs: 0, answers: ["4"] });
    clock.advance(1000);
    expect(stream.answer(player, 1, 1)).toBeNull();

    for (const penaltyDurationMs of [3000, 4000, 4000]) {
      expect(answer(0)).toBe(false);
      expect(stream.feedbackEndsAt(player)).toBe(clock.now() + 1000 + penaltyDurationMs);
      clock.advance(1000 + penaltyDurationMs - 1);
      stream.resume(player);
      expect(answer(1)).toBeNull();
      expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1, penaltyDurationMs });
      clock.advance(1);
      expect(stream.feedbackView(player)).toBeNull();
    }

    expect(answer(1)).toBe(true);
    clock.advance(1000);
    expect(answer(0)).toBe(false);
    expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyDurationMs: 0 });
    expect([player.correct, player.wrong]).toEqual([1, 5]);
  });

  test("without Protect from abuse every wrong answer has the same wait", () => {
    const clock = new FakeClock();
    const stream = new QuestionStream(sampleQuiz().questions.slice(0, 1), false, () => 0, clock, { canAnswer: () => true });
    const player = stream.registerPlayer({});
    stream.open(player);
    for (let seq = 1; seq <= 4; seq++) {
      expect(stream.answer(player, seq, 0)).toBe(false);
      expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyDurationMs: 0 });
      clock.advance(1000);
    }
  });

  test("refuses an answer exactly when the fragment shows no question, and hides feedback outside play", () => {
    const clock = new FakeClock();
    let open = true;
    const stream = new QuestionStream(sampleQuiz().questions, false, () => 0, clock, { canAnswer: () => open });
    const player = stream.registerPlayer({});
    expect(stream.fragment(player)).toEqual({ question: null, feedback: null });
    stream.open(player);
    expect(stream.fragment(player).question).toEqual(stream.questionView(player));

    open = false;
    expect(stream.fragment(player)).toEqual({ question: null, feedback: null });
    expect(stream.answer(player, stream.questionView(player)!.seq, 0)).toBeNull();
    expect([player.correct, player.wrong]).toEqual([0, 0]);

    open = true;
    expect(stream.answer(player, stream.questionView(player)!.seq, 0)).not.toBeNull();
    expect(stream.fragment(player).feedback).toEqual(stream.feedbackView(player));
    expect(stream.fragment(player).feedback).not.toBeNull();
    open = false;
    expect(stream.fragment(player).feedback).toBeNull();
    expect(stream.feedbackView(player)).not.toBeNull();
    open = true;
    clock.advance(1000);
    expect(stream.fragment(player).feedback).toBeNull();
  });

  test("a player who joins mid-game gets a question only when the mode is in play", () => {
    const stream = new QuestionStream(sampleQuiz().questions, false, () => 0, new FakeClock(), { canAnswer: () => true });
    const early = stream.registerPlayer({});
    stream.openOnJoin(early, false);
    expect(stream.questionView(early)).toBeNull();
    const late = stream.registerPlayer({});
    stream.openOnJoin(late, true);
    const first = stream.questionView(late);
    expect(first).not.toBeNull();
    stream.openOnJoin(late, true);
    expect(stream.questionView(late)).toEqual(first);
  });

  test("errorsWhen lists the most-missed questions only once the game has finished", () => {
    const clock = new FakeClock();
    const stream = new QuestionStream(sampleQuiz().questions.slice(0, 1), false, () => 0, clock, { canAnswer: () => true });
    const player = stream.registerPlayer({});
    stream.open(player);
    stream.answer(player, 1, 0);
    expect(stream.errorsWhen(false)).toBeNull();
    expect(stream.errorsWhen(true)).toEqual(stream.errors());
    expect(stream.errorsWhen(true)).toHaveLength(1);
  });
});

import { describe, expect, test } from "bun:test";
import { QuestionStream } from "../src/server/game/stream.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

describe("QuestionStream", () => {
  test("keeps each deck independent and avoids repeating across a reshuffle", () => {
    const clock = new FakeClock();
    const { questions } = sampleQuiz();
    const draws = [0, 0];
    const stream = new QuestionStream(questions, false, () => draws.shift() ?? 0.99, clock);
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
    const stream = new QuestionStream(sampleQuiz().questions.slice(0, 1), false, () => 0, clock, true);
    const player = stream.registerPlayer({});
    stream.open(player);
    const answer = (option: number) => stream.answer(player, stream.questionView(player)!.seq, option);

    expect(answer(-1)).toBeNull();
    expect(answer(99)).toBeNull();
    expect(answer(0)).toBe(false);
    expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyMs: 0, answers: ["4"] });
    clock.advance(1000);
    expect(stream.answer(player, 1, 1)).toBeNull();

    for (const penaltyMs of [3000, 4000, 4000]) {
      expect(answer(0)).toBe(false);
      expect(stream.feedbackEndsAt(player)).toBe(clock.now() + 1000 + penaltyMs);
      clock.advance(1000 + penaltyMs - 1);
      stream.resume(player);
      expect(answer(1)).toBeNull();
      expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1, penaltyMs });
      clock.advance(1);
      expect(stream.feedbackView(player)).toBeNull();
    }

    expect(answer(1)).toBe(true);
    clock.advance(1000);
    expect(answer(0)).toBe(false);
    expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyMs: 0 });
    expect([player.correct, player.wrong]).toEqual([1, 5]);
  });

  test("without Protect from abuse every wrong answer has the same wait", () => {
    const clock = new FakeClock();
    const stream = new QuestionStream(sampleQuiz().questions.slice(0, 1), false, () => 0, clock);
    const player = stream.registerPlayer({});
    stream.open(player);
    for (let seq = 1; seq <= 4; seq++) {
      expect(stream.answer(player, seq, 0)).toBe(false);
      expect(stream.feedbackView(player)).toMatchObject({ remainingMs: 1000, penaltyMs: 0 });
      clock.advance(1000);
    }
  });
});

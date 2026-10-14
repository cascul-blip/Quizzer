import { describe, expect, test } from "bun:test";
import { checkAnswer, matchesAnswer } from "../src/shared/answer-match.ts";
import { normalizeQuestion } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";
import { Game, INTRO_MS } from "../src/server/game/game.ts";

describe("matchesAnswer", () => {
  test("ignores case, spacing and punctuation", () => {
    expect(matchesAnswer("  AIRPLANE ", ["Airplane"])).toBe(true);
    expect(matchesAnswer("new   york!", ["New York"])).toBe(true);
  });

  test("ignores plural endings in either direction", () => {
    expect(matchesAnswer("Airplanes", ["Airplane"])).toBe(true);
    expect(matchesAnswer("airplane", ["Airplanes"])).toBe(true);
    expect(matchesAnswer("berries", ["Berry"])).toBe(true);
    expect(matchesAnswer("Boxes", ["box"])).toBe(true);
    expect(matchesAnswer("red apples", ["Red Apple"])).toBe(true);
  });

  test("does not mangle words that only look plural", () => {
    expect(matchesAnswer("bus", ["Buses"])).toBe(true);
    expect(matchesAnswer("glas", ["Glass"])).toBe(false);
    expect(matchesAnswer("cactus", ["cactu"])).toBe(false);
  });

  test("accepts any listed answer and rejects wrong or empty ones", () => {
    expect(matchesAnswer("aeroplane", ["Airplane", "Aeroplane"])).toBe(true);
    expect(matchesAnswer("helicopter", ["Airplane"])).toBe(false);
    expect(matchesAnswer("  ", ["Airplane"])).toBe(false);
  });
});

describe("checkAnswer", () => {
  const text = { type: "text", options: ["Airplane"], correct: [0] };
  const mc = { type: "multiple_choice", options: ["a", "b"], correct: [1] };
  test("typed answers only for text questions, indices only for the others", () => {
    expect(checkAnswer(text, "airplanes")).toBe(true);
    expect(checkAnswer(text, 0)).toBeNull();
    expect(checkAnswer(mc, 1)).toBe(true);
    expect(checkAnswer(mc, 0)).toBe(false);
    expect(checkAnswer(mc, 5)).toBeNull();
    expect(checkAnswer(mc, "b")).toBeNull();
  });
});

describe("text questions", () => {
  test("normalize: options are the accepted answers and correct is filled in", () => {
    const q = normalizeQuestion({ type: "text", text: "Flies?", options: ["Airplane", "Aeroplane"] });
    expect(q.correct).toEqual([0, 1]);
    expect(() => normalizeQuestion({ type: "text", text: "x" })).toThrow();
  });

  test("a classic game scores a typed answer and hides the accepted answers until the reveal", () => {
    const clock = new FakeClock();
    const q = normalizeQuestion({ type: "text", text: "Flies?", options: ["Airplane"] });
    const game = new Game(sampleQuiz({ questions: [q] }), { clock });
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    clock.advance(INTRO_MS);
    expect(game.hostView().question?.options).toEqual([]);
    expect(game.answer(a.id, 0, "Airplanes")).toBe(true);
    expect(game.answer(b.id, 0, 0)).toBe(false);
    expect(game.answer(b.id, 0, "helicopter")).toBe(true);
    game.skip();
    const va = game.playerView(a.id);
    const vb = game.playerView(b.id);
    expect(va.kind === "player" && va.result?.wasCorrect).toBe(true);
    expect(va.kind === "player" && va.myText).toBe("Airplanes");
    expect(vb.kind === "player" && vb.result?.wasCorrect).toBe(false);
    expect(game.hostView().question?.options).toEqual(["Airplane"]);
  });
});

describe("text questions in the streamed modes", () => {
  test("a typed answer is checked, and the question view never carries the accepted answers", async () => {
    const { QuestionStream, newStreamPlayer } = await import("../src/server/game/stream.ts");
    const clock = new FakeClock();
    const q = normalizeQuestion({ type: "text", text: "Flies?", options: ["Airplane"] });
    const stream = new QuestionStream([q], false, () => 0.5, clock);
    const p = newStreamPlayer();
    stream.deal(p);
    expect(stream.questionView(p)?.options).toEqual([]);
    expect(stream.answer(p, p.seq, 0)).toBeNull();
    expect(stream.answer(p, p.seq, "AIRPLANES")).toBe(true);
    clock.advance(5000);
    expect(stream.answer(p, p.seq, "boat")).toBe(false);
    expect(stream.feedbackView(p)?.answers).toEqual(["Airplane"]);
  });
});

import { describe, expect, test } from "bun:test";
import { ValidationError, normalizeQuestion, normalizeQuestions, slugify } from "../src/shared/quiz-schema.ts";

describe("normalizeQuestion", () => {
  test("fills defaults and generates an id", () => {
    const q = normalizeQuestion({ type: "multiple_choice", text: "Q?", options: ["a", "b"], correct: [0] });
    expect(q.timeLimitSec).toBe(20);
    expect(q.id).toMatch(/^q[a-z0-9]{5}$/);
  });

  test("true_false gets fixed options", () => {
    const q = normalizeQuestion({ type: "true_false", text: "Water is wet", correct: [1] });
    expect(q.options).toEqual(["True", "False"]);
    expect(q.correct).toEqual([1]);
  });

  test("true_false ignores custom options", () => {
    const q = normalizeQuestion({ type: "true_false", text: "x", options: ["Yes", "No"], correct: [0] });
    expect(q.options).toEqual(["True", "False"]);
  });

  test("multiple correct answers are allowed", () => {
    expect(normalizeQuestion({ type: "multiple_choice", text: "x", options: ["a", "b", "c"], correct: [0, 2] }).correct).toEqual([0, 2]);
  });

  const bad: [string, unknown][] = [
    ["5 options", { type: "multiple_choice", text: "x", options: ["a", "b", "c", "d", "e"], correct: [0] }],
    ["1 option", { type: "multiple_choice", text: "x", options: ["a"], correct: [0] }],
    ["no options", { type: "multiple_choice", text: "x", correct: [0] }],
    ["empty correct", { type: "multiple_choice", text: "x", options: ["a", "b"], correct: [] }],
    ["correct out of range", { type: "multiple_choice", text: "x", options: ["a", "b"], correct: [2] }],
    ["duplicate correct", { type: "multiple_choice", text: "x", options: ["a", "b"], correct: [1, 1] }],
    ["blank text", { type: "multiple_choice", text: "   ", options: ["a", "b"], correct: [0] }],
    ["blank option", { type: "multiple_choice", text: "x", options: ["a", " "], correct: [0] }],
    ["tf with two correct", { type: "true_false", text: "x", correct: [0, 1] }],
    ["time limit too short", { type: "true_false", text: "x", correct: [0], timeLimitSec: 2 }],
    ["unknown type", { type: "essay", text: "x", correct: [0] }],
    ["bad image ref", { type: "true_false", text: "x", correct: [0], image: "../../etc/passwd" }],
  ];
  for (const [name, input] of bad) {
    test(`rejects ${name}`, () => expect(() => normalizeQuestion(input)).toThrow(ValidationError));
  }
});

describe("normalizeQuestions", () => {
  test("reassigns duplicate ids and reports the failing index", () => {
    const qs = normalizeQuestions([
      { id: "same", type: "true_false", text: "a", correct: [0] },
      { id: "same", type: "true_false", text: "b", correct: [0] },
    ]);
    expect(qs[0]!.id).toBe("same");
    expect(qs[1]!.id).not.toBe("same");
    expect(() => normalizeQuestions([{ type: "true_false", text: "a", correct: [0] }, { type: "true_false", text: "", correct: [0] }])).toThrow(
      /questions\.1/,
    );
  });
});

test("slugify", () => {
  expect(slugify("Café Quiz #1!")).toBe("cafe-quiz-1");
  expect(slugify("!!!")).toBe("quiz");
});

test("examples/sample-quiz.json is a valid quiz", async () => {
  const { QuizDraft } = await import("../src/shared/quiz-schema.ts");
  const sample = await Bun.file(new URL("../examples/sample-quiz.json", import.meta.url)).json();
  expect(QuizDraft.safeParse(sample).success).toBe(true);
  expect(normalizeQuestions(sample.questions)).toHaveLength(8);
});

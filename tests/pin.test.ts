import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Game, INTRO_MS, preparePlayOrder } from "../src/server/game/game.ts";
import { QuestionStream, newStreamPlayer } from "../src/server/game/stream.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { SERVER_INSTRUCTIONS } from "../src/server/mcp/tools.ts";
import { ValidationError, normalizeQuestion, type Question } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";

const IMAGE = "media/abc123.png";
const SPOTS = [
  { x: 0.1, y: 0.2 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.3 },
  { x: 0.2, y: 0.8 },
  { x: 0.7, y: 0.9 },
  { x: 0.4, y: 0.1 },
];

function pinQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "pin1",
    type: "pin",
    text: "Where is the deltoid?",
    image: IMAGE,
    timeLimitSec: 30,
    options: ["56", "57", "58", "59", "60", "61"],
    spots: SPOTS,
    correct: [4],
    ...overrides,
  };
}

describe("pin schema", () => {
  test("a valid pin question keeps its labels and spots", () => {
    const q = normalizeQuestion({ type: "pin", text: "Where?", image: IMAGE, options: ["56", "57"], spots: SPOTS.slice(0, 2), correct: [1] });
    expect(q).toMatchObject({ type: "pin", options: ["56", "57"], spots: SPOTS.slice(0, 2), correct: [1] });
  });

  test("labels default to A, B, C…", () => {
    expect(normalizeQuestion({ type: "pin", text: "Where?", image: IMAGE, spots: SPOTS.slice(0, 3), correct: [0] }).options).toEqual(["A", "B", "C"]);
  });

  test("up to 20 spots", () => {
    const spots = Array.from({ length: 20 }, (_, i) => ({ x: i / 20, y: 0.5 }));
    expect(normalizeQuestion({ type: "pin", text: "x", image: IMAGE, spots, correct: [19] }).options).toHaveLength(20);
    expect(() => normalizeQuestion({ type: "pin", text: "x", image: IMAGE, spots: [...spots, { x: 1, y: 1 }], correct: [0] })).toThrow(ValidationError);
  });

  const base = { type: "pin", text: "x", image: IMAGE, spots: SPOTS.slice(0, 2), correct: [0] };
  const bad: [string, unknown][] = [
    ["no image", { ...base, image: undefined }],
    ["no spots", { ...base, spots: undefined }],
    ["one spot", { ...base, spots: SPOTS.slice(0, 1) }],
    ["labels and spots differ in number", { ...base, options: ["A", "B", "C"] }],
    ["two correct spots", { ...base, correct: [0, 1] }],
    ["correct out of range", { ...base, correct: [2] }],
    ["spot outside the image", { ...base, spots: [{ x: 0.5, y: 1.2 }, SPOTS[0]] }],
    ["spots on multiple choice", { type: "multiple_choice", text: "x", options: ["a", "b"], spots: SPOTS.slice(0, 2), correct: [0] }],
  ];
  for (const [name, input] of bad) {
    test(`rejects ${name}`, () => expect(() => normalizeQuestion(input)).toThrow(ValidationError));
  }
});

describe("pin in the store", () => {
  let t: ReturnType<typeof tempDir>;
  let store: QuizStore;
  beforeEach(() => {
    t = tempDir();
    store = new QuizStore(t.dir);
  });
  afterEach(() => t.cleanup());

  test("switching a question to pin and back", () => {
    const quiz = store.create({ title: "Muscles", questions: [{ type: "multiple_choice", text: "Where?", options: ["a", "b", "c"], correct: [2], image: IMAGE }] });
    const id = quiz.questions[0]!.id;
    const pin = store.updateQuestion(quiz.id, id, { type: "pin", spots: SPOTS.slice(0, 3) });
    expect(pin).toMatchObject({ type: "pin", options: ["A", "B", "C"], correct: [0], spots: SPOTS.slice(0, 3) });
    const mc = store.updateQuestion(quiz.id, id, { type: "multiple_choice" });
    expect(mc.type).toBe("multiple_choice");
    expect(mc.spots).toBeUndefined();
  });
});

describe("pin in a game", () => {
  function setup() {
    const clock = new FakeClock();
    const game = new Game(sampleQuiz({ questions: [pinQuestion()] }), { clock });
    return { clock, game };
  }

  test("players see the spots but not the answer; the spot index is the answer", () => {
    const { clock, game } = setup();
    const a = game.join("A");
    const b = game.join("B");
    game.start();
    expect(game.playerView(a.id)).toMatchObject({ question: { options: [] } });
    expect((game.playerView(a.id) as { question: { spots?: unknown } }).question.spots).toBeUndefined();
    clock.advance(INTRO_MS);
    const view = game.playerView(a.id) as { question: { spots?: unknown }; result: unknown };
    expect(view.question.spots).toEqual(SPOTS);
    expect(view.result).toBeNull();
    expect(game.hostView().correct).toBeNull();

    expect(game.answer(a.id, 0, 6)).toBe(false); // no such spot
    expect(game.answer(a.id, 0, 4)).toBe(true);
    expect(game.answer(b.id, 0, 1)).toBe(true);
    expect(game.phase).toBe("reveal");
    expect([a, b].map((p) => p.answers[0]!.correct)).toEqual([true, false]);
    expect(a.score).toBeGreaterThan(0);
    expect(game.hostView().answerCounts).toEqual([0, 1, 0, 0, 1, 0]);
  });

  test("answer shuffling leaves spots where they are", () => {
    const [q] = preparePlayOrder([pinQuestion()], { questions: false, answers: true }, () => 0.3);
    expect(q!.options).toEqual(["56", "57", "58", "59", "60", "61"]);
    expect(q!.spots).toEqual(SPOTS);
    expect(q!.correct).toEqual([4]);
  });

  test("self-paced modes: the stream sends spots and scores the spot index", () => {
    const clock = new FakeClock();
    const stream = new QuestionStream([pinQuestion()], true, () => 0.3, clock);
    const p = newStreamPlayer();
    stream.deal(p);
    const view = stream.questionView(p)!;
    expect(view.spots).toEqual(SPOTS);
    expect(stream.answer(p, view.seq, 2)).toBe(false);
    expect(p.feedback?.answers).toEqual(["60"]);
    clock.advance(5000);
    expect(stream.answer(p, stream.questionView(p)!.seq, 4)).toBe(true);
  });
});

test("MCP instructions explain pin questions", () => {
  expect(SERVER_INSTRUCTIONS).toContain('"pin"');
  expect(SERVER_INSTRUCTIONS).toContain("spots");
});

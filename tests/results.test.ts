import { expect, test } from "bun:test";
import { buildClassicResults } from "../src/server/game/classic.ts";
import { INTRO_MS } from "../src/server/game/game.ts";
import { records, resultsCsv, sheet, toCsv } from "../src/server/game/results.ts";
import { classicGame, FakeClock, sampleQuiz } from "./helpers.ts";

test("classic results have one row per player in rank order, with per-question columns", () => {
  const clock = new FakeClock();
  const game = classicGame(sampleQuiz(), { clock });
  const a = game.join("Alice");
  const b = game.join("Bob");
  game.start();
  clock.advance(INTRO_MS + 1000);
  game.answer(b.id, 0, 1);
  game.answer(a.id, 0, 0);
  game.end();

  const results = buildClassicResults(game);
  expect(results.header.slice(0, 8)).toEqual([
    "Rank",
    "Nickname",
    "Score",
    "Correct answers",
    `Q1 answer (${game.questions[0]!.text})`,
    "Q1 correct",
    "Q1 points",
    "Q1 time (s)",
  ]);
  const [first, second] = records(results);
  expect(first).toMatchObject({ Rank: 1, Nickname: "Bob", Score: 975, "Correct answers": 1, "Q1 correct": "yes", "Q1 points": 975, "Q1 time (s)": "1.00" });
  expect(second).toMatchObject({ Rank: 2, Nickname: "Alice", Score: 0, "Q1 correct": "no", "Q1 points": 0 });
  expect(second).toMatchObject({ [`Q2 answer (${game.questions[1]!.text})`]: "", "Q2 correct": "no answer", "Q2 points": 0, "Q2 time (s)": "" });
});

test("CSV cells are quoted where needed and formula-looking text is neutralised", () => {
  const csv = toCsv([['Say "hi", ok?', "=cmd", -3, "-x"]]);
  expect(csv).toBe(String.fromCodePoint(0xfeff) + '"Say ""hi"", ok?",\'=cmd,-3,\'-x\r\n');
});

test("a row narrower or wider than the header is refused", () => {
  expect(() => resultsCsv({ header: ["A", "B"], rows: [[1, 2], [3]] })).toThrow("Results row 2 has 1 cells for 2 columns");
});

test("the appendix follows the rows after a blank line", () => {
  const s = sheet([{ header: "N", value: (n: number) => n }], [1, 2], [["Log"], ["x", "y"]]);
  expect(resultsCsv(s).slice(1)).toBe("N\r\n1\r\n2\r\n\r\nLog\r\nx,y\r\n");
});

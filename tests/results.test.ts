import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildClassicResults } from "../src/server/game/classic.ts";
import { INTRO_MS } from "../src/server/game/game.ts";
import { BOM, records, resultsCsv, saveResults, sheet, toCsv } from "../src/server/game/results.ts";
import { classicGame, FakeClock, sampleQuiz, tempDir } from "./helpers.ts";

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
  expect(csv).toBe(BOM + '"Say ""hi"", ok?",\'=cmd,-3,\'-x\r\n');
});

test("a row narrower or wider than the header is refused", () => {
  expect(() => resultsCsv({ header: ["A", "B"], rows: [[1, 2], [3]] })).toThrow("Results row 2 has 1 cells for 2 columns");
});

test("the appendix follows the rows after a blank line", () => {
  const s = sheet([{ header: "N", value: (n: number) => n }], [1, 2], [["Log"], ["x", "y"]]);
  expect(resultsCsv(s).slice(1)).toBe("N\r\n1\r\n2\r\n\r\nLog\r\nx,y\r\n");
});

describe("saveResults", () => {
  const good = { header: ["Nickname", "Score"], rows: [["Ann", 3]] };
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  test("writes the CSV to a file named for the quiz and logs where", () => {
    const logs: string[] = [];
    const { csv, file } = saveResults({ quizId: "quiz-a" }, good, t.dir, (m) => logs.push(m));
    expect(csv.slice(1)).toBe("Nickname,Score\r\nAnn,3\r\n");
    expect(file).toStartWith(t.dir);
    expect(file).toEndWith("_quiz-a.csv");
    expect(readFileSync(file!, "utf8")).toBe(csv);
    expect(logs).toEqual([`Results saved to ${file}`]);
  });

  test("a folder it can't write to is logged, and the CSV is still returned", () => {
    const logs: string[] = [];
    const { csv, file } = saveResults({ quizId: "quiz-a" }, good, join(t.dir, "missing"), (m) => logs.push(m));
    expect(file).toBeNull();
    expect(csv.slice(1)).toBe("Nickname,Score\r\nAnn,3\r\n");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toStartWith("Could not save results: ");
  });

  test("a malformed sheet is logged instead of thrown, and no file is written", () => {
    const logs: string[] = [];
    const { csv, file } = saveResults({ quizId: "quiz-a" }, { header: ["A", "B"], rows: [[1]] }, t.dir, (m) => logs.push(m));
    expect(file).toBeNull();
    expect(csv.slice(1)).toBe("A,B\r\n1\r\n");
    expect(logs).toEqual(["Could not save results: Results row 1 has 1 cells for 2 columns"]);
  });
});

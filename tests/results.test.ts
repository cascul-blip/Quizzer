import { expect, test } from "bun:test";
import { Game, INTRO_MS } from "../src/server/game/game.ts";
import { buildResultsCsv } from "../src/server/game/results.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

test("results CSV has one row per player in rank order", () => {
  const clock = new FakeClock();
  const quiz = sampleQuiz();
  quiz.questions[0]!.text = 'Say "hi", ok?';
  const game = new Game(quiz, { clock });
  const a = game.join("Alice");
  const b = game.join("=cmd");
  game.start();
  clock.advance(INTRO_MS + 1000);
  game.answer(b.id, 0, 1);
  game.answer(a.id, 0, 0);
  game.end();

  const csv = buildResultsCsv(game);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  expect(lines).toHaveLength(3);
  expect(lines[0]).toStartWith('Rank,Nickname,Score,Correct answers,"Q1 answer (Say ""hi"", ok?)",Q1 correct,Q1 points,Q1 time (s)');
  // Formula injection is neutralised.
  expect(lines[1]).toStartWith("1,'=cmd,975,1,4,yes,975,1.00");
  expect(lines[2]).toStartWith("2,Alice,0,0,3,no,0,1.00");
  expect(lines[2]).toContain(",,no answer,0,");
});

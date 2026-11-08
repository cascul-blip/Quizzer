import { expect, test } from "bun:test";
import { everyoneAnswered, revealCue } from "../src/client/host/reveal-cue.ts";

const players = (connected: boolean[]) => connected.map((c) => ({ connected: c }));

test("a dropped phone doesn't turn an early reveal into the time-up buzzer", () => {
  const room = players([true, true, false]);
  expect(everyoneAnswered(2, room)).toBe(true);
  expect(revealCue(true, 2, room)).toBe("reveal");
  expect(revealCue(true, 1, room)).toBe("timeUp");
  // Skipped from the intro, or not from the open question: no buzzer.
  expect(revealCue(false, 0, room)).toBe("reveal");
});

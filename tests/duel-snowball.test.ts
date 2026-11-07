import { expect, test } from "bun:test";
import { snowballShots, snowballFrame, SNOW_RELEASE_MS } from "../src/shared/duel-snowball.ts";

test("snowball hits only the loser, including a winner or loser in the third slot", () => {
  for (let win = 0; win < 3; win++) for (let lose = 0; lose < 3; lose++) {
    if (win === lose) continue;
    const people = [0, 1, 2].map(i => ({ outcome: i === win ? "win" as const : i === lose ? "lose" as const : "stay" as const }));
    expect(snowballShots(people, false)).toEqual([{ from: win, to: lose, miss: false }]);
  }
});

test("draws miss everyone, and absent opponents create no shot", () => {
  expect(snowballShots([{ outcome: "stay" }, { outcome: "stay" }, { outcome: "stay" }], true).every(s => s.miss)).toBe(true);
  expect(snowballShots([{ outcome: "stay" }], true)).toEqual([]);
  expect(snowballShots([], false)).toEqual([]);
  expect(snowballShots([{ outcome: "win" }, { outcome: "stay" }, { outcome: "stay" }], false)).toEqual([{ from: 0, to: 1, miss: true }]);
  expect(snowballShots([{ outcome: "stay" }, { outcome: "lose" }, { outcome: "stay" }], false)).toEqual([{ from: 0, to: 1, miss: false }, { from: 2, to: 1, miss: false }]);
  expect(snowballFrame(SNOW_RELEASE_MS - 1)).toBe(3);
  expect(snowballFrame(SNOW_RELEASE_MS)).toBe(4);
});

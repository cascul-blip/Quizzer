import { describe, expect, test } from "bun:test";
import type { CupGame } from "../src/server/game/cup.ts";
import { COUNTDOWN_MS } from "../src/server/game/cup.ts";
import { CUP_ROLL_MS } from "../src/shared/modes/cup.ts";
import { podiumHub } from "./podium-hub.ts";

const { ctx, running, finish, answerRight } = podiumHub();

describe("Cup of Death podium", () => {
  test("the podium screen, the phone and the results sheet agree on each place and award, and stay unchanged after the game finishes", async () => {
    const player = (id: string) => (running() as CupGame).players.get(id)!;
    const { view, phone, sheet } = await finish(
      "cup",
      (id) => {
        player(id("Ivy")).outRound = 1;
        ctx.clock.advance(COUNTDOWN_MS + CUP_ROLL_MS);
        answerRight("cup", "Noel", id("Noel"), 1);
        player(id("Holly")).drinksSurvived = 2;
        player(id("Holly")).safeRounds = 1;
        player(id("Ivy")).safeRounds = 1;
      },
      (id) => {
        player(id("Ivy")).outRound = null;
        player(id("Ivy")).drinksSurvived = 9;
      },
    );
    if (view.kind !== "cup") throw new Error("expected Cup of Death");
    expect(view.standings?.map((s) => [s.nickname, s.rank])).toEqual([
      ["Noel", 1],
      ["Holly", 1],
      ["Ivy", 3],
    ]);
    expect(view.awards).toMatchObject({
      mostCorrect: { value: 1, nicknames: ["Noel"] },
      mostDrinksSurvived: { value: 2, nicknames: ["Holly"] },
      mostSafeRounds: { value: 1, nicknames: ["Holly", "Ivy"] },
    });
    const result = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "cup" ? v.result : null;
    };
    expect(result("Noel")).toEqual({ rank: 1, playerCount: 3, won: true, outRound: null, awards: ["Most correct answers"] });
    expect(result("Holly")).toMatchObject({ rank: 1, awards: ["Luckiest drinker", "Never thirsty"] });
    expect(result("Ivy")).toMatchObject({ rank: 3, won: false, awards: ["Never thirsty"] });
    expect(sheet.map((r) => [r.Nickname, r.Rank])).toEqual([
      ["Noel", 1],
      ["Holly", 1],
      ["Ivy", 3],
    ]);
  });
});

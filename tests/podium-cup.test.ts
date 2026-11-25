import { describe, expect, test } from "bun:test";
import type { CupGame } from "../src/server/game/cup.ts";
import { COUNTDOWN_MS } from "../src/server/game/cup.ts";
import { CUP_DEFAULT_CUPS, CUP_ROLL_MS, cupAwardLabels } from "../src/shared/modes/cup.ts";
import { NICKNAMES, podiumHub } from "./podium-hub.ts";

const { ctx, running, finish, answerRight } = podiumHub();
const labels = cupAwardLabels();

describe("Cup of Death podium", () => {
  test("the podium screen, the phone and the results sheet agree on each place and award, and stay unchanged after the game finishes", async () => {
    const player = (id: string) => (running() as CupGame).players.get(id)!;
    const { view, phone, sheet } = await finish(
      "cup",
      (id) => {
        player(id("Ivy")).outRound = 1;
        player(id("Ivy")).poisonedFrom = CUP_DEFAULT_CUPS;
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
      earliestFirstCupOut: { value: 1, nicknames: ["Ivy"] },
    });
    const result = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "cup" ? v.result : null;
    };
    expect(result("Noel")).toEqual({ rank: 1, playerCount: 3, won: true, outRound: null, awards: [labels.mostCorrect] });
    expect(result("Holly")).toMatchObject({ rank: 1, awards: [labels.mostDrinksSurvived, labels.mostSafeRounds] });
    expect(result("Ivy")).toMatchObject({ rank: 3, won: false, awards: [labels.mostSafeRounds, labels.earliestFirstCupOut] });
    expect(sheet.map((r) => [r.Nickname, r.Rank])).toEqual([
      ["Noel", 1],
      ["Holly", 1],
      ["Ivy", 3],
    ]);
  });

  test("when everyone is tied, they share first on the podium screen, the phone and the results sheet", async () => {
    const { view, phone, sheet } = await finish("cup", () => {});
    for (const n of NICKNAMES) {
      const v = phone(n);
      expect({
        n,
        podium: view.kind === "cup" ? view.standings?.find((s) => s.nickname === n)?.rank : undefined,
        phone: v?.kind === "cup" ? v.result?.rank : undefined,
        sheet: sheet.find((r) => r.Nickname === n)?.Rank,
      }).toEqual({ n, podium: 1, phone: 1, sheet: 1 });
    }
  });
});

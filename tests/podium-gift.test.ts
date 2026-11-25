import { describe, expect, test } from "bun:test";
import type { GiftGame } from "../src/server/game/gift.ts";
import { podiumHub } from "./podium-hub.ts";

const { ctx, running, finish, answerRight } = podiumHub();

describe("Gift Grab podium", () => {
  test("the podium screen, the phone and the results sheet agree on each place and the award, and stay unchanged after the game finishes", async () => {
    const player = (id: string) => (running() as GiftGame).players.get(id)!;
    const { view, phone, sheet } = await finish(
      "gift",
      (id) => {
        player(id("Noel")).score = 10;
        ctx.clock.advance(3000);
        answerRight("gift", "Holly", id("Holly"), 1);
        answerRight("gift", "Ivy", id("Ivy"), 1);
      },
      (id) => {
        player(id("Ivy")).score = 99;
      },
    );
    if (view.kind !== "gift") throw new Error("expected Gift Grab");
    expect(view.standings.map((s) => [s.nickname, s.rank, s.score])).toEqual([
      ["Noel", 1, 10],
      ["Holly", 2, 0],
      ["Ivy", 2, 0],
    ]);
    expect(view.mostCorrect).toEqual({ value: 1, nicknames: ["Holly", "Ivy"] });
    const rank = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "gift" ? v.rank : null;
    };
    expect([rank("Noel"), rank("Holly"), rank("Ivy")]).toEqual([1, 2, 2]);
    expect(sheet.map((r) => [r.Nickname, r.Rank, r.Score])).toEqual([
      ["Noel", 1, 10],
      ["Holly", 2, 0],
      ["Ivy", 2, 0],
    ]);
  });
});

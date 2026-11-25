import { describe, expect, test } from "bun:test";
import type { SubGame } from "../src/server/game/submarine.ts";
import { podiumHub } from "./podium-hub.ts";

const { ctx, running, finish, answerRight } = podiumHub();

describe("Sled Squad podium", () => {
  test("the podium screen, the phone and the results sheet agree on the awards and order, and stay unchanged after the game finishes", async () => {
    const player = (id: string) => (running() as SubGame).players.get(id)!;
    const { view, phone, sheet } = await finish(
      "submarine",
      (id) => {
        player(id("Ivy")).boosts = 2;
        player(id("Holly")).boosts = 1;
        ctx.clock.advance(3000);
        answerRight("sub", "Noel", id("Noel"), 2);
        answerRight("sub", "Holly", id("Holly"), 2);
      },
      (id) => {
        player(id("Noel")).boosts = 9;
        player(id("Noel")).diveHits = 9;
      },
    );
    if (view.kind !== "submarine") throw new Error("expected Sled Squad");
    expect(view.awards).toEqual({
      topBooster: { value: 2, nicknames: ["Ivy"] },
      sharpestEyes: null,
      mostCorrect: { value: 2, nicknames: ["Noel", "Holly"] },
    });
    const awards = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "submarine" ? v.result?.awards : null;
    };
    expect(awards("Noel")).toEqual(["Most correct answers"]);
    expect(awards("Holly")).toEqual(["Most correct answers"]);
    expect(awards("Ivy")).toEqual(["Top booster"]);
    expect(sheet.map((r) => [r.Nickname, r.Boosts])).toEqual([
      ["Ivy", 2],
      ["Holly", 1],
      ["Noel", 0],
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import type { FightGame } from "../src/server/game/fight.ts";
import { podiumHub } from "./podium-hub.ts";

const { running, finish } = podiumHub();

describe("Tower Fight podium", () => {
  test("the podium screen, the phone and the results sheet agree on the winning team and awards, and stay unchanged after the game finishes", async () => {
    const game = () => running() as FightGame;
    const player = (id: string) => game().players.get(id)!;
    const { view, phone, sheet } = await finish(
      "fight",
      (id) => {
        player(id("Noel")).team = 1;
        player(id("Holly")).team = 0;
        player(id("Ivy")).team = 1;
        game().teams[0]!.damage = 2;
        game().teams[1]!.damage = 1;
        player(id("Noel")).hits = 1;
        player(id("Ivy")).hits = 2;
        player(id("Holly")).rebuilds = 1;
      },
      (id) => {
        player(id("Noel")).hits = 9;
        player(id("Holly")).rebuilds = 9;
        game().teams[1]!.damage = 7;
      },
    );
    if (view.kind !== "fight") throw new Error("expected Tower Fight");
    expect(view.outcome).toEqual({ winner: 1, reason: "damage" });
    expect(view.awards).toEqual({ topGunner: { value: 2, nicknames: ["Ivy"] }, masterBuilder: { value: 1, nicknames: ["Holly"] }, mostCorrect: null });
    const awards = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "fight" ? v.result?.awards : null;
    };
    expect(awards("Noel")).toEqual([]);
    expect(awards("Holly")).toEqual(["Master builder"]);
    expect(awards("Ivy")).toEqual(["Top gunner"]);
    expect(sheet.map((r) => [r.Nickname, r.Result, r["Enemy hits"], r["Tower damage"]])).toEqual([
      ["Ivy", "Won", 2, 1],
      ["Noel", "Won", 1, 1],
      ["Holly", "Lost", 0, 2],
    ]);
  });
});

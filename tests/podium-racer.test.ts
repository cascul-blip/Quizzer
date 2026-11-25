import { describe, expect, test } from "bun:test";
import type { RacerGame } from "../src/server/game/racer.ts";
import { podiumHub } from "./podium-hub.ts";

const { running, finish } = podiumHub();

describe("Racer podium", () => {
  test("the podium screen, the phone and the results sheet agree on the awards and order, and stay unchanged after the game finishes", async () => {
    const player = (id: string) => (running() as RacerGame).players.get(id)!;
    const { view, phone, sheet } = await finish(
      "racer",
      (id) => {
        player(id("Noel")).correct = 1;
        player(id("Holly")).correct = 2;
        player(id("Ivy")).correct = 2;
        player(id("Noel")).mphGained = 40;
      },
      (id) => {
        player(id("Noel")).correct = 9;
        player(id("Ivy")).mphGained = 90;
      },
    );
    if (view.kind !== "racer") throw new Error("expected Racer");
    expect(view.awards).toEqual({ mostCorrect: { value: 2, nicknames: ["Holly", "Ivy"] }, mostMphGained: { value: 40, nicknames: ["Noel"] } });
    const awards = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "racer" ? v.result?.awards : null;
    };
    expect(awards("Noel")).toEqual(["Best driver"]);
    expect(awards("Holly")).toEqual(["Most correct answers"]);
    expect(awards("Ivy")).toEqual(["Most correct answers"]);
    expect(sheet.map((r) => [r.Nickname, r.Correct])).toEqual([
      ["Holly", 2],
      ["Ivy", 2],
      ["Noel", 1],
    ]);
  });
});

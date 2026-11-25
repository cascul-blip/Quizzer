import { describe, expect, test } from "bun:test";
import type { RobotGame } from "../src/server/game/robot.ts";
import { COUNTDOWN_MS } from "../src/server/game/robot.ts";
import { robotShared } from "../src/shared/modes/robot.ts";
import { podiumHub } from "./podium-hub.ts";

const { ctx, running, finish, answerRight } = podiumHub();

describe("Robot Attack podium", () => {
  test("the podium screen, the phone and the results sheet agree on each place and award, and stay unchanged after the game finishes", async () => {
    let game!: RobotGame;
    const player = (id: string) => game.players.get(id)!;
    const { view, phone, sheet } = await finish(
      "robot",
      (id) => {
        game = running() as RobotGame;
        ctx.clock.advance(COUNTDOWN_MS);
        answerRight("robot", "Noel", id("Noel"), 2);
        answerRight("robot", "Ivy", id("Ivy"), 2);
        // Which players the lasers hit depends on the random board, so set the lives an attack would leave.
        player(id("Holly")).lives--;
        player(id("Holly")).moves = 3;
      },
      (id) => {
        player(id("Holly")).lives = 3;
        player(id("Holly")).moves = 9;
      },
    );
    if (view.kind !== "robot") throw new Error("expected Robot Attack");
    expect(view.awards).toEqual({
      mostCorrect: { value: 2, nicknames: ["Noel", "Ivy"] },
      mostMoves: { value: 3, nicknames: ["Holly"] },
    });
    expect(view.standings?.map((s) => [s.nickname, s.rank])).toEqual([
      ["Noel", 1],
      ["Ivy", 1],
      ["Holly", 3],
    ]);
    const result = (n: "Noel" | "Holly" | "Ivy") => {
      const v = phone(n);
      return v?.kind === "robot" ? v.result : null;
    };
    expect(result("Holly")).toEqual({ rank: 3, playerCount: 3, won: false, outRound: null, awards: [robotShared.awards.mostMoves] });
    expect(result("Noel")).toMatchObject({ rank: 1, awards: [robotShared.awards.mostCorrect] });
    expect(result("Ivy")).toMatchObject({ rank: 1, awards: [robotShared.awards.mostCorrect] });
    expect(sheet.map((r) => [r.Nickname, r.Rank, r["Lives left"], r.Moves])).toEqual([
      ["Noel", 1, 3, 0],
      ["Ivy", 1, 3, 0],
      ["Holly", 3, 2, 3],
    ]);
  });
});

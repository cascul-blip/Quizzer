import { describe, expect, test } from "bun:test";
import { gingerbreadGround, gingerbreadTerrain } from "../src/shared/fight-ground.ts";
import { COLS, COL_W, GROUND, HILL_HEIGHTS, MAX_PULL, carve, launchVector, simulate, type HillHeight } from "../src/shared/fight-physics.ts";
import { FightGame } from "../src/server/game/fight.ts";
import { sampleQuiz } from "./helpers.ts";

for (const hill of ["low", "medium", "high"] as HillHeight[]) {
  describe(`painted ${hill} gingerbread ground`, () => {
    test("shares a correctly sized collision surface with the selected artwork", () => {
      const terrain = gingerbreadTerrain(hill);
      expect(terrain.length).toBe(COLS + 1);
      expect(Math.max(...terrain)).toBe(GROUND + HILL_HEIGHTS[hill]);
      for (let i = 0; i <= COLS; i++) {
        expect(Number.isFinite(terrain[i])).toBe(true);
        if (i * COL_W <= 230 || i * COL_W >= 770) expect(terrain[i]).toBe(GROUND);
      }
      const game = new FightGame(sampleQuiz(), { hill, theme: "christmas", shuffleAnswers: false });
      expect(game.terrain).toEqual(terrain);
      expect(game.hostView().hill).toBe(hill);
      const player = game.join("Baker");
      expect(game.playerView(player.id)?.hill).toBe(hill);
      game.dispose();
    });

    test("craters lower the surface permanently without modifying the original artwork profile", () => {
      const original = gingerbreadTerrain(hill);
      const terrain = gingerbreadTerrain(hill);
      terrain[100] = 0;
      expect(gingerbreadTerrain(hill)).toEqual(original);
      const once = carve(original, 500);
      const twice = carve(once, 500);
      expect(twice[100]).toBeLessThan(once[100]!);
      expect(once[100]).toBeLessThan(original[100]!);
      expect(gingerbreadGround(hill).terrain).toEqual(original);
    });

    test("both teams can lob over the painted hill and hit the opposing tower", () => {
      for (const team of [0, 1]) {
        let hit = false;
        for (let degrees = 20; degrees <= 85 && !hit; degrees += 2) {
          for (let pull = 40; pull <= MAX_PULL; pull += 4) {
            const a = degrees * Math.PI / 180;
            const v = launchVector((team ? 1 : -1) * Math.cos(a) * pull, -Math.sin(a) * pull)!;
            const result = simulate(gingerbreadTerrain(hill), team, v.vx, v.vy);
            if (result.impact.kind === "tower" && result.impact.team === 1 - team) { hit = true; break; }
          }
        }
        expect(hit).toBe(true);
      }
    });
  });
}

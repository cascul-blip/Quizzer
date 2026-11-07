import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { SiegeGame } from "../src/server/game/siege.ts";
import { DEFAULT_SIEGE_THEME, siegeTheme } from "../src/shared/siege-theme.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

describe("Kingdom Siege themes", () => {
  test("Christmas is the default and both clients receive the selected look", () => {
    const lobby = new Game(sampleQuiz(), { clock: new FakeClock() });
    lobby.setMode("siege");
    expect(lobby.siege.theme).toBe(DEFAULT_SIEGE_THEME);
    expect(siegeTheme()).toBe("christmas");
    const player = lobby.join("Holly");
    for (const theme of ["classic", "christmas"] as const) {
      lobby.setSiege({ waves: 10, theme });
      // Older clients updating only waves must preserve an explicit theme choice.
      lobby.setSiege({ waves: 5 });
      expect(lobby.siege.theme).toBe(theme);
      const game = SiegeGame.fromLobby(lobby, { clock: new FakeClock() });
      expect(game.hostView().settings).toEqual({ waves: 5, theme });
      expect(game.playerView(player.id)?.theme).toBe(theme);
    }
  });

  test("invalid theme is rejected without altering the current settings", () => {
    const lobby = new Game(sampleQuiz());
    lobby.setSiege({ waves: 10, theme: "classic" });
    expect(() => lobby.setSiege({ waves: 5, theme: "halloween" as never })).toThrow("theme");
    expect(lobby.siege).toEqual({ waves: 10, theme: "classic" });
  });
});

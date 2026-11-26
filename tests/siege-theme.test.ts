import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Lobby } from "../src/server/game/lobby.ts";
import { SiegeGame } from "../src/server/game/siege.ts";
import { siegeDefenderPhrase } from "../src/shared/modes/siege.ts";
import { modeTheme, THEMED_MODES } from "../src/shared/themed-modes.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

describe("Kingdom Siege themes", () => {
  test("defenders read the same in a sentence on the server and the phone, with the right article", () => {
    expect((["archer", "knight", "wall"] as const).map((t) => siegeDefenderPhrase(t, "classic"))).toEqual(["an archer", "a knight", "a stone wall"]);
    expect((["archer", "knight", "wall"] as const).map((t) => siegeDefenderPhrase(t, "christmas"))).toEqual([
      "an elf archer",
      "a nutcracker",
      "a present barricade",
    ]);
  });

  test("Christmas is the default and both clients receive the selected look", () => {
    const lobby = new Lobby(sampleQuiz());
    lobby.setMode("siege");
    expect(lobby.settings.siege.theme).toBe(THEMED_MODES.siege.default);
    expect(modeTheme("siege")).toBe("christmas");
    const player = lobby.join("Holly");
    for (const theme of ["classic", "christmas"] as const) {
      lobby.setModeSettings("siege", { waves: 10, theme });
      // why: Older clients updating only waves must preserve an explicit theme choice.
      lobby.setModeSettings("siege", { waves: 5 });
      expect(lobby.settings.siege.theme).toBe(theme);
      const game = SiegeGame.fromLobby(lobby.handoffFacts("siege"), { clock: new FakeClock() });
      expect(game.hostView().settings).toEqual({ waves: 5, theme });
      expect(game.playerView(player.id)?.theme).toBe(theme);
    }
  });

  test("invalid theme is rejected without altering the current settings", () => {
    const lobby = new Lobby(sampleQuiz());
    lobby.setModeSettings("siege", { waves: 10, theme: "classic" });
    expect(() => lobby.setModeSettings("siege", { waves: 5, theme: "halloween" as never })).toThrow("theme");
    expect(lobby.settings.siege).toEqual({ waves: 10, theme: "classic" });
  });
});

test("no two classic files in the Toybox swap share bytes (the bundler would give them one URL)", () => {
  const dir = new URL("../src/client/shared/", import.meta.url);
  const source = readFileSync(new URL("siege-art.tsx", dir), "utf8");
  const files = new Map([...source.matchAll(/^import (\w+) from "(\.\/siege\/[^"]+\.webp)";$/gm)].map((m) => [m[1]!, m[2]!]));
  const table = source.slice(source.indexOf("const TOYBOX_ART"), source.indexOf("};", source.indexOf("const TOYBOX_ART")));
  const keys = [...table.matchAll(/^\s+\[(\w+)\]:/gm)].map((m) => m[1]!);
  expect(keys.length).toBeGreaterThan(30);
  const byHash = new Map<string, string>();
  for (const key of keys) {
    const hash = createHash("sha256")
      .update(readFileSync(new URL(files.get(key)!, dir)))
      .digest("hex");
    expect(byHash.get(hash) ?? key).toBe(key);
    byHash.set(hash, key);
  }
});

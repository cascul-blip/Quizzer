import { describe, expect, test } from "bun:test";
import { CupThemeProvider } from "../src/client/shared/cup-skin.tsx";
import { FightThemeProvider } from "../src/client/shared/fight-skin.tsx";
import { LandThemeProvider } from "../src/client/shared/land-skin.tsx";
import { createSkin } from "../src/client/shared/season-skin.tsx";
import { SiegeThemeProvider } from "../src/client/shared/siege-skin.tsx";
import { TowerThemeProvider } from "../src/client/shared/tower-skin.tsx";
import type { SeasonTheme } from "../src/shared/themed-modes.ts";

const provided = (Provider: (p: { theme?: SeasonTheme; children: null }) => unknown, theme?: SeasonTheme) =>
  (Provider({ theme, children: null }) as { props: { value: SeasonTheme } }).props.value;

describe("season skins", () => {
  test("createSkin's Provider keeps a theme the mode offers and falls back to the mode's default otherwise", () => {
    const gift = createSkin("gift");
    expect(provided(gift.Provider)).toBe("christmas");
    expect(provided(gift.Provider, "classic")).toBe("christmas");
  });

  test("every themed mode's Provider fills in a missing theme the same way: the mode's default, Christmas", () => {
    for (const Provider of [CupThemeProvider, FightThemeProvider, LandThemeProvider, SiegeThemeProvider, TowerThemeProvider]) {
      expect(provided(Provider)).toBe("christmas");
      expect(provided(Provider, "classic")).toBe("classic");
      expect(provided(Provider, "christmas")).toBe("christmas");
    }
  });
});

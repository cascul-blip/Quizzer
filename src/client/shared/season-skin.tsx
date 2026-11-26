import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { SeasonTheme, ThemedMode, ThemeOf } from "../../shared/themed-modes.ts";
import { modeTheme } from "../../shared/themed-modes.ts";

/** why: a missing theme, inside or outside the Provider, means that mode's default (THEMED_MODES). */
export function createSkin<M extends ThemedMode>(mode: M) {
  const Theme = createContext<ThemeOf<M>>(modeTheme(mode));
  function Provider({ theme, children }: { theme?: SeasonTheme; children: ComponentChildren }) {
    return <Theme.Provider value={modeTheme(mode, theme)}>{children}</Theme.Provider>;
  }
  const useTheme = () => useContext(Theme);
  const useChristmas = () => useContext(Theme) === "christmas";
  return { Provider, useTheme, useChristmas };
}

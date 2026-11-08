import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import type { SeasonTheme } from "../../shared/season-theme.ts";

/**
 * A themed mode's skin context: a Provider that normalizes the theme it's given, and hooks to read it.
 * `normalize` is the mode's own xTheme(), so a missing theme, inside or outside the Provider, means that mode's default.
 */
export function createSkin<T extends SeasonTheme>(normalize: (theme?: T) => T) {
  const Theme = createContext<T>(normalize());
  function Provider({ theme, children }: { theme?: T; children: ComponentChildren }) {
    return <Theme.Provider value={normalize(theme)}>{children}</Theme.Provider>;
  }
  const useTheme = () => useContext(Theme);
  const useChristmas = () => useContext(Theme) === "christmas";
  return { Provider, useTheme, useChristmas };
}

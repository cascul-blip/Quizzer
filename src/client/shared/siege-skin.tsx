import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { siegeTheme, type SiegeTheme } from "../../shared/siege-theme.ts";

const Theme = createContext<SiegeTheme>("classic");
export function SiegeThemeProvider({ theme, children }: { theme?: SiegeTheme; children: ComponentChildren }) {
  return <Theme.Provider value={siegeTheme(theme)}>{children}</Theme.Provider>;
}
export const useSiegeTheme = () => useContext(Theme);
export const useChristmasSiege = () => useSiegeTheme() === "christmas";

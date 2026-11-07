import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { landTheme, type LandTheme } from "../../shared/land-theme.ts";
import map from "./land/christmas/north-pole.webp";
import table from "./land/christmas/tabletop.webp";
import phoneMap from "./land/christmas/phone/north-pole.webp";
import phoneTable from "./land/christmas/phone/tabletop.webp";
import { pickArt } from "./phone-art.ts";
const Theme = createContext<LandTheme>("classic");
export function LandThemeProvider({ theme, children }: { theme?: LandTheme; children: ComponentChildren }) {
  return <Theme.Provider value={landTheme(theme)}>{children}</Theme.Provider>;
}
export const useNorthPole = () => useContext(Theme) === "christmas";
export const northPoleArt = () => ({ map: pickArt(map, phoneMap), table: pickArt(table, phoneTable) });

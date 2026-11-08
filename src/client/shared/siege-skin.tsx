import { siegeTheme } from "../../shared/siege-theme.ts";
import { createSkin } from "./season-skin.tsx";

const skin = createSkin(siegeTheme);
export const SiegeThemeProvider = skin.Provider;
export const useSiegeTheme = skin.useTheme;
export const useChristmasSiege = skin.useChristmas;

import { createSkin } from "./season-skin.tsx";

const skin = createSkin("siege");
export const SiegeThemeProvider = skin.Provider;
export const useSiegeTheme = skin.useTheme;
export const useChristmasSiege = skin.useChristmas;

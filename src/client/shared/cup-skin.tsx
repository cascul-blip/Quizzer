import { createSkin } from "./season-skin.tsx";

const skin = createSkin("cup");
export const CupThemeProvider = skin.Provider;
export const useChristmasCup = skin.useChristmas;

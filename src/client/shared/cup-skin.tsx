import { cupTheme } from "../../shared/cup-theme.ts";
import { createSkin } from "./season-skin.tsx";

const skin = createSkin(cupTheme);
export const CupThemeProvider = skin.Provider;
export const useChristmasCup = skin.useChristmas;

import type { SeasonTheme } from "./season-theme.ts";
/** Seasonal art shares the same Land Grab rules. */
export type LandTheme = SeasonTheme;
export const DEFAULT_LAND_THEME: LandTheme = "christmas";
export const landTheme = (theme?: LandTheme): LandTheme => theme ?? DEFAULT_LAND_THEME;

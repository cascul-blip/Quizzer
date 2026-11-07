/** Seasonal art shares the same Land Grab rules. */
export type LandTheme = "classic" | "christmas";
export const DEFAULT_LAND_THEME: LandTheme = "christmas";
export const landTheme = (theme?: LandTheme): LandTheme => theme ?? DEFAULT_LAND_THEME;

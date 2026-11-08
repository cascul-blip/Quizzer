import type { SeasonTheme } from "./season-theme.ts";
export type CupTheme = SeasonTheme;
export const DEFAULT_CUP_THEME: CupTheme = "christmas";
export const cupTheme = (theme?: CupTheme): CupTheme => theme ?? DEFAULT_CUP_THEME;
export const cupName = (theme?: CupTheme): string => cupTheme(theme) === "christmas" ? "☕ Cup of Cheer" : "☠️ Cup of Death";

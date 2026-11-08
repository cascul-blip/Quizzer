import type { SeasonTheme } from "./season-theme.ts";
/** Change the default here; hosts can also choose either look before each game. */
export type RacerTheme = SeasonTheme;
export const DEFAULT_RACER_THEME: RacerTheme = "christmas";
export const racerTheme = (theme?: RacerTheme): RacerTheme => theme ?? DEFAULT_RACER_THEME;
export const racerName = (theme?: RacerTheme): string => racerTheme(theme) === "christmas" ? "🎄 Neon Noel Racer" : "🏎 Racer";

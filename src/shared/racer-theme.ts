/** Racer keeps its original look until the host chooses the seasonal theme. */
export type RacerTheme = "classic" | "christmas";
export const DEFAULT_RACER_THEME: RacerTheme = "classic";
export const racerTheme = (theme?: RacerTheme): RacerTheme => theme ?? DEFAULT_RACER_THEME;
export const racerName = (theme?: RacerTheme): string => racerTheme(theme) === "christmas" ? "🎄 Neon Noel Racer" : "🏎 Racer";

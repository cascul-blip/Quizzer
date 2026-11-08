/** The looks every themed mode can be played in. Each mode's *-theme.ts keeps its own default and words. */
export type SeasonTheme = "classic" | "christmas";
export const SEASON_THEMES: readonly SeasonTheme[] = ["classic", "christmas"];
export const isSeasonTheme = (value: unknown): value is SeasonTheme => SEASON_THEMES.includes(value as SeasonTheme);

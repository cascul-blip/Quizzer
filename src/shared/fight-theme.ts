/** Seasonal artwork only; both themes share the same battle rules. */
export type FightTheme = "classic" | "christmas";
export const DEFAULT_FIGHT_THEME: FightTheme = "christmas";
export const fightTheme = (theme?: FightTheme): FightTheme => theme ?? DEFAULT_FIGHT_THEME;
export const fightName = (theme?: FightTheme): string => fightTheme(theme) === "christmas" ? "🎄 Gingerbread Siege" : "🏰 Tower Fight";

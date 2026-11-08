import type { SeasonTheme } from "./season-theme.ts";
/** New lobbies use the North Pole skin; classic Showdown remains selectable. */
export type DuelTheme = SeasonTheme;
export const DEFAULT_DUEL_THEME: DuelTheme = "christmas";
export const duelTheme = (theme?: DuelTheme): DuelTheme => theme ?? DEFAULT_DUEL_THEME;
export const duelName = (theme?: DuelTheme) => duelTheme(theme) === "christmas" ? "North Pole Snowball Showdown" : "Showdown";
export const duelArenaName = (arena: number, theme?: DuelTheme) => arena === 1 ? (duelTheme(theme) === "christmas" ? "North Pole Plaza" : "High Noon") : `Arena ${arena}`;

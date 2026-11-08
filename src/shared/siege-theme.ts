import type { SeasonTheme } from "./season-theme.ts";
/** Hosts can select either look before starting; new lobbies use Christmas Toybox. */
export type SiegeTheme = SeasonTheme;
export const DEFAULT_SIEGE_THEME: SiegeTheme = "christmas";
export const siegeTheme = (theme?: SiegeTheme): SiegeTheme => theme ?? DEFAULT_SIEGE_THEME;
export const siegeName = (theme?: SiegeTheme) => siegeTheme(theme) === "christmas" ? "Christmas Toybox" : "Kingdom Siege";
export function siegeDefenderLabel(type: "archer" | "knight" | "wall", theme?: SiegeTheme) {
  return siegeTheme(theme) === "christmas"
    ? { archer: "Elf archer", knight: "Nutcracker", wall: "Present barricade" }[type]
    : { archer: "Archer", knight: "Knight", wall: "Stone wall" }[type];
}

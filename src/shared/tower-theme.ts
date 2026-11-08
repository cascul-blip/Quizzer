import type { SeasonTheme } from "./season-theme.ts";
/** Change the default here; hosts can also choose either look before each game. */
export type TowerTheme = SeasonTheme;
export const DEFAULT_TOWER_THEME: TowerTheme = "christmas";

export const towerTheme = (theme?: TowerTheme): TowerTheme => theme ?? DEFAULT_TOWER_THEME;

export function towerWords(theme?: TowerTheme) {
  return towerTheme(theme) === "christmas"
    ? { icon: "🎄", name: "North Pole Tower", creature: "yeti", creatureIcon: "❄️", item: "bell", itemIcon: "🔔", action: "rang the bell and summoned the yeti" }
    : { icon: "🏗", name: "Tallest Tower", creature: "monster", creatureIcon: "👾", item: "egg", itemIcon: "🥚", action: "hatched the monster" };
}

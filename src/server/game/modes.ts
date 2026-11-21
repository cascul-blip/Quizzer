import type { GameMode } from "../../shared/mode-entries.ts";
import { classicMode } from "./classic-entry.ts";
import { cupMode } from "./cup.ts";
import { duelMode } from "./duel.ts";
import { fightMode } from "./fight.ts";
import { giftMode } from "./gift.ts";
import { landMode } from "./land.ts";
import type { LiveGame, ModeEntry } from "./mode-entry.ts";
import { racerMode } from "./racer.ts";
import { robotMode } from "./robot.ts";
import { siegeMode } from "./siege.ts";
import { subMode } from "./submarine.ts";
import { towerMode } from "./tower.ts";

/** Every game mode's entry: what the server knows about the mode, in the mode's own file. */
export const MODES: { [M in GameMode]: ModeEntry<M> } = {
  classic: classicMode,
  tower: towerMode,
  submarine: subMode,
  fight: fightMode,
  robot: robotMode,
  land: landMode,
  racer: racerMode,
  cup: cupMode,
  siege: siegeMode,
  duel: duelMode,
  gift: giftMode,
};

/** The entry of the mode a live game is running, for calls that pass that same game back in. */
export function entryOf(game: LiveGame): ModeEntry<GameMode> {
  // The one place the per-mode types meet: callers pass back the game they looked the entry up with.
  return MODES[game.runningMode] as ModeEntry<GameMode>;
}

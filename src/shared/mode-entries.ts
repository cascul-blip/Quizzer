import { classicShared } from "./modes/classic.ts";
import { cupShared } from "./modes/cup.ts";
import { duelShared } from "./modes/duel.ts";
import { fightShared } from "./modes/fight.ts";
import { giftShared } from "./modes/gift.ts";
import { landShared } from "./modes/land.ts";
import { racerShared } from "./modes/racer.ts";
import { robotShared } from "./modes/robot.ts";
import { siegeShared } from "./modes/siege.ts";
import { subShared } from "./modes/submarine.ts";
import { towerShared } from "./modes/tower.ts";

/** Every game mode's shared mode entry: its name, flags, lobby banner and phone messages, declared in the mode's own file in modes/. */
export const SHARED_MODES = {
  classic: classicShared,
  tower: towerShared,
  submarine: subShared,
  fight: fightShared,
  robot: robotShared,
  land: landShared,
  racer: racerShared,
  cup: cupShared,
  siege: siegeShared,
  duel: duelShared,
  gift: giftShared,
};

export type GameMode = keyof typeof SHARED_MODES;

/** One game mode's shared mode entry, with its literal types. */
export type SharedOf<M extends GameMode> = (typeof SHARED_MODES)[M];

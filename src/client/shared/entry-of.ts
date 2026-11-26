import type { GameMode } from "../../shared/mode-entries.ts";

/** why: widening loses the relation between the looked-up mode and the entry's inputs; callers must supply that mode's values. */
export function entryOf<E>(table: { readonly [M in GameMode]: { [K in keyof E]: unknown } }, mode: GameMode): E {
  return table[mode] as E;
}

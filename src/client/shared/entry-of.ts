import type { GameMode } from "../../shared/mode-entries.ts";

/** why: a mode's own entry isn't assignable to the widened one, so the table is checked by shape;
 * use the entry only with values of the mode it was looked up with. */
export function entryOf<E>(table: { readonly [M in GameMode]: { [K in keyof E]: unknown } }, mode: GameMode): E {
  return table[mode] as E;
}

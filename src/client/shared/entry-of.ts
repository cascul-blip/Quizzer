import type { GameMode } from "../../shared/protocol.ts";

/**
 * A mode's entry from a table typed over GameMode, widened to the entry for any mode.
 * The one place the per-mode types meet: the caller must use the entry with values of the mode it looked it up with (that mode's view or settings).
 * A mode's own entry isn't assignable to the widened one (its components take only that mode's props), so the table is checked by shape: every entry must have E's fields.
 */
export function entryOf<E>(table: { readonly [M in GameMode]: { [K in keyof E]: unknown } }, mode: GameMode): E {
  return table[mode] as E;
}

import type { GameMode } from "../../shared/protocol.ts";

/**
 * A mode's entry from a table typed over GameMode, widened to the entry for any mode.
 * The one place the per-mode types meet: the caller must use the entry with values of the mode it looked it up with (that mode's view or settings).
 */
export function entryOf<E>(table: { readonly [M in GameMode]: unknown }, mode: GameMode): E {
  return table[mode] as E;
}

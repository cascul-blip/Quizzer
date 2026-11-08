import type { PlayerView } from "../../shared/protocol.ts";

/**
 * What a phone shows. A new socket's first snapshot is "not joined" until the server answers the
 * phone's resume, so while one is pending that snapshot is held back in favour of the last game
 * view (or nothing, which shows a spinner): no join form flashes up and the game screen stays mounted.
 */
export function shownView(server: PlayerView | null, resuming: boolean, lastJoined: PlayerView | null): PlayerView | null {
  return resuming && server?.kind === "none" ? lastJoined : server;
}

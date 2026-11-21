import type { GameMode } from "./protocol.ts";

/** Every game mode's one plain name (GLOSSARY.md). A seasonal theme may decorate how the client shows it. */
export const MODE_NAMES: Record<GameMode, string> = {
  classic: "Classic",
  tower: "Tallest Tower",
  submarine: "Sled Squad",
  fight: "Tower Fight",
  robot: "Robot Attack",
  land: "Land Grab",
  racer: "Racer",
  cup: "Cup of Death",
  siege: "Kingdom Siege",
  duel: "Showdown",
  gift: "Gift Grab",
};

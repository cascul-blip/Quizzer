import type { GameMode } from "./protocol.ts";

/** What sets one game mode's lobby rows and server rules apart, declared once for the server and the projector. */
export interface ModeFlags {
  /** Played question by question: the host sets its pacing (in the lobby and during the game) and moves it on, and the pacing carries over to the next lobby. The lobby also offers to shuffle the question order. */
  paced: boolean;
  /** "Protect from abuse" applies: wrong answers in a row make a player wait longer before the next question. The lobby offers it. */
  protect: boolean;
}

/** Every game mode's flags. Typed with satisfies, so the server's ModeEntry can read each mode's flag as a literal type. */
export const MODE_FLAGS = {
  classic: { paced: true, protect: false },
  tower: { paced: false, protect: true },
  submarine: { paced: false, protect: true },
  fight: { paced: false, protect: true },
  robot: { paced: false, protect: true },
  land: { paced: false, protect: false },
  racer: { paced: true, protect: false },
  cup: { paced: false, protect: true },
  siege: { paced: false, protect: true },
  duel: { paced: true, protect: false },
  gift: { paced: false, protect: true },
} as const satisfies Record<GameMode, ModeFlags>;

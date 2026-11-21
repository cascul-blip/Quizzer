import type { GameMode } from "../../shared/mode-entries.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { ModeSettingsMap, ShuffleOptions } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { BasePlayer } from "./roster.ts";

/** The lobby's choices and players as the selected mode receives them at Start. */
export interface LobbyFacts<M extends GameMode> {
  readonly quiz: Quiz;
  readonly settings: Readonly<ModeSettingsMap[M]>;
  readonly shuffle: Readonly<ShuffleOptions>;
  /** Effective Protect from abuse for this game mode. */
  readonly protect: boolean;
  readonly pacing: Pacing;
  readonly players: readonly BasePlayer[];
  readonly teams: ReadonlyMap<string, number>;
}

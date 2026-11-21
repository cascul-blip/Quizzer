import type { GameMode, HostGameState, ModeSettingsMap, Pacing, ShuffleOptions } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { BasePlayer } from "./roster.ts";

/** The lobby's choices and players as the selected mode receives them at Start. */
export interface LobbyFacts<M extends GameMode> {
  readonly quiz: Quiz;
  readonly settings: Readonly<ModeSettingsMap[M]>;
  /** Lobby fields Classic retains in its projector view. */
  readonly lobbyView: Pick<HostGameState, "mode" | "settings" | "protect">;
  readonly shuffle: Readonly<ShuffleOptions>;
  /** Effective Protect from abuse for this game mode. */
  readonly protect: boolean;
  readonly pacing: Pacing;
  readonly players: readonly BasePlayer[];
  readonly teams: ReadonlyMap<string, number>;
}

import type { GameMode } from "../../shared/mode-entries.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { ModeSettingsMap, ShuffleOptions } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { BasePlayer } from "./roster.ts";

export type InitialSettings = {
  [M in GameMode]?: Partial<Omit<ModeSettingsMap[M], "theme">> & ("theme" extends keyof ModeSettingsMap[M] ? { theme?: string } : object);
};

export interface LobbyChoices {
  mode: GameMode;
  settings: InitialSettings;
  protect: boolean;
  pacing: Pacing;
}

export interface LobbyFacts<M extends GameMode> {
  readonly quiz: Quiz;
  readonly settings: Readonly<ModeSettingsMap[M]>;
  readonly shuffle: Readonly<ShuffleOptions>;
  readonly protect: boolean;
  readonly pacing: Pacing;
  readonly choices: LobbyChoices;
  readonly players: readonly BasePlayer[];
  readonly teams: ReadonlyMap<string, number>;
}

import type { AvatarChoice } from "../avatars.ts";
import type { HillHeight, ShotImpact } from "../fight-physics.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

export type FightPhase = "countdown" | "playing" | "collapse" | "podium";
export type HillSetting = HillHeight | "random";
export const HILL_SETTINGS: readonly HillSetting[] = ["random", "low", "medium", "high"];
export const CORRECT_PER_DECISION = 4;
export const FIGHT_MAX_DAMAGE = 5;
/** why: the move is forfeited after this; aiming has no time limit. */
export const DECISION_MS = 10_000;
export const REPAIR_MS = 4000;

export interface FightSettings {
  theme?: SeasonTheme;
  hill: HillSetting;
}

export type FightState = "question" | "decide" | "aim" | "watch" | "repair";

export interface FightShot {
  id: number;
  playerId: string;
  nickname: string;
  avatar: AvatarChoice;
  team: number;
  vx: number;
  vy: number;
  durationMs: number;
  /** why: time since firing when sent; clients add it to their own clock. */
  elapsedMs: number;
  impact: ShotImpact;
}

export interface FightEvent {
  seq: number;
  kind: "hit" | "friendly" | "miss" | "rebuild";
  nickname: string;
  team: number;
}

const FIGHT_AWARDS = { topGunner: "Top gunner", masterBuilder: "Master builder", mostCorrect: MOST_CORRECT_LABEL } as const;

export type FightAwardKey = keyof typeof FIGHT_AWARDS;
export type FightAwards = Record<FightAwardKey, SubAward | null>;

export interface FightOutcome {
  winner: number | null;
  reason: "destroyed" | "damage" | "correct" | "draw";
}

export interface HostFightTeam extends TeamInfo {
  damage: number;
  repairing: boolean;
  correct: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: FightState; hits: number; rebuilds: number }[];
}

export interface HostFightState {
  kind: "fight";
  theme?: SeasonTheme;
  phase: FightPhase;
  quiz: { id: string; title: string; questionCount: number };
  phaseRemainingMs: number;
  hill: HillHeight;
  terrain: number[];
  teams: HostFightTeam[];
  /** why: Recently landed shots stay in the view so the projector can finish their animations. */
  shots: FightShot[];
  events: FightEvent[];
  outcome: FightOutcome | null;
  playerCount: number;
  awards: FightAwards | null;
  errors: QuestionError[] | null;
}

export interface PlayerFightView {
  kind: "fight";
  hill?: HillHeight;
  theme?: SeasonTheme;
  phase: FightPhase;
  title: string;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; hits: number; rebuilds: number };
  team: TeamInfo;
  teams: TeamInfo[];
  state: FightState;
  towardDecision: number;
  decisionRemainingMs: number;
  repairRemainingMs: number;
  /** why: repaired is false if teammates had already fixed the tower. */
  lastRepair: { seq: number; repaired: boolean } | null;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  damage: number[];
  terrain: number[];
  shot: FightShot | null;
  result: { outcome: FightOutcome; awards: string[] } | null;
}

export type FightMsg =
  | StreamAnswerMsg<"fight">
  | { type: "fight.choose"; action: "attack" | "rebuild" }
  /** why: the slingshot pull in field units (y up); the shot flies the opposite way. */
  | { type: "fight.fire"; dx: number; dy: number };

export const fightShared = sharedModeEntry<ModeProtocol<FightMsg, FightSettings, HostFightState, PlayerFightView, Partial<FightSettings>>>()({
  name: "Tower Fight",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["fight.answer", "fight.choose", "fight.fire"],
  awards: FIGHT_AWARDS,
});

import type { AvatarChoice } from "../avatars.ts";
import type { FightTheme } from "../fight-theme.ts";
import type { HillHeight, ShotImpact } from "../fight-physics.ts";
import type { QuestionError, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "../mode-views.ts";

// Tower Fight protocol types.

export type FightPhase = "countdown" | "playing" | "collapse" | "podium";
export type HillSetting = HillHeight | "random";
export const HILL_SETTINGS: readonly HillSetting[] = ["random", "low", "medium", "high"];
/** Correct answers needed to earn one attack-or-rebuild decision. */
export const CORRECT_PER_DECISION = 4;
/** Hits a tower can take; the last one brings it down. */
export const TOWER_MAX_DAMAGE = 5;
/** Time to choose attack or rebuild before the move is forfeited (aiming has no time limit). */
export const DECISION_MS = 10_000;
/** How long a rebuild takes; the tower is repaired when it finishes. */
export const REPAIR_MS = 4000;

export interface FightSettings {
  theme?: FightTheme;
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
  /** How long ago it was fired when this was sent (clients add it to their own clock). */
  elapsedMs: number;
  impact: ShotImpact;
}

export interface FightEvent {
  seq: number;
  kind: "hit" | "friendly" | "miss" | "rebuild";
  nickname: string;
  team: number;
}

export interface FightAwards {
  topGunner: SubAward | null;
  masterBuilder: SubAward | null;
  mostCorrect: SubAward | null;
}

export interface FightOutcome {
  /** Winning team, or null for a draw. */
  winner: number | null;
  reason: "destroyed" | "damage" | "correct" | "draw";
}

export interface HostFightTeam extends TeamInfo {
  damage: number;
  /** Someone on the team is repairing the tower right now. */
  repairing: boolean;
  correct: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: FightState; hits: number; rebuilds: number }[];
}

export interface HostFightState {
  kind: "fight";
  theme?: FightTheme;
  phase: FightPhase;
  quiz: { id: string; title: string; questionCount: number };
  phaseRemainingMs: number;
  hill: HillHeight;
  terrain: number[];
  teams: HostFightTeam[];
  /** Shots still flying, or landed moments ago. */
  shots: FightShot[];
  /** Newest last. */
  events: FightEvent[];
  outcome: FightOutcome | null;
  playerCount: number;
  awards: FightAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

export interface PlayerFightView {
  kind: "fight";
  hill?: HillHeight;
  theme?: FightTheme;
  phase: FightPhase;
  title: string;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; hits: number; rebuilds: number };
  team: TeamInfo;
  teams: TeamInfo[];
  state: FightState;
  /** Correct answers toward the next decision (0 … CORRECT_PER_DECISION-1). */
  towardDecision: number;
  /** Time left to choose attack or rebuild (decide state). */
  decisionMs: number;
  /** Time left on this player's repair (repair state). */
  repairMs: number;
  /** This player's most recently finished repair; repaired is false if teammates had already fixed the tower. */
  lastRepair: { seq: number; repaired: boolean } | null;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** Damage per team. */
  damage: number[];
  terrain: number[];
  /** This player's shot while watching it fly. */
  shot: FightShot | null;
  result: { outcome: FightOutcome; awards: string[] } | null;
}

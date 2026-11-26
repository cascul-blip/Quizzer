import type { AvatarChoice } from "../avatars.ts";
import type { LandStart } from "../land-board.ts";
import type { AfterAnswerWaitView, QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

export type LandPhase = "countdown" | "playing" | "conquered" | "podium";
export const LAND_MINUTES = [3, 5, 7, 10] as const;
export const LAND_MIN_TEAMS = 2;
/** why: counts wrong answers too, so every player reaches the land. */
export const LAND_QUESTIONS_PER_ROUND = 3;
/** why: in claims; grass costs 1. */
export const LAND_STEAL_COST = 2;
/** why: in claims, for a tile 2 steps from another team's start; does not add to LAND_STEAL_COST. */
export const LAND_GUARD_COST = 2;
export const LAND_EMPTY_MS = 4000;

export interface LandSettings {
  theme?: SeasonTheme;
  teams: number;
  minutes: number;
}

/** why: empty = the "no tiles to place" message. */
export type LandState = "question" | "claim" | "empty";

/** why: owners[tile] is a team index or -1 for grass. */
export interface LandBoard {
  size: number;
  owners: number[];
  starts: LandStart[];
}

export interface LandPlace {
  seq: number;
  tile: number;
  team: number;
  stolen: boolean;
}

export interface LandCapture {
  seq: number;
  team: number;
  nickname: string;
  tiles: number[];
  knockedOut: number[];
}

const LAND_AWARDS = { mostCorrect: MOST_CORRECT_LABEL, topSettler: "Top settler", topSurrounder: "Master surrounder" } as const;

export type LandAwardKey = keyof typeof LAND_AWARDS;
export type LandAwards = Record<LandAwardKey, SubAward | null>;

export interface HostLandTeam extends TeamInfo {
  tiles: number;
  correct: number;
  rank: number;
  out: boolean;
  conqueredBy: number | null;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; claiming: boolean }[];
}

export interface HostLandState {
  theme?: SeasonTheme;
  kind: "land";
  phase: LandPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  board: LandBoard;
  teams: HostLandTeam[];
  lastPlace: LandPlace | null;
  lastCapture: LandCapture | null;
  playerCount: number;
  awards: LandAwards | null;
  /** why: podium only. */
  errors: QuestionError[] | null;
}

export interface PlayerLandView {
  theme?: SeasonTheme;
  kind: "land";
  phase: LandPhase;
  title: string;
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number; stolen: number };
  /** why: changes when their team is conquered. */
  team: TeamInfo;
  teamTiles: number;
  state: LandState;
  claims: number;
  /** why: 0 … LAND_QUESTIONS_PER_ROUND-1, reset each round of questions. */
  answered: number;
  emptyRemainingMs: number;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** why: only while this player is placing tiles. */
  board: LandBoard | null;
  claimWait: AfterAnswerWaitView | null;
  /** why: set once their first team was surrounded and they joined the conquerors. */
  conquered: { seq: number; from: string; by: string } | null;
  result: { teamRank: number; teamCount: number; tiles: number; won: boolean; awards: string[] } | null;
}

export type LandMsg =
  | StreamAnswerMsg<"land">
  | { type: "land.place"; tile: number }
  /** why: leaves the land early; unused claims are kept. */
  | { type: "land.done" };

export const landShared = sharedModeEntry<ModeProtocol<LandMsg, LandSettings, HostLandState, PlayerLandView>>()({
  name: "Land Grab",
  flags: { paced: false, protect: false },
  lobbyBanner: false,
  msgTypes: ["land.answer", "land.place", "land.done"],
  awards: LAND_AWARDS,
});

import type { AvatarChoice } from "../avatars.ts";
import type { LandStart } from "../land-board.ts";
import type { AfterAnswerWaitView, QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

export type LandPhase = "countdown" | "playing" | "conquered" | "podium";
export const LAND_MINUTES = [3, 5, 7, 10] as const;
export const LAND_MIN_TEAMS = 2;
/** Answers (right or wrong) before a player goes to the land. */
export const LAND_QUESTIONS_PER_ROUND = 3;
/** Claims it takes to steal a tile from another team; grass costs 1. */
export const LAND_STEAL_COST = 2;
/** Claims it takes to claim a tile 2 steps from another team's starting point (grass or stolen: the two don't add up). */
export const LAND_GUARD_COST = 2;
/** How long "You have no tiles to place!" shows before the questions come back. */
export const LAND_EMPTY_MS = 4000;

export interface LandSettings {
  theme?: SeasonTheme;
  teams: number;
  minutes: number;
}

/** question = answering; claim = placing tiles; empty = the "no tiles to place" message. */
export type LandState = "question" | "claim" | "empty";

/** The board as the screens draw it: owners[tile] is a team index or -1 for grass. */
export interface LandBoard {
  size: number;
  owners: number[];
  starts: LandStart[];
}

/** The latest tile a player placed. */
export interface LandPlace {
  seq: number;
  tile: number;
  team: number;
  stolen: boolean;
}

/** The latest surround: the tiles that changed hands, and any teams knocked out by it. */
export interface LandCapture {
  seq: number;
  team: number;
  nickname: string;
  tiles: number[];
  knockedOut: number[];
}

export interface LandAwards {
  mostCorrect: SubAward | null;
  topSettler: SubAward | null;
  topSurrounder: SubAward | null;
}

export interface HostLandTeam extends TeamInfo {
  tiles: number;
  correct: number;
  rank: number;
  out: boolean;
  /** The team that surrounded this one's starting point. */
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
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

export interface PlayerLandView {
  theme?: SeasonTheme;
  kind: "land";
  phase: LandPhase;
  title: string;
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number; stolen: number };
  /** The team this player is on now (it changes if their team is conquered). */
  team: TeamInfo;
  teamTiles: number;
  state: LandState;
  claims: number;
  /** Answers given in this round of questions (0 … LAND_QUESTIONS_PER_ROUND-1). */
  answered: number;
  /** Time left on the "no tiles to place" message (empty state). */
  emptyMs: number;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** The land, while this player is placing tiles. */
  board: LandBoard | null;
  claimWait: AfterAnswerWaitView | null;
  /** Set once this player's first team was surrounded and they joined the conquerors. */
  conquered: { seq: number; from: string; by: string } | null;
  result: { teamRank: number; teamCount: number; tiles: number; won: boolean; awards: string[] } | null;
}

export type LandMsg =
  | StreamAnswerMsg<"land">
  | { type: "land.place"; tile: number }
  /** Leave the land early; unused claims are kept for next time. */
  | { type: "land.done" };

export const landShared = sharedModeEntry<ModeProtocol<LandMsg, LandSettings, HostLandState, PlayerLandView>>()({
  name: "Land Grab",
  flags: { paced: false, protect: false },
  lobbyBanner: false,
  msgTypes: ["land.answer", "land.place", "land.done"],
});

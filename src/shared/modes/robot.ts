import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol, NoSettings } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";

export type RobotPhase = "countdown" | "quiz" | "move" | "attack" | "podium";
export type RobotDir = "up" | "down" | "left" | "right";
export const ROBOT_DIRS: readonly RobotDir[] = ["up", "down", "left", "right"];
/** The board is ROBOT_BOARD × ROBOT_BOARD tiles; tile index = y * ROBOT_BOARD + x, with y = 0 the row nearest the robot. */
export const ROBOT_BOARD = 12;
export const ROBOT_LIVES = 3;
/** The first quiz phase is this long; each round is ROBOT_QUIZ_STEP_MS shorter, down to ROBOT_QUIZ_MIN_MS. */
const ROBOT_QUIZ_START_MS = 30_000;
const ROBOT_QUIZ_STEP_MS = 2000;
export const ROBOT_QUIZ_MIN_MS = 7000;
/** The red Xs appear this long before the quiz phase ends. */
export const ROBOT_WARN_MS = 5000;
export const ROBOT_MOVE_MS = 7000;
/** The laser attack plays this long before the next quiz phase. */
export const ROBOT_ATTACK_MS = 3000;
/** Share of the playable board the robot targets (plus every occupied tile). */
export const ROBOT_HAZARD_FRACTION = 0.75;
/** Every this many rounds, the outer ring of the board is destroyed, until the board is ROBOT_MIN_BOARD wide. */
export const ROBOT_SHRINK_EVERY = 4;
export const ROBOT_MIN_BOARD = 2;

/** Length of round n's quiz phase (n starts at 1). */
export function robotQuizMs(round: number): number {
  return Math.max(ROBOT_QUIZ_MIN_MS, ROBOT_QUIZ_START_MS - ROBOT_QUIZ_STEP_MS * (round - 1));
}

/** Which ring a tile is in: 0 for the outer edge of the full board, counting inward. */
export function robotRing(tile: number): number {
  const x = tile % ROBOT_BOARD;
  const y = Math.floor(tile / ROBOT_BOARD);
  return Math.min(x, y, ROBOT_BOARD - 1 - x, ROBOT_BOARD - 1 - y);
}

/** Whether (x, y) is still on the board once `inset` rings are gone. */
export function robotInBounds(x: number, y: number, inset: number): boolean {
  return x >= inset && y >= inset && x < ROBOT_BOARD - inset && y < ROBOT_BOARD - inset;
}

const ROBOT_AWARDS = { mostCorrect: MOST_CORRECT_LABEL, mostMoves: "Fancy footwork" } as const;

export type RobotAwardKey = keyof typeof ROBOT_AWARDS;
export type RobotAwards = Record<RobotAwardKey, SubAward | null>;

/** The latest laser blast: who got hit and who was knocked out by it. */
export interface RobotAttack {
  seq: number;
  round: number;
  hit: string[];
  eliminated: string[];
}

export interface HostRobotPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  x: number;
  y: number;
  lives: number;
  out: boolean;
  points: number;
}

export interface RobotStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  lives: number;
  /** Round the player was knocked out in, or null for a survivor. */
  outRound: number | null;
  correct: number;
}

export interface HostRobotState {
  kind: "robot";
  phase: RobotPhase;
  quiz: { id: string; title: string; questionCount: number };
  round: number;
  phaseRemainingMs: number;
  /** Full length of the current phase, for the progress bar. */
  phaseDurationMs: number;
  /** Targeted tile indices; empty until the warning. */
  marked: number[];
  /** Rings of tiles destroyed so far. */
  inset: number;
  /** The ring being destroyed this round (all of it targeted); empty in other rounds. Stays up through the attack. */
  collapsing: number[];
  players: HostRobotPlayer[];
  lastAttack: RobotAttack | null;
  playerCount: number;
  /** Final standings, best first (podium only). */
  standings: RobotStanding[] | null;
  awards: RobotAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

export interface PlayerRobotView {
  kind: "robot";
  phase: RobotPhase;
  title: string;
  round: number;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; lives: number; out: boolean; points: number; correct: number; x: number; y: number };
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** The board, during movement and the attack only (quiz time is for questions). */
  board: { marked: number[]; inset: number; collapsing: number[]; others: { x: number; y: number }[] } | null;
  lastAttack: { seq: number; hit: boolean; eliminated: boolean } | null;
  result: { rank: number; playerCount: number; won: boolean; outRound: number | null; awards: string[] } | null;
}

export type RobotMsg = StreamAnswerMsg<"robot"> | { type: "robot.move"; dir: RobotDir };

export const robotShared = sharedModeEntry<ModeProtocol<RobotMsg, NoSettings, HostRobotState, PlayerRobotView>>()({
  name: "Robot Attack",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["robot.answer", "robot.move"],
  awards: ROBOT_AWARDS,
});

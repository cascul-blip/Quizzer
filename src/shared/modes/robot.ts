import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol, NoSettings } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";

export type RobotPhase = "countdown" | "quiz" | "move" | "attack" | "podium";
export type RobotDir = "up" | "down" | "left" | "right";
export const ROBOT_DIRS: readonly RobotDir[] = ["up", "down", "left", "right"];
/** why: square board; tile index = y * ROBOT_BOARD + x, with y = 0 the row nearest the robot. */
export const ROBOT_BOARD = 12;
export const ROBOT_LIVES = 3;
const ROBOT_QUIZ_START_MS = 30_000;
const ROBOT_QUIZ_STEP_MS = 2000;
export const ROBOT_QUIZ_MIN_MS = 7000;
/** why: the red Xs appear this long before the quiz phase ends. */
export const ROBOT_WARN_MS = 5000;
export const ROBOT_MOVE_MS = 7000;
export const ROBOT_ATTACK_MS = 3000;
/** why: every occupied tile is targeted on top of this share. */
export const ROBOT_HAZARD_FRACTION = 0.75;
/** why: in rounds; the outer ring goes each time until the board is ROBOT_MIN_BOARD wide. */
export const ROBOT_SHRINK_EVERY = 4;
export const ROBOT_MIN_BOARD = 2;

/** why: rounds start at 1. */
export function robotQuizMs(round: number): number {
  return Math.max(ROBOT_QUIZ_MIN_MS, ROBOT_QUIZ_START_MS - ROBOT_QUIZ_STEP_MS * (round - 1));
}

/** why: 0 is the outer edge of the full board, counting inward. */
export function robotRing(tile: number): number {
  const x = tile % ROBOT_BOARD;
  const y = Math.floor(tile / ROBOT_BOARD);
  return Math.min(x, y, ROBOT_BOARD - 1 - x, ROBOT_BOARD - 1 - y);
}

/** why: inset counts destroyed rings. */
export function robotInBounds(x: number, y: number, inset: number): boolean {
  return x >= inset && y >= inset && x < ROBOT_BOARD - inset && y < ROBOT_BOARD - inset;
}

const ROBOT_AWARDS = { mostCorrect: MOST_CORRECT_LABEL, mostMoves: "Fancy footwork" } as const;

export type RobotAwardKey = keyof typeof ROBOT_AWARDS;
export type RobotAwards = Record<RobotAwardKey, SubAward | null>;

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
  /** why: null for a survivor. */
  outRound: number | null;
  correct: number;
}

export interface HostRobotState {
  kind: "robot";
  phase: RobotPhase;
  quiz: { id: string; title: string; questionCount: number };
  round: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** why: tile indices; empty until the warning. */
  marked: number[];
  /** why: rings destroyed so far. */
  inset: number;
  /** why: empty except in shrink rounds; stays up through the attack. */
  collapsing: number[];
  players: HostRobotPlayer[];
  lastAttack: RobotAttack | null;
  playerCount: number;
  /** why: best first; podium only. */
  standings: RobotStanding[] | null;
  awards: RobotAwards | null;
  /** why: podium only. */
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
  /** why: null in quiz time, which is for questions. */
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

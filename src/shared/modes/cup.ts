import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

export type CupPhase = "countdown" | "roll" | "quiz" | "drink" | "reveal" | "podium";
/** why: starting cups per player (a lobby setting); each survived drink removes one. */
export const CUP_MIN_CUPS = 1;
export const CUP_MAX_CUPS = 6;
export const CUP_DEFAULT_CUPS = 3;

export interface CupSettings {
  cups: number;
  theme?: SeasonTheme;
}
export const CUP_DIE_SIDES = 6;
/** why: the dice tumble this long before the quiz timer starts. */
export const CUP_ROLL_MS = 2500;
const CUP_QUIZ_START_MS = 30_000;
const CUP_QUIZ_STEP_MS = 2000;
export const CUP_QUIZ_MIN_MS = 10_000;
/** why: anyone who hasn't picked by then gets a random cup. */
export const CUP_DRINK_MS = 10_000;
export const CUP_SIP_MS = 1800;
export const CUP_VERDICT_MS = 1800;
export const CUP_ALL_SAFE_MS = 2500;

/** why: rounds count from 1. */
export function cupQuizMs(round: number): number {
  return Math.max(CUP_QUIZ_MIN_MS, CUP_QUIZ_START_MS - CUP_QUIZ_STEP_MS * (round - 1));
}

const EARLIEST_FIRST_CUP_OUT = { christmas: "First flight", classic: "Unluckiest" } satisfies Record<SeasonTheme, string>;

/** why: shared so the server and the projector show the same Podium award labels (GLOSSARY.md). */
export function cupAwardLabels(theme?: SeasonTheme) {
  return {
    mostCorrect: MOST_CORRECT_LABEL,
    mostDrinksSurvived: "Luckiest drinker",
    mostSafeRounds: "Never thirsty",
    earliestFirstCupOut: EARLIEST_FIRST_CUP_OUT[modeTheme("cup", theme)],
  };
}

export type CupAwardKey = keyof ReturnType<typeof cupAwardLabels>;
/** why: earliestFirstCupOut's value is the round their first cup poisoned them. */
export type CupAwards = Record<CupAwardKey, SubAward | null>;

export interface CupDrinkView {
  id: string;
  /** why: 0-based among the cupsBefore cups in front of them. */
  cup: number;
  cupsBefore: number;
  /** why: picked for them (time ran out, or it was their last cup). */
  auto: boolean;
  /** why: null until this drinker's verdict is shown. */
  verdict: "poison" | "safe" | null;
}

export interface CupRevealView {
  seq: number;
  round: number;
  drinks: CupDrinkView[];
  /** why: -1 before the first drinker and after the last. */
  current: number;
}

export interface HostCupPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  cups: number;
  out: boolean;
  /** why: correct answers needed this round; 0 before the first roll. */
  target: number;
  progress: number;
  safe: boolean;
  /** why: drinker and picked are meaningful in the drink phase only. */
  drinker: boolean;
  picked: boolean;
}

export interface CupStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  cups: number;
  /** why: null for a survivor. */
  outRound: number | null;
  correct: number;
}

export interface HostCupState {
  kind: "cup";
  theme?: SeasonTheme;
  phase: CupPhase;
  quiz: { id: string; title: string; questionCount: number };
  round: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  players: HostCupPlayer[];
  startCups: number;
  /** why: reveal phase only. */
  reveal: CupRevealView | null;
  playerCount: number;
  standings: CupStanding[] | null;
  awards: CupAwards | null;
  errors: QuestionError[] | null;
}

export interface PlayerCupView {
  kind: "cup";
  theme?: SeasonTheme;
  phase: CupPhase;
  title: string;
  round: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; cups: number; out: boolean; target: number; progress: number; safe: boolean; correct: number };
  startCups: number;
  /** why: living players get questions in the quiz until safe; poisoned players any time, for practice. */
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** why: drink phase, drinkers only. */
  drink: { picked: number | null } | null;
  /** why: reveal phase, drinkers only; `turn` is true while they are in the spotlight. */
  myDrink: (CupDrinkView & { seq: number; turn: boolean; waiting: boolean }) | null;
  alive: number;
  result: { rank: number; playerCount: number; won: boolean; outRound: number | null; awards: string[] } | null;
}

export type CupMsg =
  | StreamAnswerMsg<"cup">
  /** why: drink phase, drinkers only; cup is 0-based left to right, final once sent. */
  | { type: "cup.pick"; cup: number };

export const cupShared = sharedModeEntry<ModeProtocol<CupMsg, CupSettings, HostCupState, PlayerCupView>>()({
  name: "Cup of Death",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["cup.answer", "cup.pick"],
  get awards() {
    return cupAwardLabels();
  },
});

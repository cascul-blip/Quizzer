import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

// Cup of Death protocol types.

export type CupPhase = "countdown" | "roll" | "quiz" | "drink" | "reveal" | "podium";
/** Cups in front of each player at the start (a lobby setting); one is drunk (and gone) each time they survive a drink. */
export const CUP_MIN_CUPS = 1;
export const CUP_MAX_CUPS = 6;
export const CUP_DEFAULT_CUPS = 3;

export interface CupSettings {
  cups: number;
  theme?: SeasonTheme;
}
export const CUP_DIE_SIDES = 6;
/** The dice tumble this long before the quiz timer starts. */
export const CUP_ROLL_MS = 2500;
/** The first quiz phase is this long; each round is CUP_QUIZ_STEP_MS shorter, down to CUP_QUIZ_MIN_MS. */
const CUP_QUIZ_START_MS = 30_000;
const CUP_QUIZ_STEP_MS = 2000;
export const CUP_QUIZ_MIN_MS = 10_000;
/** Time to pick a cup; anyone who hasn't picked by then gets a random one. */
export const CUP_DRINK_MS = 10_000;
/** In the reveal, each drinker raises the cup and gulps for CUP_SIP_MS, then the verdict shows for CUP_VERDICT_MS. */
export const CUP_SIP_MS = 1800;
export const CUP_VERDICT_MS = 1800;
/** How long "Everyone's safe!" shows when nobody has to drink. */
export const CUP_ALL_SAFE_MS = 2500;

/** Length of round n's quiz phase (n starts at 1). */
export function cupQuizMs(round: number): number {
  return Math.max(CUP_QUIZ_MIN_MS, CUP_QUIZ_START_MS - CUP_QUIZ_STEP_MS * (round - 1));
}

export interface CupAwards {
  mostCorrect: SubAward | null;
  /** Most drinks survived. */
  luckiest: SubAward | null;
  /** Most rounds made safe without drinking. */
  neverThirsty: SubAward | null;
  /** Poisoned by the first cup they ever drank (a 1-in-N chance, N = the starting cups), earliest round; value = that round. */
  unluckiest: SubAward | null;
}

/** One drinker in the reveal, in the order they are revealed. */
export interface CupDrinkView {
  id: string;
  /** The cup they drank (0-based among the cupsBefore cups in front of them). */
  cup: number;
  cupsBefore: number;
  /** The cup was picked for them (time ran out, or it was their last cup). */
  auto: boolean;
  /** Null until this drinker's verdict is shown. */
  verdict: "poison" | "safe" | null;
}

export interface CupRevealView {
  seq: number;
  round: number;
  drinks: CupDrinkView[];
  /** Index of the drinker in the spotlight, or -1 before the first and after the last. */
  current: number;
}

export interface HostCupPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  /** Cups still in front of them. */
  cups: number;
  out: boolean;
  /** This round's dice roll: correct answers needed (0 before the first roll). */
  target: number;
  /** Correct answers so far this round. */
  progress: number;
  safe: boolean;
  /** Drink phase: has to drink this round. */
  drinker: boolean;
  /** Drink phase: has picked a cup. */
  picked: boolean;
}

export interface CupStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  cups: number;
  /** Round the player was poisoned in, or null for a survivor. */
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
  /** Full length of the current phase, for the progress bar. */
  phaseDurationMs: number;
  players: HostCupPlayer[];
  /** Cups each player started with. */
  startCups: number;
  /** The drinks of the current round (reveal phase), or null. */
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
  /** Cups each player started with. */
  startCups: number;
  /** Questions to answer: living players during the quiz until safe; poisoned players any time, for practice. */
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** Drink phase, drinkers only: their pick so far (null until they pick). */
  drink: { picked: number | null } | null;
  /** Reveal phase, drinkers only: this player's own drink. `turn` is true while they are in the spotlight. */
  myDrink: (CupDrinkView & { seq: number; turn: boolean; waiting: boolean }) | null;
  /** Players still alive. */
  alive: number;
  result: { rank: number; playerCount: number; won: boolean; outRound: number | null; awards: string[] } | null;
}

/** What a phone sends during Cup of Death games. */
export type CupMsg =
  | StreamAnswerMsg<"cup">
  /** Drink phase, drinkers only: pick one of your remaining cups (0-based, left to right). Final once sent. */
  | { type: "cup.pick"; cup: number };

/** Cup of Death's shared mode entry. */
export const cupShared = sharedModeEntry<ModeProtocol<CupMsg, CupSettings, HostCupState, PlayerCupView>>()({
  name: "Cup of Death",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["cup.answer", "cup.pick"],
});

import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { RacerCar, RacerConfidence, RacerTurnResult } from "../racer-rules.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

export interface RacerSettings {
  theme: SeasonTheme;
}

/** why: a turn runs confidence → open → reveal with a driver, intro → open → reveal without one (car crashed, nobody connected). */
export type RacerPhase = "intro" | "confidence" | "open" | "reveal" | "podium";

/** why: frozen at turn start, even if the driver leaves or is removed. */
export interface RacerDriver {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
}

export interface RacerTurn extends RacerTurnResult {
  /** why: QuestionView.index of the turn's question; clients key the turn animation on it to play it once. */
  index: number;
  driver: RacerDriver | null;
}

export interface RacerResult {
  distanceMiles: number;
  topSpeedMph: number;
  crashes: number;
  /** why: fewer than the quiz's questions if the host ended the game early. */
  turns: number;
}

const RACER_AWARDS = { mostCorrect: MOST_CORRECT_LABEL, mostMphGained: "Best driver" } as const;

export type RacerAwardKey = keyof typeof RACER_AWARDS;
export type RacerAwards = Record<RacerAwardKey, SubAward | null>;

export interface HostRacerPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  answered: boolean;
  /** why: closed questions only; an unanswered one counts as neither correct nor wrong. */
  correct: number;
  wrong: number;
  turnsDriven: number;
  /** why: summed over the turns this player drove, as is failsAsDriver. */
  mphGained: number;
  failsAsDriver: number;
}

export interface HostRacerState {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  quiz: { id: string; title: string; questionCount: number };
  /** why: manual waits for host.next on the reveal, auto moves on after 5 s; host.setPacing works mid-game. */
  pacing: Pacing;
  /** why: `options` is empty during intro and confidence; `remainingMs` is 0 on the reveal. Null at the podium. */
  question: QuestionView | null;
  driver: RacerDriver | null;
  /** why: live during confidence, then the locked position; `confidence` is set only once locked (open on). */
  lever: RacerConfidence | null;
  confidence: RacerConfidence | null;
  answeredCount: number;
  playerCount: number;
  players: HostRacerPlayer[];
  /** why: Reveal only, as are answerCounts and ejected. */
  correct: number[] | null;
  answerCounts: number[] | null;
  /** why: on the reveal the turn is already applied; lastTurn.speedBefore has the old speed. */
  car: RacerCar;
  /** why: this question's turn on the reveal, the previous question's before that. */
  lastTurn: RacerTurn | null;
  /** why: wrong or unanswered players, shown falling out of the car. */
  ejected: { id: string; nickname: string; avatar: AvatarChoice }[] | null;
  /** why: both 0 when the phase has no timer (manual-paced reveal, podium). */
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** why: Podium only, as are awards and errors. */
  result: RacerResult | null;
  awards: RacerAwards | null;
  errors: QuestionError[] | null;
}

/** why: complete, so a phone can redraw from scratch after a reconnect in any phase. */
export interface PlayerRacerView {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  title: string;
  /** why: totals over closed questions only; they don't move while a question is open. */
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; wrong: number; turnsDriven: number; mphGained: number; failsAsDriver: number };
  playerCount: number;
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** why: only the driver may send racer.lever and racer.go, in the confidence phase. */
  isDriver: boolean;
  driver: RacerDriver | null;
  /** why: the driver's own lever follows the server's value too. */
  lever: RacerConfidence | null;
  confidence: RacerConfidence | null;
  /** why: myChoice and myText are set in open and reveal only. */
  myChoice: number | null;
  myText: string | null;
  /** why: Reveal only. */
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean } | null;
  car: RacerCar;
  lastTurn: RacerTurn | null;
  /** why: Podium only; `awards` are titles this player won, their own numbers are in `me`. */
  result: (RacerResult & { awards: string[] }) | null;
}

export type RacerMsg =
  /** why: driver only, confidence phase only (as is racer.go, which locks the lever and opens the question). */
  | { type: "racer.lever"; level: RacerConfidence }
  | { type: "racer.go" }
  /** why: open phase only; one answer per player per question. */
  | PacedAnswerMsg<"racer">;

export const racerShared = sharedModeEntry<ModeProtocol<RacerMsg, RacerSettings, HostRacerState, PlayerRacerView>>()({
  name: "Racer",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["racer.lever", "racer.go", "racer.answer"],
  awards: RACER_AWARDS,
});

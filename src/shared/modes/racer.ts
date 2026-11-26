import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { RacerCar, RacerConfidence, RacerTurnResult } from "../racer-rules.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

export interface RacerSettings {
  theme: SeasonTheme;
}

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
  correct: number;
  wrong: number;
  turnsDriven: number;
  mphGained: number;
  failsAsDriver: number;
}

export interface HostRacerState {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  question: QuestionView | null;
  driver: RacerDriver | null;
  /** why: live during confidence, then the locked position; `confidence` is set only once locked (open on). */
  lever: RacerConfidence | null;
  confidence: RacerConfidence | null;
  answeredCount: number;
  playerCount: number;
  players: HostRacerPlayer[];
  correct: number[] | null;
  answerCounts: number[] | null;
  /** why: The reveal animates from lastTurn.speedBefore because the car already holds the settled turn's speed. */
  car: RacerCar;
  /** why: this question's turn on the reveal, the previous question's before that. */
  lastTurn: RacerTurn | null;
  ejected: { id: string; nickname: string; avatar: AvatarChoice }[] | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  result: RacerResult | null;
  awards: RacerAwards | null;
  errors: QuestionError[] | null;
}

export interface PlayerRacerView {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  title: string;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; wrong: number; turnsDriven: number; mphGained: number; failsAsDriver: number };
  playerCount: number;
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  isDriver: boolean;
  driver: RacerDriver | null;
  lever: RacerConfidence | null;
  confidence: RacerConfidence | null;
  myChoice: number | null;
  myText: string | null;
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean } | null;
  car: RacerCar;
  lastTurn: RacerTurn | null;
  result: (RacerResult & { awards: string[] }) | null;
}

export type RacerMsg =
  /** why: driver only, confidence phase only (as is racer.go, which locks the lever and opens the question). */
  { type: "racer.lever"; level: RacerConfidence } | { type: "racer.go" } | PacedAnswerMsg<"racer">;

export const racerShared = sharedModeEntry<ModeProtocol<RacerMsg, RacerSettings, HostRacerState, PlayerRacerView>>()({
  name: "Racer",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["racer.lever", "racer.go", "racer.answer"],
  awards: RACER_AWARDS,
});

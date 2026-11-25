import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { RacerCar, RacerConfidence, RacerTurnResult } from "../racer-rules.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";

// Racer protocol types.
//
// Co-op, paced like Classic: one shared question per turn, every question once, then the podium.
// The whole class shares one car. The rules (speeds, gains, fails, crash, repair) live in racer-rules.ts.
//
// A turn is "confidence" → "open" → "reveal" when the car is running (a driver sets the lever, then everyone answers),
// or "intro" → "open" → "reveal" when there is no driver (the car is crashed, or nobody is connected).

export interface RacerSettings {
  theme: SeasonTheme;
}

/**
 * intro: 3 s look at the question on a turn without a driver; options hidden.
 * confidence: the driver sets the lever (20 s at most); everyone sees the question, options hidden.
 * open: options visible, everyone answers once, the driver too.
 * reveal: correct answers, counts and what the turn did to the car (`lastTurn`).
 * podium: the game is over.
 */
export type RacerPhase = "intro" | "confidence" | "open" | "reveal" | "podium";

/** The player at the wheel this turn. Kept as it was when the turn started, even if they leave or are removed. */
export interface RacerDriver {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
}

/**
 * Summary of the most recently finished turn: confidence, correct, total, gainMph, fails, speedBefore,
 * speedAfter, crashed, repaired and distanceAdded come from RacerTurnResult.
 */
export interface RacerTurn extends RacerTurnResult {
  /** Index of the question this turn was about (QuestionView.index); use it to play the turn's animation once. */
  index: number;
  /** Null when the turn had no driver. */
  driver: RacerDriver | null;
}

export interface RacerResult {
  distanceMiles: number;
  topSpeedMph: number;
  crashes: number;
  /** Turns played to the end (fewer than the quiz has questions if the host ended the game early). */
  turns: number;
}

export interface RacerAwards {
  mostCorrect: SubAward | null;
  /** Most mph gained while driving. */
  bestDriver: SubAward | null;
}

export interface HostRacerPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  answered: boolean;
  /** Totals over the questions closed so far. A question left unanswered counts as neither. */
  correct: number;
  wrong: number;
  turnsDriven: number;
  /** Mph gained on the turns this player drove. */
  mphGained: number;
  /** Fail points on the turns this player drove. */
  failsAsDriver: number;
}

export interface HostRacerState {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  quiz: { id: string; title: string; questionCount: number };
  /** Manual waits for host.next on the reveal; auto moves on after 5 s. host.setPacing works mid-game. */
  pacing: Pacing;
  /** The current question (null at the podium). `options` is empty during intro and confidence; `remainingMs` is the time left in intro, confidence or open, 0 on the reveal. */
  question: QuestionView | null;
  /** This turn's driver; null on a turn without one and at the podium. */
  driver: RacerDriver | null;
  /** Where the lever is: live during confidence, then where it was locked. Null without a driver. */
  lever: RacerConfidence | null;
  /** The locked lever, from the open phase on; null before that and without a driver. */
  confidence: RacerConfidence | null;
  answeredCount: number;
  playerCount: number;
  players: HostRacerPlayer[];
  /** Reveal only: indices of the correct option(s). */
  correct: number[] | null;
  /** Reveal only: how many players picked each option. */
  answerCounts: number[] | null;
  /** The car as it is now; on the reveal the turn has already been applied (lastTurn.speedBefore has the old speed). */
  car: RacerCar;
  /** The latest finished turn: this question's on the reveal, the previous question's before that. Null until the first question closes. */
  lastTurn: RacerTurn | null;
  /** Reveal only: the players who got this question wrong or didn't answer it; they fall out of the car. */
  ejected: { id: string; nickname: string; avatar: AvatarChoice }[] | null;
  /** Time left in the current phase; 0 when it has no timer (reveal with manual pacing, podium). */
  phaseRemainingMs: number;
  /** Full length of the current phase, for a progress bar; 0 when it has no timer. */
  phaseDurationMs: number;
  /** Podium only. */
  result: RacerResult | null;
  awards: RacerAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

/** A phone's complete snapshot: enough to redraw from scratch after a reconnect in any phase. */
export interface PlayerRacerView {
  kind: "racer";
  theme?: SeasonTheme;
  phase: RacerPhase;
  title: string;
  /** Totals over the questions closed so far (they don't move while a question is open). */
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; wrong: number; turnsDriven: number; mphGained: number; failsAsDriver: number };
  playerCount: number;
  /** As HostRacerState.question. */
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** This player is at the wheel this turn: in the confidence phase they send racer.lever and racer.go. */
  isDriver: boolean;
  driver: RacerDriver | null;
  /** As HostRacerState.lever; the driver's own lever follows it too. */
  lever: RacerConfidence | null;
  /** As HostRacerState.confidence. */
  confidence: RacerConfidence | null;
  /** The option this player picked for the current question (open and reveal), if any. */
  myChoice: number | null;
  /** What this player typed, for a typed question (open and reveal), if they answered. */
  myText: string | null;
  /** Reveal only: how this player did on the question. */
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean } | null;
  car: RacerCar;
  /** As HostRacerState.lastTurn. */
  lastTurn: RacerTurn | null;
  /** Podium only: the shared result and the titles of the awards this player won. Their own numbers are in `me`. */
  result: (RacerResult & { awards: string[] }) | null;
}

export type RacerMsg =
  /** Driver only, confidence phase only: move the lever (everyone sees it move). */
  | { type: "racer.lever"; level: RacerConfidence }
  /** Driver only, confidence phase only: lock the lever where it is and open the question. */
  | { type: "racer.go" }
  /** Open phase only. One answer per player per question. */
  | PacedAnswerMsg<"racer">;

export const racerShared = sharedModeEntry<ModeProtocol<RacerMsg, RacerSettings, HostRacerState, PlayerRacerView>>()({
  name: "Racer",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["racer.lever", "racer.go", "racer.answer"],
});

import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";

// Submarine Squad protocol types.

export type SubPhase = "countdown" | "chase" | "escaped" | "dive" | "caught" | "podium";
/** Correct answers needed to earn one boost. */
export const CORRECT_PER_BOOST = 4;

export interface SubAwards {
  topBooster: SubAward | null;
  sharpestEyes: SubAward | null;
  mostCorrect: SubAward | null;
}

export interface HostSubState {
  kind: "submarine";
  phase: SubPhase;
  quiz: { id: string; title: string; questionCount: number };
  level: number;
  /** Meters below the surface; the final score. */
  depth: number;
  /** Time left in the countdown / cut-scene / dive. */
  phaseRemainingMs: number;
  /** Distance to the fish in seconds of fish travel, as of when this was sent. */
  gap: number;
  /** How fast the gap closes (gap-seconds per second). */
  speed: number;
  maxGap: number;
  boosts: number;
  required: number;
  lastBoost: { seq: number; nickname: string; avatar: AvatarChoice } | null;
  dive: {
    instructors: { nickname: string; index: number; total: number; found: number; groupSize: number; done: boolean }[];
  } | null;
  players: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: "question" | "boost" | "waiting" }[];
  playerCount: number;
  awards: SubAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

export interface PlayerSubView {
  kind: "submarine";
  phase: SubPhase;
  title: string;
  level: number;
  depth: number;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; boosts: number; diveHits: number };
  state: "question" | "boost" | "waiting";
  /** Correct answers toward the next boost (0 … CORRECT_PER_BOOST-1). */
  towardBoost: number;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  dive: // symbolRemainingMs of symbolMs: time left to find the current symbol before the instructor moves on.
    | { role: "instructor"; symbol: string; index: number; total: number; found: number; groupSize: number; symbolRemainingMs: number; symbolMs: number }
    | {
        role: "diver";
        grid: string[];
        index: number;
        total: number;
        lockedMs: number;
        done: boolean;
        hint: string | null;
        symbolRemainingMs: number;
        symbolMs: number;
      }
    | { role: "waiting" }
    | null;
  result: { depth: number; level: number; awards: string[] } | null;
}

/** What a phone sends during Submarine Squad games. */
export type SubMsg = { type: "sub.answer"; seq: number; option: number; text?: string } | { type: "sub.boost" } | { type: "sub.tap"; symbol: string };

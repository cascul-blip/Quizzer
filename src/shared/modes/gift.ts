import type { AvatarChoice } from "../avatars.ts";
import type { GiftItem, GiftPower } from "../gift-rules.ts";
import type { QuestionError, StreamFeedbackView, StreamQuestionView } from "../mode-views.ts";

// Gift Grab protocol types.

export type GiftPhase = "countdown" | "playing" | "finishing" | "podium";

export interface GiftSettings {
  minutes: number;
}

export interface GiftStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  score: number;
  correct: number;
  connected: boolean;
  inBonus: boolean;
}

export interface HostGiftState {
  kind: "gift";
  phase: GiftPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  standings: GiftStanding[];
  mostCorrect: { value: number; nicknames: string[] } | null;
  errors: QuestionError[];
}

export interface GiftHit {
  item: number;
  delta: number;
  effect: GiftPower | "blocked" | null;
}

export interface PlayerGiftView {
  kind: "gift";
  phase: GiftPhase;
  remainingMs: number;
  progress: number;
  score: number;
  correct: number;
  rank: number | null;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  bonus: {
    round: number;
    remainingMs: number;
    multiplier: number;
    items: GiftItem[];
    hits: GiftHit[];
    power: GiftPower | null;
  } | null;
}

/** What a phone sends during Gift Grab games. */
export type GiftMsg = { type: "gift.answer"; seq: number; option: number; text?: string } | { type: "gift.tap"; round: number; item: number };

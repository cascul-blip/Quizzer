import type { AvatarChoice } from "../avatars.ts";
import type { GiftItem, GiftPower } from "../gift-rules.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";

const GIFT_AWARDS = { mostCorrect: MOST_CORRECT_LABEL } as const;

export type GiftAwardKey = keyof typeof GIFT_AWARDS;

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
  mostCorrect: SubAward | null;
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

export type GiftMsg = StreamAnswerMsg<"gift"> | { type: "gift.tap"; round: number; item: number };

export const giftShared = sharedModeEntry<ModeProtocol<GiftMsg, GiftSettings, HostGiftState, PlayerGiftView>>()({
  name: "Gift Grab",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["gift.answer", "gift.tap"],
  awards: GIFT_AWARDS,
});

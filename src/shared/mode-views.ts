import type { AvatarChoice } from "./avatars.ts";
import type { PinSpot, QuestionType } from "./quiz-schema.ts";

export interface StreamQuestionView {
  seq: number;
  type: QuestionType;
  text: string;
  image?: string;
  options: string[];
  spots?: PinSpot[];
}

export interface StreamFeedbackView {
  seq: number;
  correct: boolean;
  remainingMs: number;
  answers: string[];
  penaltyDurationMs: number;
}

/** why: remainingMs counts from when this view was sent, not from the activity's start. */
export interface AfterAnswerWaitView {
  /** why: holds the seq of the Streamed question that opened the activity. */
  activityKey: number;
  remainingMs: number;
}

export interface QuestionError {
  wrong: number;
  text: string;
  /** why: option texts, not indexes, so the table reads without the quiz. */
  answers: string[];
}

/** why: ties share an award, so it lists everyone who reached the winning value. */
export interface SubAward {
  value: number;
  nicknames: string[];
}

export interface TeamInfo {
  index: number;
  name: string;
  color: string;
}

export type Pacing = "manual" | "auto";

export interface QuestionView {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  image?: string;
  timeLimitSec: number;
  /** why: empty during the intro phase so phones can't answer early. */
  options: string[];
  /** why: Pin questions only; sent together with options, one spot per option. */
  spots?: PinSpot[];
  /** why: relative to send time; clients add it to their own clock to avoid clock skew. */
  remainingMs: number;
}

/** why: `seq` is the StreamQuestionView's seq; typed questions send `text` and ignore `option`. */
export type StreamAnswerMsg<Prefix extends string> = { type: `${Prefix}.answer`; seq: number; option: number; text?: string };

/** why: `index` is QuestionView.index; typed questions send `text` and ignore `option`. */
export type PacedAnswerMsg<Prefix extends string> = { type: `${Prefix}.answer`; index: number; option: number; text?: string };

export interface HostPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  score: number;
  connected: boolean;
}

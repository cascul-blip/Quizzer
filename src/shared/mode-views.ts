import type { PinSpot, QuestionType } from "./quiz-schema.ts";

// View pieces several game modes share. Both protocol.ts and the mode files in modes/ import these,
// so this file must not import either of them.

/** A self-paced mode's current question for one player. */
export interface StreamQuestionView {
  seq: number;
  type: QuestionType;
  text: string;
  image?: string;
  options: string[];
  spots?: PinSpot[];
}

/** Feedback for an answer in a self-paced mode. */
export interface StreamFeedbackView {
  seq: number;
  correct: boolean;
  remainingMs: number;
  answers: string[];
  penaltyMs: number;
}

/** One row of the final screen's "Show errors" table. */
export interface QuestionError {
  wrong: number;
  text: string;
  /** Text of the correct option(s). */
  answers: string[];
}

/** One award on a final screen: the winning value and everyone who reached it. Every mode's awards use it. */
export interface SubAward {
  value: number;
  nicknames: string[];
}

export interface TeamInfo {
  index: number;
  name: string;
  color: string;
}

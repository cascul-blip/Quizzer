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

export type Pacing = "manual" | "auto";

export interface QuestionView {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  image?: string;
  timeLimitSec: number;
  /** Empty during the intro phase so phones can't answer early. */
  options: string[];
  /** Pin questions: where each option's spot sits on the image (sent together with options). */
  spots?: PinSpot[];
  /** Milliseconds left when the message was sent (clients add it to their own clock). */
  remainingMs: number;
}

/** A phone's answer to a streamed question (see GLOSSARY.md): `seq` is the StreamQuestionView's seq. Typed questions send `text` and ignore `option`. */
export type StreamAnswerMsg<Prefix extends string> = { type: `${Prefix}.answer`; seq: number; option: number; text?: string };

/** A phone's answer to a paced question (see GLOSSARY.md): `index` is QuestionView.index, as `qIndex` in the classic "answer". Typed questions send `text` and ignore `option`. */
export type PacedAnswerMsg<Prefix extends string> = { type: `${Prefix}.answer`; index: number; option: number; text?: string };

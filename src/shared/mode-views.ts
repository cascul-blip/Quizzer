import type { PinSpot, QuestionType } from "./quiz-schema.ts";

// View pieces several game modes share. Both protocol.ts and the mode files in modes/ import these,
// so this file must not import either of them.

/** What one game mode's server, projector and phone share (GLOSSARY.md: shared mode entry). Each mode file in modes/ declares its own; src/shared/mode-entries.ts collects them. */
export interface SharedModeEntry<T extends string = string> {
  /** The mode's one plain name (GLOSSARY.md). A seasonal theme may decorate how the client shows it. */
  name: string;
  flags: {
    /** Played question by question: the host sets its pacing (in the lobby and during the game) and moves it on, and the pacing carries over to the next lobby. The lobby also offers to shuffle the question order. */
    paced: boolean;
    /** "Protect from abuse" applies: wrong answers in a row make a player wait longer before the next question. The lobby offers it. */
    protect: boolean;
  };
  /** Phones in the lobby show the mode's banner instead of the plain waiting screen (Kingdom Siege's castle). */
  lobbyBanner: boolean;
  /** The type of every phone message the mode handles; the hub routes each one to the mode. */
  msgTypes: readonly T[];
}

/** A mode's shared mode entry, kept as literal types; the compiler holds msgTypes to exactly the types of the mode's phone messages Msg. */
export function sharedModeEntry<Msg extends { type: string }>() {
  return <const E extends SharedModeEntry<Msg["type"]>>(
    entry: E & ([Msg["type"]] extends [E["msgTypes"][number]] ? unknown : { missingMsgTypes: Exclude<Msg["type"], E["msgTypes"][number]> }),
  ): E => entry;
}

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

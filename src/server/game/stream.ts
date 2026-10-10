import type { Question, QuestionType } from "../../shared/quiz-schema.ts";
import type { QuestionError } from "../../shared/protocol.ts";
import { shuffle, shuffleOptions, topErrors, type Clock } from "./common.ts";

/** How long the ✓/✗ flash shows before the next question can be answered. */
export const FEEDBACK_MS = 1000;
/** Extra time the ✗ stays up after a 2nd wrong answer in a row, and after a 3rd or later one. */
export const WRONG_PENALTY_2_MS = 3000;
export const WRONG_PENALTY_3_MS = 4000;

/** How much longer the ✗ shows for a wrong answer that is the streak-th in a row. */
export function wrongPenaltyMs(streak: number): number {
  return streak >= 3 ? WRONG_PENALTY_3_MS : streak === 2 ? WRONG_PENALTY_2_MS : 0;
}

interface CurrentQuestion {
  seq: number;
  qIndex: number;
  options: string[];
  correct: number[];
}

/** Per-player state for answering questions at your own pace (Tallest Tower, Submarine Squad). */
export interface StreamPlayer {
  correct: number;
  wrong: number;
  /** Current run of consecutive wrong answers. */
  wrongStreak: number;
  /** Remaining question indices of this player's shuffled deck. */
  deck: number[];
  current: CurrentQuestion | null;
  seq: number;
  /** answers = text of the correct option(s), shown when the player got it wrong; penaltyMs = extra wait for guessing. */
  feedback: { seq: number; correct: boolean; answers: string[]; penaltyMs: number } | null;
  /** Answers are ignored until the feedback flash is over. */
  readyAt: number;
}

export function newStreamPlayer(): StreamPlayer {
  return { correct: 0, wrong: 0, wrongStreak: 0, deck: [], current: null, seq: 0, feedback: null, readyAt: 0 };
}

export interface StreamQuestionView {
  seq: number;
  type: QuestionType;
  text: string;
  image?: string;
  options: string[];
}

/** Deals each player their own shuffled, repeating deck of questions and scores their answers. */
export class QuestionStream {
  /** Wrong answers given to each question, by everyone, over the whole game. */
  readonly wrongCounts: number[];

  constructor(
    private readonly questions: Question[],
    private readonly shuffleAnswers: boolean,
    private readonly rng: () => number,
    private readonly clock: Clock,
    /** Hold the ✗ longer for wrong answers in a row (the lobby's "Protect from abuse"). */
    private readonly penalizeGuessing = false,
  ) {
    this.wrongCounts = questions.map(() => 0);
  }

  /** Give the player their next question: a personal shuffled deck, reshuffled when used up. */
  deal(p: StreamPlayer): void {
    const last = p.current?.qIndex;
    if (p.deck.length === 0) {
      p.deck = shuffle(this.questions.map((_, i) => i), this.rng);
      // Don't repeat the question just answered across a reshuffle.
      if (p.deck.length > 1 && p.deck[0] === last) p.deck.push(p.deck.shift()!);
    }
    const qIndex = p.deck.shift()!;
    const q = this.questions[qIndex]!;
    const shown = this.shuffleAnswers ? shuffleOptions(q, this.rng) : q;
    p.seq++;
    p.current = { seq: p.seq, qIndex, options: [...shown.options], correct: [...shown.correct] };
  }

  /**
   * Score an answer to the current question and deal the next one.
   * Returns whether it was correct, or null if the answer was rejected
   * (stale seq, still in the feedback flash, or an invalid option).
   */
  answer(p: StreamPlayer, seq: number, option: number): boolean | null {
    const cur = p.current;
    if (!cur || seq !== cur.seq || this.clock.now() < p.readyAt) return null;
    if (!Number.isInteger(option) || option < 0 || option >= cur.options.length) return null;
    const correct = cur.correct.includes(option);
    if (correct) {
      p.correct++;
      p.wrongStreak = 0;
    } else {
      p.wrong++;
      p.wrongStreak++;
      this.wrongCounts[cur.qIndex]!++;
    }
    const penaltyMs = this.penalizeGuessing ? wrongPenaltyMs(p.wrongStreak) : 0;
    p.feedback = { seq, correct, answers: correct ? [] : cur.correct.map((i) => cur.options[i]!), penaltyMs };
    p.readyAt = this.clock.now() + FEEDBACK_MS + penaltyMs;
    this.deal(p);
    return correct;
  }

  /** The most-missed questions, for the final screen. */
  errors(): QuestionError[] {
    return topErrors(this.questions, this.wrongCounts);
  }

  questionView(p: StreamPlayer): StreamQuestionView | null {
    if (!p.current) return null;
    const q = this.questions[p.current.qIndex]!;
    return { seq: p.current.seq, type: q.type, text: q.text, ...(q.image ? { image: q.image } : {}), options: p.current.options };
  }

  feedbackView(p: StreamPlayer): { seq: number; correct: boolean; answers: string[]; penaltyMs: number; remainingMs: number } | null {
    const now = this.clock.now();
    return p.feedback && now < p.readyAt ? { ...p.feedback, remainingMs: p.readyAt - now } : null;
  }
}

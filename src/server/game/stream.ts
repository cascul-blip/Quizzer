import { checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { QuestionError, StreamQuestionView } from "../../shared/mode-views.ts";
import { shuffle, shuffleOptions, topErrors, type Clock } from "./common.ts";

/** How long the ✓/✗ flash shows before the next question can be answered. */
export const FEEDBACK_MS = 1000;
/** Extra time the ✗ stays up after a 2nd wrong answer in a row, and after a 3rd or later one. */
const WRONG_PENALTY_2_MS = 3000;
const WRONG_PENALTY_3_MS = 4000;

/** How much longer the ✗ shows for a wrong answer that is the streak-th in a row. */
function wrongPenaltyMs(streak: number): number {
  return streak >= 3 ? WRONG_PENALTY_3_MS : streak === 2 ? WRONG_PENALTY_2_MS : 0;
}

interface CurrentQuestion {
  seq: number;
  qIndex: number;
  options: string[];
  correct: number[];
}

/** Read-only answer totals used by game modes for scoring and results. */
export interface AnswerTotals {
  readonly correct: number;
  readonly wrong: number;
}

interface QuestionState {
  correct: number;
  wrong: number;
  wrongStreak: number;
  deck: number[];
  current: CurrentQuestion | null;
  feedback: { seq: number; correct: boolean; answers: string[]; penaltyMs: number } | null;
  readyAt: number;
}

/** Deals each player their own shuffled, repeating deck of questions and scores their answers. */
export class QuestionStream {
  /** Wrong answers given to each question, by everyone, over the whole game. */
  private readonly wrongCounts: number[];
  private readonly states = new WeakMap<AnswerTotals, QuestionState>();

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

  /** Register a new player and add live, read-only answer totals to the same object. */
  registerPlayer<P extends object>(player: P): P & AnswerTotals {
    const state: QuestionState = { correct: 0, wrong: 0, wrongStreak: 0, deck: [], current: null, feedback: null, readyAt: 0 };
    const registered = Object.defineProperties(player, {
      correct: { enumerable: true, get: () => state.correct },
      wrong: { enumerable: true, get: () => state.wrong },
    }) as P & AnswerTotals;
    this.states.set(registered, state);
    return registered;
  }

  private state(player: AnswerTotals): QuestionState {
    const state = this.states.get(player);
    if (!state) throw new Error("Player belongs to a different question stream");
    return state;
  }

  /** Give a player their first question, preserving a question already dealt. */
  open(player: AnswerTotals): void {
    const state = this.state(player);
    if (!state.current) this.deal(state);
  }

  /** When the feedback flash ends, including any Protect from abuse wait. */
  feedbackEndsAt(player: AnswerTotals): number {
    return this.state(player).readyAt;
  }

  /** Resume questions after a mode activity, keeping any feedback wait still in progress. */
  resume(player: AnswerTotals, now = this.clock.now()): void {
    const state = this.state(player);
    state.readyAt = Math.max(state.readyAt, now);
  }

  /** Deal from a personal shuffled deck, reshuffling when used up. */
  private deal(state: QuestionState): void {
    const last = state.current?.qIndex;
    if (state.deck.length === 0) {
      state.deck = shuffle(this.questions.map((_, i) => i), this.rng);
      // Don't repeat the question just answered across a reshuffle.
      if (state.deck.length > 1 && state.deck[0] === last) state.deck.push(state.deck.shift()!);
    }
    const qIndex = state.deck.shift()!;
    const q = this.questions[qIndex]!;
    const shown = this.shuffleAnswers ? shuffleOptions(q, this.rng) : q;
    state.current = { seq: (state.current?.seq ?? 0) + 1, qIndex, options: [...shown.options], correct: [...shown.correct] };
  }

  /**
   * Score an answer to the current question and deal the next one.
   * Returns whether it was correct, or null if the answer was rejected
   * (stale seq, still in the feedback flash, or an invalid option).
   */
  answer(player: AnswerTotals, seq: number, answer: AnswerValue): boolean | null {
    const state = this.state(player);
    const cur = state.current;
    if (!cur || seq !== cur.seq || this.clock.now() < state.readyAt) return null;
    const correct = checkAnswer({ type: this.questions[cur.qIndex]!.type, options: cur.options, correct: cur.correct }, answer);
    if (correct === null) return null;
    if (correct) {
      state.correct++;
      state.wrongStreak = 0;
    } else {
      state.wrong++;
      state.wrongStreak++;
      this.wrongCounts[cur.qIndex]!++;
    }
    const penaltyMs = this.penalizeGuessing ? wrongPenaltyMs(state.wrongStreak) : 0;
    state.feedback = { seq, correct, answers: correct ? [] : cur.correct.map((i) => cur.options[i]!), penaltyMs };
    state.readyAt = this.clock.now() + FEEDBACK_MS + penaltyMs;
    this.deal(state);
    return correct;
  }

  /** The most-missed questions, for the final screen. */
  errors(): QuestionError[] {
    return topErrors(this.questions, this.wrongCounts);
  }

  questionView(player: AnswerTotals): StreamQuestionView | null {
    const state = this.state(player);
    if (!state.current) return null;
    const q = this.questions[state.current.qIndex]!;
    return {
      seq: state.current.seq,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      options: q.type === "text" ? [] : [...state.current.options],
      ...(q.spots ? { spots: q.spots } : {}),
    };
  }

  feedbackView(player: AnswerTotals): { seq: number; correct: boolean; answers: string[]; penaltyMs: number; remainingMs: number } | null {
    const state = this.state(player);
    const now = this.clock.now();
    return state.feedback && now < state.readyAt ? { ...state.feedback, answers: [...state.feedback.answers], remainingMs: state.readyAt - now } : null;
  }
}

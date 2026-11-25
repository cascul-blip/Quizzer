import type { AnswerValue } from "../../shared/answer-match.ts";
import { checkAnswer } from "../../shared/answer-match.ts";
import type { AfterAnswerWaitView, QuestionError, StreamFeedbackView, StreamQuestionView } from "../../shared/mode-views.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { shuffle, shuffleOptions, topErrors } from "./common.ts";

/** How long the ✓/✗ flash shows before the next question can be answered. */
export const FEEDBACK_MS = 1000;
/** Extra time the ✗ stays up after a 2nd wrong answer in a row, and after a 3rd or later one. */
const WRONG_PENALTY_2_MS = 3000;
const WRONG_PENALTY_3_MS = 4000;

/** How much longer the ✗ shows for a wrong answer that is the streak-th in a row. */
function wrongPenaltyMs(streak: number): number {
  return streak >= 3 ? WRONG_PENALTY_3_MS : streak === 2 ? WRONG_PENALTY_2_MS : 0;
}

/** The part of a Streamed question mode's phone view that the stream builds. */
export interface StreamFragment {
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
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
  feedback: { seq: number; correct: boolean; answers: string[]; penaltyDurationMs: number } | null;
  readyAt: number;
}

export interface StreamRules<P> {
  /** Whether the mode lets this player answer right now. Outside it the phone shows no question and no feedback. */
  canAnswer: (player: P) => boolean;
  /** Hold the ✗ longer for wrong answers in a row (the lobby's "Protect from abuse"). */
  penalizeGuessing?: boolean;
}

/**
 * Deals each player their own shuffled, repeating deck of questions and scores their answers.
 * The mode gives its "can answer now" check once; the stream uses it both to build the phone's
 * question and feedback and to refuse answers.
 */
export class QuestionStream<P extends AnswerTotals = AnswerTotals> {
  /** Wrong answers given to each question, by everyone, over the whole game. */
  private readonly wrongCounts: number[];
  private readonly states = new WeakMap<AnswerTotals, QuestionState>();

  constructor(
    private readonly questions: Question[],
    private readonly shuffleAnswers: boolean,
    private readonly rng: () => number,
    private readonly clock: Clock,
    private readonly rules: StreamRules<P>,
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

  open(player: AnswerTotals): void {
    const state = this.state(player);
    if (!state.current) this.deal(state);
  }

  /**
   * The question and answer feedback a Streamed question mode puts in a phone view: both show
   * only while the player can answer. The errors are on the host's view: see `errorsWhen`.
   */
  fragment(player: P): StreamFragment {
    return this.rules.canAnswer(player) ? { question: this.questionView(player), feedback: this.feedbackView(player) } : { question: null, feedback: null };
  }

  /** Open a question for a player who joined mid-game, when the mode is in play. */
  openOnJoin(player: AnswerTotals, inPlay: boolean): void {
    if (inPlay) this.open(player);
  }

  /** The most-missed questions once the game has finished, else null. */
  errorsWhen(finished: boolean): QuestionError[] | null {
    return finished ? this.errors() : null;
  }

  /** When the feedback flash ends, including any Protect from abuse wait. */
  feedbackEndsAt(player: AnswerTotals): number {
    return this.state(player).readyAt;
  }

  /** The wait still in force after an answer, even if the mode is hiding feedback. */
  afterAnswerWaitView(player: AnswerTotals): AfterAnswerWaitView {
    const state = this.state(player);
    return { activityKey: state.feedback?.seq ?? 0, remainingMs: Math.max(0, state.readyAt - this.clock.now()) };
  }

  /** Resume questions after a mode activity, keeping any feedback wait still in progress. */
  resume(player: AnswerTotals, now = this.clock.now()): void {
    const state = this.state(player);
    state.readyAt = Math.max(state.readyAt, now);
  }

  private deal(state: QuestionState): void {
    const last = state.current?.qIndex;
    if (state.deck.length === 0) {
      state.deck = shuffle(
        this.questions.map((_, i) => i),
        this.rng,
      );
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
   * (the player can't answer now, stale seq, still in the feedback flash, or an invalid option).
   */
  answer(player: P, seq: number, answer: AnswerValue): boolean | null {
    if (!this.rules.canAnswer(player)) return null;
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
    const penaltyDurationMs = this.rules.penalizeGuessing ? wrongPenaltyMs(state.wrongStreak) : 0;
    state.feedback = { seq, correct, answers: correct ? [] : cur.correct.map((i) => cur.options[i]!), penaltyDurationMs };
    state.readyAt = this.clock.now() + FEEDBACK_MS + penaltyDurationMs;
    this.deal(state);
    return correct;
  }

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

  feedbackView(player: AnswerTotals): StreamFeedbackView | null {
    const state = this.state(player);
    const now = this.clock.now();
    return state.feedback && now < state.readyAt ? { ...state.feedback, answers: [...state.feedback.answers], remainingMs: state.readyAt - now } : null;
  }
}

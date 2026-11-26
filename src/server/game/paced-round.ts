import type { AnswerValue } from "../../shared/answer-match.ts";
import { checkAnswer, MAX_TYPED_ANSWER } from "../../shared/answer-match.ts";
import type { Pacing, QuestionView } from "../../shared/mode-views.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { AUTO_REVEAL_MS, GRACE_MS } from "./common.ts";
import { PhaseTimer } from "./phase-timer.ts";

export const INTRO_MS = 3000;
const TYPED_ANSWER_OPTION = -1;
const BEFORE_FIRST_QUESTION = -1;

export type PacedPhase = "intro" | "open" | "reveal";

export interface PacedAnswer {
  option: number;
  text?: string;
  correct: boolean;
  msSinceOpen: number;
}

export interface PacedAnswerer<A> {
  connected: boolean;
  answers: (A | undefined)[];
}

interface PacedRoundOptions<Extra extends string> {
  asked: () => Iterable<PacedAnswerer<unknown>>;
  initial: PacedPhase | Extra;
  pacing: Pacing;
  /** why: read each time, as Classic reshuffles it when the game starts. */
  questions: () => readonly Question[];
  opensFrom?: readonly Extra[];
  afterReveal?: readonly Extra[];
  hideAutoCountdown?: boolean;
  settle: () => void;
  advance: () => void;
  onChange: () => void;
}

export class PacedRound<Extra extends string = never> {
  readonly phases: PhaseTimer<PacedPhase | Extra>;
  qIndex = BEFORE_FIRST_QUESTION;
  pacing: Pacing;
  openedAt = 0;

  constructor(
    private readonly clock: Clock,
    private readonly opts: PacedRoundOptions<Extra>,
  ) {
    this.phases = new PhaseTimer<PacedPhase | Extra>(clock, opts.initial);
    this.pacing = opts.pacing;
  }

  get phase(): PacedPhase | Extra {
    return this.phases.phase;
  }

  get currentQuestion(): Question | null {
    return this.opts.questions()[this.qIndex] ?? null;
  }

  intro(index: number): void {
    this.qIndex = index;
    this.phases.set("intro", INTRO_MS, () => this.open());
    this.opts.onChange();
  }

  begin(index: number): void {
    this.qIndex = index;
  }

  open(): void {
    const q = this.currentQuestion;
    const from = this.phase;
    if (!q || (from !== "intro" && !this.isOneOf(from, this.opts.opensFrom))) return;
    this.openedAt = this.clock.now();
    this.phases.set("open", q.timeLimitSec * 1000, () => this.close(), { graceMs: GRACE_MS });
    this.opts.onChange();
  }

  accepts(qIndex: number): boolean {
    return this.phase === "open" && qIndex === this.qIndex && this.clock.now() <= this.phases.endsAt + GRACE_MS;
  }

  take<A>(player: PacedAnswerer<A> | undefined, qIndex: number, value: AnswerValue, build: (answer: PacedAnswer) => A): A | null {
    const q = this.currentQuestion;
    if (!player || !q || !this.accepts(qIndex) || player.answers[qIndex]) return null;
    const correct = checkAnswer(q, value);
    if (correct === null) return null;
    const choice = typeof value === "string" ? { option: TYPED_ANSWER_OPTION, text: value.slice(0, MAX_TYPED_ANSWER) } : { option: value };
    const answer = build({ ...choice, correct, msSinceOpen: this.elapsedMs() });
    player.answers[qIndex] = answer;
    return answer;
  }

  closeIfAllAnswered(): boolean {
    if (this.phase !== "open") return false;
    const connected = [...this.opts.asked()].filter((p) => p.connected);
    if (connected.length === 0 || !connected.every((p) => p.answers[this.qIndex])) return false;
    this.close();
    return true;
  }

  shownAnswer<A>(player: PacedAnswerer<A>): A | undefined {
    return this.phase === "open" || this.revealed ? player.answers[this.qIndex] : undefined;
  }

  elapsedMs(): number {
    return Math.max(0, this.clock.now() - this.openedAt);
  }

  close(): void {
    if (this.phase !== "open") return;
    this.opts.settle();
    this.phases.enter("reveal");
    this.scheduleAuto();
    this.opts.onChange();
  }

  next(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
    else if (this.phase === "reveal") this.moveOn();
  }

  skip(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
  }

  /** why: the session broadcasts the pacing change after the reveal timer is rescheduled. */
  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal") {
      this.phases.cancelPhase();
      this.scheduleAuto();
    }
  }

  scheduleAuto(): void {
    if (this.phase !== "reveal") return;
    if (this.pacing === "auto") this.phases.set("reveal", AUTO_REVEAL_MS, () => this.moveOn(), { hidden: this.opts.hideAutoCountdown });
    else this.phases.enter("reveal");
  }

  private moveOn(): void {
    if (this.phase === "reveal") this.opts.advance();
  }

  get revealed(): boolean {
    const phase = this.phase;
    return phase === "reveal" || this.isOneOf(phase, this.opts.afterReveal);
  }

  private isOneOf(phase: PacedPhase | Extra, phases: readonly Extra[] | undefined): boolean {
    return !!phases?.some((p) => p === phase);
  }

  view(): QuestionView | null {
    const q = this.currentQuestion;
    if (!q) return null;
    const phase = this.phase;
    const beforeOpen = phase === "intro" || this.isOneOf(phase, this.opts.opensFrom);
    const hidesAcceptedAnswers = q.type === "text" && !this.revealed;
    return {
      index: this.qIndex,
      total: this.opts.questions().length,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      timeLimitSec: q.timeLimitSec,
      options: beforeOpen || hidesAcceptedAnswers ? [] : q.options,
      ...(q.spots && !beforeOpen ? { spots: q.spots } : {}),
      remainingMs: this.revealed ? 0 : this.phases.remainingMs(),
    };
  }
}

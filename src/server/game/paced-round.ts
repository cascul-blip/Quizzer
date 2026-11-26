import type { AnswerValue } from "../../shared/answer-match.ts";
import { checkAnswer, MAX_TYPED_ANSWER } from "../../shared/answer-match.ts";
import type { Pacing, QuestionView } from "../../shared/mode-views.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { AUTO_REVEAL_MS, GRACE_MS } from "./common.ts";
import { PhaseTimer } from "./phase-timer.ts";

export const INTRO_MS = 3000;

/** why: a mode adds its own phases (a lobby, a confidence step, a leaderboard, a podium). */
export type PacedPhase = "intro" | "open" | "reveal";

export interface PacedAnswer {
  /** why: -1 for a typed answer. */
  option: number;
  /** why: cut to MAX_TYPED_ANSWER. */
  text?: string;
  correct: boolean;
  msSinceOpen: number;
}

export interface PacedAnswerer<A> {
  connected: boolean;
  answers: (A | undefined)[];
}

interface PacedRoundOptions<Extra extends string> {
  /** why: read each time; Showdown asks only the duelists in arenas. */
  asked: () => Iterable<PacedAnswerer<unknown>>;
  /** why: "intro" for a mode that starts at once, "lobby" for Classic. */
  initial: PacedPhase | Extra;
  pacing: Pacing;
  /** why: read each time, as Classic reshuffles it when the game starts. */
  questions: () => readonly Question[];
  /** why: these show no options, like the intro (e.g. Racer's confidence step). */
  opensFrom?: readonly Extra[];
  /** why: e.g. Classic's leaderboard still shows answers after the reveal. */
  afterReveal?: readonly Extra[];
  /** why: Classic hides the countdown; Racer and Showdown show it. */
  hideAutoCountdown?: boolean;
  /** why: the round moves to the reveal after this returns. */
  settle: () => void;
  /** why: called by the host's next or by auto pacing. */
  advance: () => void;
  onChange: () => void;
}

/** why: modes compose this round and add behavior through hooks and their own `phases`. */
export class PacedRound<Extra extends string = never> {
  readonly phases: PhaseTimer<PacedPhase | Extra>;
  /** why: -1 before the first question. */
  qIndex = -1;
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

  /** why: the mode runs a phase of its own before opening it. */
  begin(index: number): void {
    this.qIndex = index;
  }

  /** why: answers are taken until the deadline plus grace. */
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

  /** why: returns null when refused; the mode then calls closeIfAllAnswered. */
  take<A>(player: PacedAnswerer<A> | undefined, qIndex: number, value: AnswerValue, build: (answer: PacedAnswer) => A): A | null {
    const q = this.currentQuestion;
    if (!player || !q || !this.accepts(qIndex) || player.answers[qIndex]) return null;
    const correct = checkAnswer(q, value);
    if (correct === null) return null;
    const choice = typeof value === "string" ? { option: -1, text: value.slice(0, MAX_TYPED_ANSWER) } : { option: value };
    const answer = build({ ...choice, correct, msSinceOpen: this.elapsedMs() });
    player.answers[qIndex] = answer;
    return answer;
  }

  /** why: closes early only once every connected player asked has answered. */
  closeIfAllAnswered(): boolean {
    if (this.phase !== "open") return false;
    const connected = [...this.opts.asked()].filter((p) => p.connected);
    if (connected.length === 0 || !connected.every((p) => p.answers[this.qIndex])) return false;
    this.close();
    return true;
  }

  /** why: undefined unless the question is open or revealed. */
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

  /** why: a phase of the mode's own is its to handle. */
  next(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
    else if (this.phase === "reveal") this.moveOn();
  }

  skip(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
  }

  /** why: a reveal already waiting is rescheduled; the mode reports the change itself. */
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

  /** why: shown from the reveal on, until the next question. */
  get revealed(): boolean {
    const phase = this.phase;
    return phase === "reveal" || this.isOneOf(phase, this.opts.afterReveal);
  }

  private isOneOf(phase: PacedPhase | Extra, phases: readonly Extra[] | undefined): boolean {
    return !!phases?.some((p) => p === phase);
  }

  /** why: no options before it opens, no typed-answer key until the reveal. */
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

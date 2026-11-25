import type { AnswerValue } from "../../shared/answer-match.ts";
import { checkAnswer, MAX_TYPED_ANSWER } from "../../shared/answer-match.ts";
import type { Pacing, QuestionView } from "../../shared/mode-views.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { AUTO_REVEAL_MS, GRACE_MS } from "./common.ts";
import { PhaseTimer } from "./phase-timer.ts";

/** How long a paced question shows before its options. */
export const INTRO_MS = 3000;

/** The phases every paced mode shares; a mode adds its own (a lobby, a confidence step, a leaderboard, a podium). */
export type PacedPhase = "intro" | "open" | "reveal";

/** What the Paced question round records for an accepted answer; a mode may add its own fields. */
export interface PacedAnswer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  /** The typed text, cut to MAX_TYPED_ANSWER. */
  text?: string;
  correct: boolean;
  msSinceOpen: number;
}

/** A player as the round sees them: whether they are connected, and their answers by question index. */
export interface PacedAnswerer<A> {
  connected: boolean;
  answers: (A | undefined)[];
}

interface PacedRoundOptions<Extra extends string> {
  /** The players the open question is asked of (Showdown asks only the duelists in arenas). Read each time. */
  asked: () => Iterable<PacedAnswerer<unknown>>;
  /** The phase before the game starts: "intro" for a mode that starts at once, "lobby" for Classic. */
  initial: PacedPhase | Extra;
  pacing: Pacing;
  /** The play order. Read each time, as Classic reshuffles it when the game starts. */
  questions: () => readonly Question[];
  /** The mode's own phases the question opens from, as Racer's confidence step. They show no options, like the intro. */
  opensFrom?: readonly Extra[];
  /** The mode's own phases that still show the answers after the reveal, as Classic's leaderboard. */
  afterReveal?: readonly Extra[];
  /** Auto-paced reveals run behind the scenes with no countdown in views (Classic), or count down (Racer, Showdown). */
  hideAutoCountdown?: boolean;
  /** Settle the question that just closed: scores, rewards, the mode's own tallies. The round then moves to the reveal. */
  settle: () => void;
  /** Move on from the reveal: the next question, or the end of the game. Called by the host's next or by auto pacing. */
  advance: () => void;
  onChange: () => void;
}

/**
 * The Paced question round that paced modes compose: the question index, the intro → open → reveal
 * cycle with its deadline and grace, auto-reveal, pacing, and the question view. A mode brings what it adds
 * through hooks: how a question settles, what comes after the reveal, and its own phases, which it sets on `phases`.
 */
export class PacedRound<Extra extends string = never> {
  /** The mode's phase timer; a mode sets its own phases on it. */
  readonly phases: PhaseTimer<PacedPhase | Extra>;
  /** Index of the current question in the play order; -1 before the first. */
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

  /** Point at question `index` while the mode runs a phase of its own before opening it. */
  begin(index: number): void {
    this.qIndex = index;
  }

  /** Open the current question from the intro (or a phase of the mode's that it opens from); answers are taken until the deadline plus grace. */
  open(): void {
    const q = this.currentQuestion;
    const from = this.phase;
    if (!q || (from !== "intro" && !this.isOneOf(from, this.opts.opensFrom))) return;
    this.openedAt = this.clock.now();
    this.phases.set("open", q.timeLimitSec * 1000, () => this.close(), { graceMs: GRACE_MS });
    this.opts.onChange();
  }

  /** Whether an answer to question `qIndex` arriving now is in time: the question is open and the deadline plus grace has not passed. */
  accepts(qIndex: number): boolean {
    return this.phase === "open" && qIndex === this.qIndex && this.clock.now() <= this.phases.endsAt + GRACE_MS;
  }

  /**
   * Take a player's answer to question `qIndex`: refused (null) when the question is not open, the deadline plus grace has
   * passed, the player already answered, or the answer does not fit the question. Otherwise it is recorded on the player,
   * with the mode's own fields from `build`, and returned. The mode then calls closeIfAllAnswered.
   */
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

  /** Close the open question early once every connected player asked has answered it. Returns whether it closed. */
  closeIfAllAnswered(): boolean {
    if (this.phase !== "open") return false;
    const connected = [...this.opts.asked()].filter((p) => p.connected);
    if (connected.length === 0 || !connected.every((p) => p.answers[this.qIndex])) return false;
    this.close();
    return true;
  }

  /** A player's answer to the current question as their phone sees it: while it is open and once revealed; undefined otherwise. */
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

  /** Advance from the current phase: intro → open → reveal → what the mode does next. A phase of the mode's own is its to handle. */
  next(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
    else if (this.phase === "reveal") this.moveOn();
  }

  skip(): void {
    if (this.phase === "intro") this.open();
    else if (this.phase === "open") this.close();
  }

  /** Change pacing; a reveal already waiting is rescheduled. The mode reports the change itself. */
  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal") {
      this.phases.cancelPhase();
      this.scheduleAuto();
    }
  }

  /** The reveal waits for the host, or moves on by itself after AUTO_REVEAL_MS with auto pacing. */
  scheduleAuto(): void {
    if (this.phase !== "reveal") return;
    if (this.pacing === "auto") this.phases.set("reveal", AUTO_REVEAL_MS, () => this.moveOn(), { hidden: this.opts.hideAutoCountdown });
    else this.phases.enter("reveal");
  }

  private moveOn(): void {
    if (this.phase === "reveal") this.opts.advance();
  }

  /** Whether the current question's answers are shown: from the reveal on, until the next question. */
  get revealed(): boolean {
    const phase = this.phase;
    return phase === "reveal" || this.isOneOf(phase, this.opts.afterReveal);
  }

  private isOneOf(phase: PacedPhase | Extra, phases: readonly Extra[] | undefined): boolean {
    return !!phases?.some((p) => p === phase);
  }

  /** The question as the host and phones see it: no options before it opens, no typed-answer key until the reveal. Null when there is no current question. */
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

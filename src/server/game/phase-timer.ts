import type { Clock } from "./common.ts";
import { GameError } from "./common.ts";

const NO_COUNTDOWN = 0;

interface PhaseOptions {
  /** why: the continuation waits for late answers after the visible countdown has ended. */
  graceMs?: number;
  hidden?: boolean;
}

export class PhaseTimer<P extends string> {
  private current: P;
  private deadlineMs = NO_COUNTDOWN;
  private countdownDurationMs: number;
  private phaseEnteredAtMs = 0;
  private countdownSetAtMs = 0;
  private pending: unknown = null;
  private readonly slots = new Map<string, { handle: unknown; at: number }>();

  constructor(
    private readonly clock: Clock,
    initial: P,
    initialDurationMs = 0,
  ) {
    this.current = initial;
    this.countdownDurationMs = initialDurationMs;
  }

  get phase(): P {
    return this.current;
  }

  get endsAt(): number {
    return this.deadlineMs;
  }

  get durationMs(): number {
    return this.countdownDurationMs;
  }

  get enteredAtMs(): number {
    return this.phaseEnteredAtMs;
  }

  remainingMs(): number {
    return this.deadlineMs ? Math.max(0, this.deadlineMs - this.clock.now()) : 0;
  }

  progress(): number {
    if (!this.deadlineMs || this.countdownDurationMs <= 0) return 0;
    return Math.min(1, Math.max(0, (this.clock.now() - this.countdownSetAtMs) / this.countdownDurationMs));
  }

  set(phase: P, durationMs: number, then?: () => void, { graceMs = 0, hidden = false }: PhaseOptions = {}): void {
    this.cancelPhase();
    const now = this.clock.now();
    // why: rescheduling a reveal must not restart elapsed-time cues on the projector.
    if (phase !== this.current) this.phaseEnteredAtMs = now;
    this.current = phase;
    this.countdownSetAtMs = now;
    const showsCountdown = durationMs > 0 && !hidden;
    this.countdownDurationMs = showsCountdown ? durationMs : NO_COUNTDOWN;
    this.deadlineMs = showsCountdown ? now + durationMs : NO_COUNTDOWN;
    if (then) {
      this.pending = this.clock.setTimeout(() => {
        this.pending = null;
        then();
      }, durationMs + graceMs);
    }
  }

  enter(phase: P): void {
    this.set(phase, 0);
  }

  cancelPhase(): void {
    if (this.pending !== null) this.clock.clearTimeout(this.pending);
    this.pending = null;
  }

  after(slot: string, ms: number, fn: () => void): void {
    this.cancel(slot);
    const handle = this.clock.setTimeout(() => {
      this.slots.delete(slot);
      fn();
    }, ms);
    this.slots.set(slot, { handle, at: this.clock.now() + ms });
  }

  slotRemainingMs(slot: string): number | null {
    const pending = this.slots.get(slot);
    return pending ? Math.max(0, pending.at - this.clock.now()) : null;
  }

  cancel(slot: string): void {
    const pending = this.slots.get(slot);
    if (!pending) return;
    this.clock.clearTimeout(pending.handle);
    this.slots.delete(slot);
  }

  cancelSlots(): void {
    for (const { handle } of this.slots.values()) this.clock.clearTimeout(handle);
    this.slots.clear();
  }

  dispose(): void {
    this.cancelPhase();
    this.cancelSlots();
  }
}

interface GameFinishSteps<T> {
  cleanup?: () => void;
  podium?: { build: () => T; empty: () => T };
  onFinish: () => void;
  onChange: () => void;
}

export class GameFinish<P extends string, T = never> {
  private done = false;
  private result: { podium: T } | null = null;

  constructor(
    private readonly timer: PhaseTimer<P>,
    private readonly podiumPhase: P,
    private readonly steps: GameFinishSteps<T>,
  ) {}

  get finished(): boolean {
    return this.done;
  }

  get podium(): T {
    if (!this.result) throw new GameError("This game has not finished");
    return this.result.podium;
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    let podiumError: unknown = null;
    try {
      try {
        this.steps.cleanup?.();
      } finally {
        // why: a failed clean-up or podium must not leave the game short of the podium, since later calls do nothing.
        podiumError = this.buildPodium();
        this.timer.dispose();
        this.timer.enter(this.podiumPhase);
      }
      this.steps.onFinish();
    } finally {
      this.steps.onChange();
    }
    if (podiumError) throw podiumError;
  }

  private buildPodium(): unknown {
    const steps = this.steps.podium;
    if (!steps) return null;
    try {
      this.result = { podium: steps.build() };
      return null;
    } catch (e) {
      this.result = { podium: steps.empty() };
      return e;
    }
  }
}

export class GameLengthClock<P extends string> {
  constructor(
    private readonly timer: PhaseTimer<P>,
    private readonly gameFinish: GameFinish<P, unknown>,
  ) {}

  get ended(): boolean {
    return this.gameFinish.finished;
  }

  /** why: a custom atDeadline (Gift Grab plays out its last bonus rounds) must call end(). */
  start(phase: P, ms: number, atDeadline: () => void = () => this.end()): void {
    this.timer.set(phase, ms, atDeadline);
  }

  remainingMs(): number {
    return this.timer.remainingMs();
  }

  end(): void {
    this.gameFinish.finish();
  }
}

import type { Clock } from "./common.ts";
import { GameError } from "./common.ts";

interface PhaseOptions {
  /** why: a late answer is still accepted; views still count down to the deadline. */
  graceMs?: number;
  hidden?: boolean;
}

export class PhaseTimer<P extends string> {
  private current: P;
  private deadline = 0;
  private duration: number;
  private enteredAt = 0;
  private setAt = 0;
  private pending: unknown = null;
  private readonly slots = new Map<string, { handle: unknown; at: number }>();

  constructor(
    private readonly clock: Clock,
    initial: P,
    initialDurationMs = 0,
  ) {
    this.current = initial;
    this.duration = initialDurationMs;
  }

  get phase(): P {
    return this.current;
  }

  /** why: 0 when the phase has no countdown. */
  get endsAt(): number {
    return this.deadline;
  }

  get durationMs(): number {
    return this.duration;
  }

  /** why: setting the same phase again keeps it. */
  get enteredAtMs(): number {
    return this.enteredAt;
  }

  remainingMs(): number {
    return this.deadline ? Math.max(0, this.deadline - this.clock.now()) : 0;
  }

  progress(): number {
    if (!this.deadline || this.duration <= 0) return 0;
    return Math.min(1, Math.max(0, (this.clock.now() - this.setAt) / this.duration));
  }

  /** why: cancels the previous phase's pending continuation. */
  set(phase: P, ms: number, then?: () => void, { graceMs = 0, hidden = false }: PhaseOptions = {}): void {
    this.cancelPhase();
    const now = this.clock.now();
    if (phase !== this.current) this.enteredAt = now;
    this.current = phase;
    this.setAt = now;
    const counted = ms > 0 && !hidden;
    this.duration = counted ? ms : 0;
    this.deadline = counted ? now + ms : 0;
    if (then) {
      this.pending = this.clock.setTimeout(() => {
        this.pending = null;
        then();
      }, ms + graceMs);
    }
  }

  enter(phase: P): void {
    this.set(phase, 0);
  }

  cancelPhase(): void {
    if (this.pending !== null) this.clock.clearTimeout(this.pending);
    this.pending = null;
  }

  /** why: replaces (and so cancels) whatever the slot held. */
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
  /** why: the timers are still cancelled and the podium entered if this throws. */
  cleanup?: () => void;
  podium?: { build: () => T; empty: () => T };
  onFinish: () => void;
  /** why: runs even when an earlier step throws. */
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

  /** why: returns what build threw so finish can rethrow it after the podium is entered. */
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

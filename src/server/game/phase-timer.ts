import type { Clock } from "./common.ts";

/** How a phase's deadline relates to the timer that ends it. */
interface PhaseOptions {
  /** The continuation runs this long after the deadline (a late answer is still accepted); views still count down to the deadline. */
  graceMs?: number;
  /** The timer runs but views show no countdown: the deadline reads as 0. */
  hidden?: boolean;
}

/**
 * The phase a game mode is in and the one timer that ends it, built on the injected Clock.
 * Setting a phase cancels the pending continuation of the previous one, so a stale timer cannot fire.
 * Named slots hold a mode's other timers (a warning before the phase ends, a player's cooldown); a slot
 * that is replaced or cancelled never fires, and dispose() cancels every pending timer.
 */
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
    /** What a view reads as the phase's duration before any phase has been set. */
    initialDurationMs = 0,
  ) {
    this.current = initial;
    this.duration = initialDurationMs;
  }

  get phase(): P {
    return this.current;
  }

  /** The clock time the phase's countdown ends; 0 when it has none. */
  get endsAt(): number {
    return this.deadline;
  }

  get durationMs(): number {
    return this.duration;
  }

  /** The clock time the current phase was entered; setting the same phase again keeps it. */
  get enteredAtMs(): number {
    return this.enteredAt;
  }

  /** Milliseconds until the phase's countdown ends; 0 when it has none or has ended. */
  remainingMs(): number {
    return this.deadline ? Math.max(0, this.deadline - this.clock.now()) : 0;
  }

  /** The fraction of the phase's duration that has passed, from 0 to 1; 0 when the phase has no countdown. */
  progress(): number {
    if (!this.deadline || this.duration <= 0) return 0;
    return Math.min(1, Math.max(0, (this.clock.now() - this.setAt) / this.duration));
  }

  /**
   * Enter a phase that lasts `ms` and then runs `then`. Cancels the previous phase's pending continuation.
   * With no `ms` or no continuation the phase has no timer.
   */
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

  /** Enter a phase with no timer and no countdown. */
  enter(phase: P): void {
    this.set(phase, 0);
  }

  /** Cancel the pending phase continuation; the phase and its countdown stay as they are. */
  cancelPhase(): void {
    if (this.pending !== null) this.clock.clearTimeout(this.pending);
    this.pending = null;
  }

  /** Run `fn` after `ms` in the named slot, replacing (and so cancelling) whatever the slot held. */
  after(slot: string, ms: number, fn: () => void): void {
    this.cancel(slot);
    const handle = this.clock.setTimeout(() => {
      this.slots.delete(slot);
      fn();
    }, ms);
    this.slots.set(slot, { handle, at: this.clock.now() + ms });
  }

  /** Milliseconds until the named slot fires; null when it holds no pending timer. */
  slotRemainingMs(slot: string): number | null {
    const pending = this.slots.get(slot);
    return pending ? Math.max(0, pending.at - this.clock.now()) : null;
  }

  /** Cancel the named slot's pending timer, if any. */
  cancel(slot: string): void {
    const pending = this.slots.get(slot);
    if (!pending) return;
    this.clock.clearTimeout(pending.handle);
    this.slots.delete(slot);
  }

  /** Cancel every slot's pending timer; the phase timer is left alone. */
  cancelSlots(): void {
    for (const { handle } of this.slots.values()) this.clock.clearTimeout(handle);
    this.slots.clear();
  }

  /** Cancel every pending timer, the phase's and the slots'. */
  dispose(): void {
    this.cancelPhase();
    this.cancelSlots();
  }
}

/**
 * The overall deadline of a minute-limited game mode, on top of a PhaseTimer.
 * `finish` runs exactly once, whether the deadline or an early end gets there first.
 */
export class GameLengthClock<P extends string> {
  private done = false;

  constructor(
    private readonly timer: PhaseTimer<P>,
    private readonly finish: () => void,
  ) {}

  get ended(): boolean {
    return this.done;
  }

  /**
   * Enter the phase the game runs in, for `ms`. At the deadline the game ends, or runs `atDeadline` first
   * when the mode wraps up before finishing (Gift Grab lets the last bonus rounds play out); that must call end().
   */
  start(phase: P, ms: number, atDeadline: () => void = () => this.end()): void {
    this.timer.set(phase, ms, atDeadline);
  }

  /** Milliseconds left until the deadline; 0 when there is none running. */
  remainingMs(): number {
    return this.timer.remainingMs();
  }

  /** Finish the game now. Later calls, and a deadline that comes after, do nothing. */
  end(): void {
    if (this.done) return;
    this.done = true;
    this.timer.cancelPhase();
    this.finish();
  }
}

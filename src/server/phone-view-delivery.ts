import type { PlayerView, ServerMsg } from "../shared/protocol.ts";
import { diffView } from "../shared/view-patch.ts";

/** View fields holding "time left" (relative to when the message arrives). */
const COUNTDOWN_KEYS = new Set([
  "remainingMs",
  "phaseRemainingMs",
  "gameRemainingMs",
  "decisionMs",
  "repairMs",
  "emptyMs",
  "lockedMs",
  "symbolRemainingMs",
  "nextMonsterMs",
  "protectedMs",
  "fuelMs",
]);
/** View fields holding "time since" something started; phones only read them to place the start. */
const ELAPSED_KEYS = new Set(["revealElapsedMs", "elapsedMs"]);

/**
 * A player view as JSON with each running countdown replaced by its deadline, and each running
 * count-up by its start (both to 100 ms), so two snapshots that differ only by time passing compare equal.
 */
export function viewKey(view: PlayerView, now: number): string {
  return JSON.stringify(view, (k, v) => {
    if (typeof v !== "number" || v <= 0) return v;
    if (COUNTDOWN_KEYS.has(k)) return Math.round((now + v) / 100);
    if (ELAPSED_KEYS.has(k)) return Math.round((now - v) / 100);
    return v;
  });
}

interface PhoneSocket {
  getBufferedAmount(): number;
  send(message: string, compress: boolean): number;
}

interface DeliveryState {
  comparisonKey: string | null;
  baseline: unknown;
  waitingForDrain: boolean;
}

/** Keeps each phone's patch baseline and send queue policy at the socket seam. */
export class PhoneViewDelivery {
  private readonly states = new WeakMap<PhoneSocket, DeliveryState>();

  constructor(private readonly now: () => number) {}

  /** Let the next update through while keeping patches based on the last frame sent. */
  requestRefresh(socket: PhoneSocket): void {
    const state = this.states.get(socket);
    if (state) state.comparisonKey = null;
  }

  push(socket: PhoneSocket, readView: () => PlayerView, force: boolean): void {
    let state = this.states.get(socket);
    if (!state) {
      state = { comparisonKey: null, baseline: null, waitingForDrain: false };
      this.states.set(socket, state);
    }
    if (socket.getBufferedAmount() > 0) {
      state.waitingForDrain = true;
      return;
    }

    const view = readView();
    const key = viewKey(view, this.now());
    if (!force && key === state.comparisonKey) return;
    state.comparisonKey = key;

    const full = JSON.stringify({ type: "player.state", view } satisfies ServerMsg);
    const plain: unknown = JSON.parse(full).view;
    let message = full;
    if (state.baseline !== null) {
      const patch = JSON.stringify({ type: "player.patch", ops: diffView(state.baseline, plain) } satisfies ServerMsg);
      if (patch.length < full.length) message = patch;
    }
    state.baseline = plain;
    socket.send(message, true);
  }

  /** Catch up from the current view even if its comparison key is unchanged. */
  onDrain(socket: PhoneSocket, readView: () => PlayerView): void {
    if (this.takePendingDrain(socket)) this.push(socket, readView, true);
  }

  /** Consume a held-back update, including when the socket has since become a projector. */
  takePendingDrain(socket: PhoneSocket): boolean {
    const state = this.states.get(socket);
    if (!state?.waitingForDrain) return false;
    state.waitingForDrain = false;
    return true;
  }
}

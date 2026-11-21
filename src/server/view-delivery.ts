import type { HostView, PlayerView, ServerMsg } from "../shared/protocol.ts";
import { diffView } from "../shared/view-patch.ts";
import type { PhoneAttachments } from "./phone-attachments.ts";

const ACTIVITY_THROTTLE_MS = 100;

type ViewSocket = {
  data: { ip: string; role: "host" | "player" };
  getBufferedAmount(): number;
  send(message: string, compress: boolean): number;
};

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

interface DeliveryState {
  comparisonKey: string | null;
  baseline: unknown;
  waitingForDrain: boolean;
}

/** Delivers current views according to each socket's role. */
export class ViewDelivery<S extends ViewSocket> {
  private readonly states = new WeakMap<S, DeliveryState>();
  private queuedBroadcast: (() => void) | null = null;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sockets: PhoneAttachments<S>,
    private readonly hostView: () => HostView,
    private readonly playerView: (socket: S) => PlayerView,
    private readonly now: () => number,
    private readonly viewBatch: (send: () => void) => void,
  ) {}

  /** Coalesce synchronous changes into one room-wide update. */
  scheduleBroadcast(): void {
    if (this.queuedBroadcast) return;
    const flush = () => {
      if (this.queuedBroadcast !== flush) return;
      this.queuedBroadcast = null;
      this.broadcast();
    };
    this.queuedBroadcast = flush;
    queueMicrotask(flush);
  }

  /** Acknowledge the acting player immediately and share one trailing update across a burst. */
  onActivity(playerId: string): void {
    for (const socket of this.sockets.forPlayer(playerId)) this.refresh(socket);
    this.activityTimer ??= setTimeout(() => {
      this.activityTimer = null;
      this.broadcast();
    }, ACTIVITY_THROTTLE_MS);
  }

  pushHost(): void {
    this.pushViews(false);
  }

  broadcast(): void {
    this.viewBatch(() => this.pushViews(true));
  }

  cancelPending(): void {
    this.queuedBroadcast = null;
    if (this.activityTimer !== null) clearTimeout(this.activityTimer);
    this.activityTimer = null;
  }

  send(socket: S, message: Exclude<ServerMsg, { type: "host.state" | "player.state" | "player.patch" }>): void {
    this.sendOther(socket, JSON.stringify(message));
  }

  becomeHost(socket: S): void {
    socket.data.role = "host";
    this.refresh(socket);
  }

  refresh(socket: S): void {
    if (socket.data.role === "host") this.sendOther(socket, this.hostSnapshot());
    else this.pushPhone(socket, true);
  }

  onDrain(socket: S): void {
    const state = this.states.get(socket);
    if (!state?.waitingForDrain) return;
    state.waitingForDrain = false;
    this.refresh(socket);
  }

  refreshOnNextUpdate(): void {
    for (const socket of this.sockets) this.invalidateComparison(socket);
  }

  private invalidateComparison(socket: S): void {
    const state = this.states.get(socket);
    if (state) state.comparisonKey = null;
  }

  private sendOther(socket: S, message: string): void {
    // Other messages can change the page, so let the next phone update through.
    this.invalidateComparison(socket);
    socket.send(message, socket.data.role === "player");
  }

  private hostSnapshot(): string {
    return JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg);
  }

  private pushViews(includePhones: boolean): void {
    let hostMessage: string | undefined;
    for (const socket of this.sockets) {
      if (socket.data.role === "host") {
        hostMessage ??= this.hostSnapshot();
        this.sendOther(socket, hostMessage);
      } else if (includePhones) {
        this.pushPhone(socket, false);
      }
    }
  }

  private pushPhone(socket: S, force: boolean): void {
    let state = this.states.get(socket);
    if (!state) {
      state = { comparisonKey: null, baseline: null, waitingForDrain: false };
      this.states.set(socket, state);
    }
    if (socket.getBufferedAmount() > 0) {
      state.waitingForDrain = true;
      return;
    }

    const view = this.playerView(socket);
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
}

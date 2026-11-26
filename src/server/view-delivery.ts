import type { HostView, PlayerView, ServerMsg } from "../shared/protocol.ts";
import { diffView } from "../shared/view-patch.ts";
import { isCountdownField, isElapsedField } from "../shared/view-time-fields.ts";
import type { Clock } from "./game/common.ts";
import type { PhoneAttachments } from "./phone-attachments.ts";

const ACTIVITY_THROTTLE_MS = 100;

type ViewSocket = {
  data: { ip: string; role: "host" | "player" };
  getBufferedAmount(): number;
  send(message: string, compress: boolean): number;
};

export function viewKey(view: PlayerView, now: number): string {
  return JSON.stringify(view, (k, v) => {
    if (typeof v !== "number" || v <= 0) return v;
    if (isCountdownField(k)) return Math.round((now + v) / 100);
    if (isElapsedField(k)) return Math.round((now - v) / 100);
    return v;
  });
}

interface DeliveryState {
  comparisonKey: string | null;
  baseline: unknown;
  waitingForDrain: boolean;
}

export class ViewDelivery<S extends ViewSocket> {
  private readonly states = new WeakMap<S, DeliveryState>();
  private queuedBroadcast: (() => void) | null = null;
  private activityTimer: unknown = null;

  constructor(
    private readonly sockets: PhoneAttachments<S>,
    private readonly hostView: () => HostView,
    private readonly playerView: (socket: S) => PlayerView,
    private readonly clock: Clock,
    private readonly viewBatch: (send: () => void) => void,
  ) {}

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

  onActivity(playerId: string): void {
    for (const socket of this.sockets.forPlayer(playerId)) this.refresh(socket);
    this.activityTimer ??= this.clock.setTimeout(() => {
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
    if (this.activityTimer !== null) this.clock.clearTimeout(this.activityTimer);
    this.activityTimer = null;
  }

  send(socket: S, message: Exclude<ServerMsg, { type: "host.state" | "player.state" | "player.patch" }>): void {
    this.sendAndInvalidateComparison(socket, JSON.stringify(message));
  }

  promoteAndSendHostSnapshot(socket: S): void {
    socket.data.role = "host";
    this.refresh(socket);
  }

  refresh(socket: S): void {
    if (socket.data.role === "host") this.sendAndInvalidateComparison(socket, this.hostSnapshot());
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

  private sendAndInvalidateComparison(socket: S, message: string): void {
    // why: a control message can change the phone screen even when its next view compares equal.
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
        this.sendAndInvalidateComparison(socket, hostMessage);
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
    const key = viewKey(view, this.clock.now());
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

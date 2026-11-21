import type { HostView, ServerMsg } from "../shared/protocol.ts";
import type { PhoneAttachments } from "./phone-attachments.ts";

const ACTIVITY_THROTTLE_MS = 100;

type ViewSocket = {
  data: { ip: string; role: "host" | "player" };
  send(message: string): number;
};

/** Schedules updates and chooses which sockets receive each push. */
export class ViewUpdateScheduler<S extends ViewSocket> {
  private queuedBroadcast: (() => void) | null = null;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sockets: PhoneAttachments<S>,
    private readonly hostView: () => HostView,
    private readonly sendState: (socket: S, force: boolean) => void,
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
    for (const socket of this.sockets.forPlayer(playerId)) this.sendState(socket, true);
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

  private pushViews(includePhones: boolean): void {
    let hostMessage: string | undefined;
    for (const socket of this.sockets) {
      if (socket.data.role === "host") {
        hostMessage ??= JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg);
        socket.send(hostMessage);
      } else if (includePhones) {
        this.sendState(socket, false);
      }
    }
  }
}

import type { GameHub, SocketData } from "../src/server/ws.ts";
import { GameHub as Hub } from "../src/server/ws.ts";
import type { QuizStore } from "../src/server/quiz/store.ts";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { applyPatch } from "../src/shared/view-patch.ts";
import type { FakeClock } from "./helpers.ts";

type HostState = Extract<ServerMsg, { type: "host.state" }>;
type PlayerState = Extract<ServerMsg, { type: "player.state" }>;

/** One message as type, view kind and phase ("host.state tower/podium"), so a timeout reads in a line. */
function summary(m: ServerMsg): string {
  if (m.type !== "host.state" && m.type !== "player.state") return m.type === "error" ? `error "${m.message}"` : m.type;
  const v: { kind: string; phase?: string } = m.view;
  return `${m.type} ${v.kind}${v.phase ? `/${v.phase}` : ""}`;
}

/** Messages a phone or projector received, read the way the client reads them. Shared by real and fake sockets. */
export abstract class MessageLog {
  msgs: ServerMsg[] = [];
  /** Raw messages as received, before patches are turned back into player.state. */
  raw: ServerMsg[] = [];
  /** The player's view as the phone holds it, built from snapshots and patches. */
  view: PlayerView | null = null;
  token: string | null = null;
  private waiters: (() => void)[] = [];
  protected constructor(private readonly waitMs: number) {}

  protected receive(msg: ServerMsg) {
    this.raw.push(msg);
    if (msg.type === "player.state") this.view = msg.view;
    if (msg.type === "joined") this.token = msg.token;
    // Tests read whole views, as the phone ends up with them.
    if (msg.type === "player.patch") this.view = applyPatch(this.view!, msg.ops);
    this.msgs.push(msg.type === "player.patch" ? { type: "player.state", view: this.view! } : msg);
    this.waiters.splice(0).forEach((w) => w());
  }

  /** Wait for (and consume up to) the first queued or future message matching the predicate. */
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeout?: number): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout?: number): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout = this.waitMs): Promise<ServerMsg> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const i = this.msgs.findIndex(pred);
      if (i >= 0) return this.msgs.splice(0, i + 1).pop()!;
      if (Date.now() > deadline) throw new Error(`timeout; last got ${this.msgs.slice(-3).map(summary).join(", ") || "nothing"}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  hostState(pred: (v: HostView) => boolean) {
    return this.waitFor((m): m is HostState => m.type === "host.state" && pred(m.view));
  }
  playerState(pred: (v: PlayerView) => boolean) {
    return this.waitFor((m): m is PlayerState => m.type === "player.state" && pred(m.view));
  }
  abstract sendMsg(m: ClientMsg): void;
  abstract close(): void;
}

/** A phone or projector talking to a GameHub without a real socket. Pass admin: true for the host computer. */
export class HubSocket extends MessageLog {
  closed = false;
  bufferedAmount = 0;
  readonly data: SocketData;
  constructor(
    readonly hub: GameHub,
    data: Partial<SocketData> = {},
  ) {
    // Fake sockets answer as fast as the hub does; only the activity throttle (a real timer) waits.
    super(2_000);
    this.data = { admin: false, ip: "127.0.0.1", role: "player", ...data };
    hub.onOpen(this);
  }
  /** Called by the hub. */
  send(text: string) {
    if (this.closed) return 0;
    this.receive(JSON.parse(text));
    return text.length;
  }
  getBufferedAmount() {
    return this.bufferedAmount;
  }
  /** Sends a message from this phone or projector to the hub. */
  sendMsg(m: ClientMsg) {
    if (!this.closed) this.hub.onMessage(this, JSON.stringify(m));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.hub.onClose(this);
  }
}

/** A hub on a fake port, as the server would run it. */
export function fakeHub(store: QuizStore, clock: FakeClock, port = 4321) {
  const hub = new Hub(store, { address: "127.0.0.1", discoverAddresses: () => [], clock });
  hub.join.port = port;
  return hub;
}

/** Waits until the hub's activity throttle (100 ms) has flushed its pending phone updates. */
export const pastThrottle = () => new Promise((r) => setTimeout(r, 200));

/** Timer fields (countdowns, cooldowns, lock-outs) are left out: a snapshot where only time passed isn't sent, so the phone's can be older. */
export const withoutTimers = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (k, x) => (/(remaining|decision|repair|locked|empty)Ms$/i.test(k) ? undefined : x)));

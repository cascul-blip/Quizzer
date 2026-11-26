import type { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub, SocketData } from "../src/server/ws.ts";
import { GameHub as Hub } from "../src/server/ws.ts";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { applyPatch } from "../src/shared/view-patch.ts";
import type { FakeClock } from "./helpers.ts";

type HostState = Extract<ServerMsg, { type: "host.state" }>;
type PlayerState = Extract<ServerMsg, { type: "player.state" }>;

/** why: one line per message ("host.state tower/podium") keeps a timeout readable. */
function summary(m: ServerMsg): string {
  if (m.type !== "host.state" && m.type !== "player.state") return m.type === "error" ? `error "${m.message}"` : m.type;
  const v: { kind: string; phase?: string } = m.view;
  return `${m.type} ${v.kind}${v.phase ? `/${v.phase}` : ""}`;
}

/** why: read the way the client reads them; shared by real and fake sockets. */
export abstract class MessageLog {
  msgs: ServerMsg[] = [];
  /** why: kept before patches are turned back into player.state. */
  raw: ServerMsg[] = [];
  view: PlayerView | null = null;
  token: string | null = null;
  private waiters: (() => void)[] = [];
  protected constructor(private readonly waitMs: number) {}

  protected receive(msg: ServerMsg) {
    this.raw.push(msg);
    if (msg.type === "player.state") this.view = msg.view;
    if (msg.type === "joined") this.token = msg.token;
    // why: tests read whole views, as the phone ends up with them.
    if (msg.type === "player.patch") this.view = applyPatch(this.view!, msg.ops);
    this.msgs.push(msg.type === "player.patch" ? { type: "player.state", view: this.view! } : msg);
    this.waiters.splice(0).forEach((w) => w());
  }

  /** why: consumes up to the match, so later waits see only newer messages. */
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeout?: number): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout?: number): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout = this.waitMs): Promise<ServerMsg> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const i = this.msgs.findIndex(pred);
      if (i >= 0) return this.msgs.splice(0, i + 1).pop()!;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout; last got ${this.msgs.slice(-3).map(summary).join(", ") || "nothing"}`);
      // why: wakes once at the deadline too, to report the timeout.
      await new Promise<void>((r) => {
        const timer = setTimeout(r, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          r();
        });
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

/** why: drives a GameHub without a real socket; admin: true acts as the host computer. */
export class HubSocket extends MessageLog {
  closed = false;
  bufferedAmount = 0;
  compression: boolean[] = [];
  readonly data: SocketData;
  constructor(
    readonly hub: GameHub,
    data: Partial<SocketData> = {},
  ) {
    // why: fake sockets answer as fast as the hub does.
    super(2_000);
    this.data = { admin: false, ip: "127.0.0.1", role: "player", ...data };
    hub.onOpen(this);
  }
  send(text: string, compress = false) {
    if (this.closed) return 0;
    this.compression.push(compress);
    this.receive(JSON.parse(text));
    return text.length;
  }
  getBufferedAmount() {
    return this.bufferedAmount;
  }
  sendMsg(m: ClientMsg) {
    if (!this.closed) this.hub.onMessage(this, JSON.stringify(m));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.hub.onClose(this);
  }
}

export function fakeHub(store: QuizStore, clock: FakeClock, port = 4321, rng?: () => number) {
  const hub = new Hub(store, { address: "127.0.0.1", discoverAddresses: () => [], clock, rng });
  hub.join.port = port;
  return hub;
}

/** why: passing the hub's 100 ms activity throttle sends its pending room-wide update. */
export const pastThrottle = (clock: FakeClock) => clock.advance(100);

/** why: a snapshot where only time passed isn't sent, so the phone's timer fields can be older. */
export const withoutTimers = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (k, x) => (/(remaining|decision|repair|locked|empty)Ms$/i.test(k) ? undefined : x)));

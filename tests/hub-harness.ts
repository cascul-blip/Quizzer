import { GameHub, type SocketData } from "../src/server/ws.ts";
import type { QuizStore } from "../src/server/quiz/store.ts";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { applyPatch } from "../src/shared/view-patch.ts";
import type { FakeClock } from "./helpers.ts";

// Fake sockets answer as fast as the hub does; only the activity throttle (a real 100 ms timer) waits.
const WAIT_MS = 2_000;

/** A phone or projector talking to a GameHub without a real socket, read the way the real one is. */
export class HubSocket {
  msgs: ServerMsg[] = [];
  /** Raw messages as sent, before patches are turned back into player.state. */
  raw: ServerMsg[] = [];
  /** The player's view as the phone holds it, built from snapshots and patches. */
  view: PlayerView | null = null;
  token: string | null = null;
  closed = false;
  readonly data: SocketData;
  constructor(readonly hub: GameHub, data: Partial<SocketData> = {}) {
    this.data = { admin: true, ip: "127.0.0.1", role: "player", playerId: null, ...data };
    hub.onOpen(this);
  }
  /** Called by the hub. */
  send(text: string) {
    if (this.closed) return 0;
    const msg: ServerMsg = JSON.parse(text);
    this.raw.push(msg);
    if (msg.type === "player.state") this.view = msg.view;
    if (msg.type === "joined") this.token = msg.token;
    if (msg.type === "player.patch") this.view = applyPatch(this.view!, msg.ops);
    this.msgs.push(msg.type === "player.patch" ? { type: "player.state", view: this.view! } : msg);
    return text.length;
  }
  getBufferedAmount() {
    return 0;
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
  /** Wait for (and consume up to) the first queued or future message matching the predicate. */
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeout?: number): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout?: number): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout = WAIT_MS): Promise<ServerMsg> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const i = this.msgs.findIndex(pred);
      if (i >= 0) return this.msgs.splice(0, i + 1).pop()!;
      if (Date.now() > deadline) throw new Error(`timeout; got ${JSON.stringify(this.msgs.slice(-3))}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  hostState(pred: (v: HostView) => boolean) {
    return this.waitFor((m) => m.type === "host.state" && pred(m.view)) as Promise<Extract<ServerMsg, { type: "host.state" }>>;
  }
  playerState(pred: (v: PlayerView) => boolean) {
    return this.waitFor((m) => m.type === "player.state" && pred(m.view)) as Promise<Extract<ServerMsg, { type: "player.state" }>>;
  }
}

/** A hub on a fake port, as the server would run it. */
export function fakeHub(store: QuizStore, clock: FakeClock, port = 4321) {
  const hub = new GameHub(store, { address: "127.0.0.1", clock });
  hub.port = port;
  return hub;
}

/** Countdowns are left out: a snapshot where only time passed isn't sent, so the phone's can be older. */
export const withoutCountdowns = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (k, x) => (/(remaining|decision|repair|locked|empty)Ms$/i.test(k) ? undefined : x)));

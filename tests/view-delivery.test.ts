import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PhoneAttachments } from "../src/server/phone-attachments.ts";
import { ViewDelivery } from "../src/server/view-delivery.ts";
import type { ClassicView } from "../src/shared/modes/classic.ts";
import type { HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { FakeClock } from "./helpers.ts";
import { pastThrottle } from "./hub-harness.ts";

class DeliverySocket {
  bufferedAmount = 0;
  frames: { message: ServerMsg; compress: boolean }[] = [];
  readonly data: { ip: string; role: "host" | "player" };

  constructor(role: "host" | "player") {
    this.data = { ip: "127.0.0.1", role };
  }

  getBufferedAmount(): number {
    return this.bufferedAmount;
  }

  send(text: string, compress: boolean): number {
    this.frames.push({ message: JSON.parse(text), compress });
    return text.length;
  }
}

const timedView: ClassicView = {
  kind: "classic",
  phase: "open",
  title: "Countdown",
  me: { id: "ann", nickname: "Ann", avatar: { avatar: "cat", accessory: "none" }, score: 0, rank: 1, streak: 0 },
  playerCount: 1,
  question: { index: 0, total: 1, type: "true_false", text: "Q", timeLimitSec: 1, options: ["True", "False"], remainingMs: 1000 },
  myChoice: null,
  myText: null,
  result: null,
  podium: null,
};

const noGame: PlayerView = { kind: "none", game: null };
const waiting = (title: string): PlayerView => ({ kind: "none", game: { title, phase: "lobby" } });
const phoneFrame = (message: ServerMsg) => ({ message, compress: true });
const fullPhoneFrame = (view: PlayerView) => phoneFrame({ type: "player.state", view });
const emptyPatch = phoneFrame({ type: "player.patch", ops: [] });

function setup() {
  const sockets = new PhoneAttachments<DeliverySocket>(() => {});
  const phoneViews = new Map<DeliverySocket, PlayerView>();
  const clock = new FakeClock();
  const state = { port: 4321, batches: 0, hostReads: 0, phoneReads: 0 };
  const delivery = new ViewDelivery(
    sockets,
    (): HostView => {
      state.hostReads++;
      return {
        kind: "idle",
        phase: "idle",
        join: { url: `http://127.0.0.1:${state.port}/`, address: "127.0.0.1", addresses: [], port: state.port, qrSvg: "" },
      };
    },
    (socket) => {
      state.phoneReads++;
      return phoneViews.get(socket) ?? noGame;
    },
    clock,
    (send) => {
      state.batches++;
      send();
    },
  );
  function open(role: "host" | "player" = "player") {
    const socket = new DeliverySocket(role);
    sockets.open(socket);
    return socket;
  }
  return { delivery, state, sockets, phoneViews, open, clock };
}

describe("View delivery", () => {
  let fixture: ReturnType<typeof setup>;
  beforeEach(() => {
    fixture = setup();
  });
  afterEach(() => fixture.delivery.cancelPending());

  test("shares one uncompressed projector snapshot and batches room-wide updates", () => {
    const { delivery, open, state } = fixture;
    const host = open("host");
    const secondHost = open("host");
    const phone = open();

    delivery.pushHost();
    expect(state).toMatchObject({ batches: 0, hostReads: 1, phoneReads: 0 });
    expect(host.frames).toEqual([
      {
        message: {
          type: "host.state",
          view: { kind: "idle", phase: "idle", join: { url: "http://127.0.0.1:4321/", address: "127.0.0.1", addresses: [], port: 4321, qrSvg: "" } },
        },
        compress: false,
      },
    ]);
    expect(secondHost.frames).toEqual(host.frames);
    expect(phone.frames).toEqual([]);

    delivery.broadcast();
    expect(state).toMatchObject({ batches: 1, hostReads: 2, phoneReads: 1 });
    expect(host.frames).toHaveLength(2);
    expect(secondHost.frames).toEqual(host.frames);
    expect(phone.frames).toEqual([fullPhoneFrame(noGame)]);
  });

  test("coalesces changes and reads the latest view when the queued broadcast runs", async () => {
    const { delivery, open, state, phoneViews } = fixture;
    const phone = open();
    phoneViews.set(phone, waiting("First"));
    delivery.scheduleBroadcast();
    phoneViews.set(phone, waiting("Second"));
    delivery.scheduleBroadcast();
    expect(phone.frames).toEqual([]);
    await Promise.resolve();
    expect(phone.frames).toEqual([fullPhoneFrame(waiting("Second"))]);
    expect(state.batches).toBe(1);
  });

  test("refreshes each attachment immediately and sends one trailing update for a burst", async () => {
    const { delivery, open, state, sockets, phoneViews, clock } = fixture;
    const phone = open();
    const secondAttachment = open();
    const observer = open();
    sockets.attach(phone, "ann");
    sockets.attach(secondAttachment, "ann");
    sockets.attach(observer, "ben");

    delivery.onActivity("ann");
    delivery.onActivity("ann");
    expect(phone.frames).toEqual([fullPhoneFrame(noGame), emptyPatch]);
    expect(secondAttachment.frames).toEqual(phone.frames);
    expect(observer.frames).toEqual([]);
    expect(state.batches).toBe(0);
    phoneViews.set(observer, waiting("After activity"));

    pastThrottle(clock);
    expect(state.batches).toBe(1);
    expect(observer.frames).toEqual([fullPhoneFrame(waiting("After activity"))]);
    expect(phone.frames).toHaveLength(2);
  });

  test("sends the trailing update exactly 100 ms after the first activity of a burst", () => {
    const { delivery, open, state, sockets, clock } = fixture;
    sockets.attach(open(), "ann");
    const observer = open();

    delivery.onActivity("ann");
    clock.advance(60);
    delivery.onActivity("ann");
    clock.advance(39);
    expect(state.batches).toBe(0);
    expect(observer.frames).toEqual([]);

    clock.advance(1);
    expect(state.batches).toBe(1);
    expect(observer.frames).toEqual([fullPhoneFrame(noGame)]);
  });

  test("cancels both pending schedules and can schedule a new broadcast", async () => {
    const { delivery, open, state, clock } = fixture;
    const phone = open();
    delivery.scheduleBroadcast();
    delivery.onActivity("ann");
    delivery.cancelPending();
    pastThrottle(clock);
    expect(phone.frames).toEqual([]);
    expect(state.batches).toBe(0);

    delivery.scheduleBroadcast();
    await Promise.resolve();
    expect(phone.frames).toEqual([fullPhoneFrame(noGame)]);
  });

  test("uses independent baselines and falls back to a full frame when the patch is larger", () => {
    const { delivery, open, phoneViews } = fixture;
    const phone = open();
    const secondPhone = open();
    phoneViews.set(phone, waiting("First"));
    phoneViews.set(secondPhone, waiting("Second"));
    delivery.broadcast();
    expect(phone.frames).toEqual([fullPhoneFrame(waiting("First"))]);
    expect(secondPhone.frames).toEqual([fullPhoneFrame(waiting("Second"))]);

    phoneViews.set(phone, waiting("Second"));
    delivery.broadcast();
    expect(phone.frames[1]).toEqual(phoneFrame({ type: "player.patch", ops: [[["game", "title"], "Second"]] }));
    expect(secondPhone.frames).toHaveLength(1);

    phoneViews.set(phone, timedView);
    delivery.broadcast();
    phoneViews.set(phone, noGame);
    delivery.broadcast();
    expect(phone.frames[3]).toEqual(fullPhoneFrame(noGame));
    delivery.refresh(phone);
    expect(phone.frames[4]).toEqual(emptyPatch);
  });

  test("normalizes countdowns until the deadline changes or the countdown reaches zero", () => {
    const { delivery, open, phoneViews, clock } = fixture;
    const phone = open();
    function update(now: number, remainingMs: number) {
      clock.t = now;
      phoneViews.set(phone, { ...timedView, question: { ...timedView.question!, remainingMs } });
      delivery.broadcast();
    }

    update(0, 1000);
    expect(phone.frames).toEqual([fullPhoneFrame(timedView)]);
    update(200, 800);
    expect(phone.frames).toHaveLength(1);
    update(200, 900);
    expect(phone.frames[1]).toEqual(phoneFrame({ type: "player.patch", ops: [[["question", "remainingMs"], 900]] }));
    update(1100, 0);
    expect(phone.frames[2]).toEqual(phoneFrame({ type: "player.patch", ops: [[["question", "remainingMs"], 0]] }));
  });

  test("forces refreshes and invalidates comparisons without losing patch baselines", () => {
    const { delivery, open } = fixture;
    const phone = open();
    const secondPhone = open();
    delivery.broadcast();
    delivery.refresh(phone);
    expect(phone.frames).toEqual([fullPhoneFrame(noGame), emptyPatch]);
    expect(secondPhone.frames).toEqual([fullPhoneFrame(noGame)]);

    const error: ServerMsg = { type: "error", message: "Try again" };
    delivery.send(phone, error);
    delivery.broadcast();
    expect(phone.frames.slice(2)).toEqual([phoneFrame(error), emptyPatch]);
    expect(secondPhone.frames).toHaveLength(1);

    delivery.refreshOnNextUpdate();
    delivery.broadcast();
    expect(phone.frames[4]).toEqual(emptyPatch);
    expect(secondPhone.frames[1]).toEqual(emptyPatch);
    delivery.broadcast();
    expect(phone.frames).toHaveLength(5);
    expect(secondPhone.frames).toHaveLength(2);
  });

  test("catches up to the latest phone view and consumes each pending drain once", () => {
    const { delivery, open, state, phoneViews } = fixture;
    const phone = open();
    delivery.refresh(phone);
    phone.bufferedAmount = 4096;
    phoneViews.set(phone, waiting("First"));
    delivery.broadcast();
    phoneViews.set(phone, waiting("Latest"));
    delivery.onDrain(phone);
    expect(state.phoneReads).toBe(1);
    expect(phone.frames).toEqual([fullPhoneFrame(noGame)]);

    phone.bufferedAmount = 0;
    delivery.onDrain(phone);
    delivery.onDrain(phone);
    expect(phone.frames).toEqual([fullPhoneFrame(noGame), phoneFrame({ type: "player.patch", ops: [[["game"], { title: "Latest", phase: "lobby" }]] })]);

    phone.bufferedAmount = 4096;
    delivery.broadcast();
    phone.bufferedAmount = 0;
    delivery.onDrain(phone);
    expect(phone.frames[2]).toEqual(emptyPatch);
  });

  test("promotes a buffered phone and delivers its pending drain using the projector role", () => {
    const { delivery, open, state } = fixture;
    const socket = open();
    socket.bufferedAmount = 4096;
    delivery.refresh(socket);
    expect(socket.frames).toEqual([]);

    delivery.promoteAndSendHostSnapshot(socket);
    expect(socket.data.role).toBe("host");
    expect(socket.frames[0]).toMatchObject({ message: { type: "host.state", view: { join: { port: 4321 } } }, compress: false });

    state.port = 4322;
    socket.bufferedAmount = 0;
    delivery.onDrain(socket);
    delivery.onDrain(socket);
    expect(socket.frames[1]).toMatchObject({ message: { type: "host.state", view: { join: { port: 4322 } } }, compress: false });
    expect(socket.frames).toHaveLength(2);
    expect(state.phoneReads).toBe(0);
  });
});

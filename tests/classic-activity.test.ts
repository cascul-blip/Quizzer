import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/classic.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { OFFERED_AVATARS } from "../src/shared/avatars.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket, pastThrottle } from "./hub-harness.ts";

describe("View update scheduling", () => {
  let t: ReturnType<typeof tempDir>;
  let hub: ReturnType<typeof fakeHub>;
  let host: HubSocket;
  let phones: HubSocket[];

  beforeEach(async () => {
    t = tempDir();
    const store = new QuizStore(t.dir);
    const quiz = await store.create({ title: "Classic", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const clock = new FakeClock();
    hub = fakeHub(store, clock);
    host = new HubSocket(hub, { admin: true, role: "host" });
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    phones = ["Ann", "Ben", "Cat"].map((nickname, i) => {
      const phone = new HubSocket(hub);
      phone.sendMsg({ type: "join", nickname, avatar: OFFERED_AVATARS[i]!.id, accessory: "none" });
      return phone;
    });
    host.sendMsg({ type: "host.start", pacing: "manual" });
    clock.advance(INTRO_MS);
    // Let the initial broadcast and asynchronous join QR refresh settle.
    await host.hostState((v) => v.kind === "classic" && v.phase === "open" && !!v.join.qrSvg);
    for (const socket of [host, ...phones]) socket.raw = [];
  });

  afterEach(() => {
    hub?.closeGame();
    t.cleanup();
  });

  test("updates each answering phone synchronously and the projector on the trailing broadcast", async () => {
    const [ann, ben, cat] = phones;
    ann!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    expect(ann!.raw).toHaveLength(1);
    expect(ben!.raw).toHaveLength(0);

    ben!.sendMsg({ type: "answer", qIndex: 0, option: 1 });
    expect(ben!.raw).toHaveLength(1);
    expect(ann!.raw).toHaveLength(1);
    expect(cat!.raw).toHaveLength(0);

    await Promise.resolve();
    expect(host.raw).toHaveLength(0);
    await pastThrottle();
    expect(host.raw).toEqual([{ type: "host.state", view: expect.objectContaining({ answeredCount: 2 }) }]);
  });

  test("coalesces two synchronous changes into one room-wide broadcast", async () => {
    host.sendMsg({ type: "host.setPacing", pacing: "auto" });
    host.sendMsg({ type: "host.setPacing", pacing: "manual" });
    expect(host.raw).toHaveLength(0);

    await Promise.resolve();

    expect(host.raw).toEqual([{ type: "host.state", view: expect.objectContaining({ pacing: "manual" }) }]);
  });

  test("closing a game cancels both an already queued broadcast and the trailing activity update", async () => {
    phones[0]!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    host.sendMsg({ type: "host.setPacing", pacing: "auto" });
    for (const socket of [host, ...phones]) socket.raw = [];

    hub.closeGame();
    await pastThrottle();

    for (const socket of [host, ...phones]) expect(socket.raw).toEqual([]);

    host.sendMsg({ type: "host.close" });
    await Promise.resolve();

    expect(host.raw).toEqual([{ type: "host.state", view: expect.objectContaining({ kind: "idle" }) }]);
    for (const phone of phones) expect(phone.view).toEqual({ kind: "none", game: null });
  });
});

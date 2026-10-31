import { afterAll, describe, expect, test } from "bun:test";
import { QuizStore } from "../src/server/quiz/store.ts";
import { GameHub, type SocketData } from "../src/server/ws.ts";
import type { ServerMsg } from "../src/shared/protocol.ts";
import { applyPatch, diffView } from "../src/shared/view-patch.ts";
import { FakeClock, tempDir } from "./helpers.ts";

const roundTrip = (a: unknown, b: unknown) => applyPatch(structuredClone(a), diffView(a, b));

describe("diffView / applyPatch", () => {
  test("rebuilds the new view from the old one", () => {
    const cases: [unknown, unknown][] = [
      [{ a: 1, b: "x" }, { a: 2, b: "x" }],
      [{ a: 1, b: { c: [1, 2, 3] } }, { a: 1, b: { c: [1, 9, 3] } }],
      [{ a: 1, gone: true }, { a: 1, added: null }],
      [{ list: [1, 2] }, { list: [1, 2, 3] }],
      [{ list: [{ x: 1 }, { x: 2 }] }, { list: [{ x: 1 }, { x: 3, y: 4 }] }],
      [{ v: null }, { v: { deep: [0] } }],
      [{ v: [1] }, { v: "now a string" }],
      [{ same: { deep: [1, 2] } }, { same: { deep: [1, 2] } }],
    ];
    for (const [a, b] of cases) expect(roundTrip(a, b)).toEqual(b as object);
  });

  test("sends only what changed", () => {
    const terrain = Array.from({ length: 201 }, (_, i) => 300 + i);
    const before = { kind: "fight", question: { text: "A long question", options: ["a", "b", "c", "d"] }, terrain, clock: 5 };
    const crater = terrain.map((h, i) => (i >= 100 && i < 110 ? h + 20 : h));
    const ops = diffView(before, { ...before, terrain: crater, clock: 4 });
    expect(ops).toContainEqual([["clock"], 4]);
    expect(ops).toContainEqual([["terrain", 100], 420]);
    expect(ops).toHaveLength(11);
    expect(JSON.stringify(ops)).not.toContain("A long question");
  });

  test("an array that mostly changed is sent whole", () => {
    expect(diffView({ a: [1, 2, 3] }, { a: [7, 8, 3] })).toEqual([[["a"], [7, 8, 3]]]);
  });

  test("copies along the changed path and shares the rest", () => {
    const view = { question: { text: "Q" }, board: { owners: [0, 1, 2] } };
    const next = applyPatch(view, [[["board", "owners", 1], 5]]);
    expect(view.board.owners).toEqual([0, 1, 2]);
    expect(next.board.owners).toEqual([0, 5, 2]);
    expect(next.question).toBe(view.question);
    expect(next).not.toBe(view);
    // No ops still gives a new object, so a forced resync re-renders the page.
    expect(applyPatch(view, [])).not.toBe(view);
  });
});

describe("Phones that fall behind", () => {
  const t = tempDir();
  afterAll(() => t.cleanup());

  /** Just enough of a Bun socket for the hub, with a send queue the test controls. */
  function fakeSocket(data: Partial<SocketData>) {
    const sock = {
      data: { admin: false, ip: "127.0.0.1", role: "player", playerId: null, lastSent: null, lastView: null, behind: false, ...data } as SocketData,
      sent: [] as ServerMsg[],
      buffered: 0,
      send(m: string) {
        sock.sent.push(JSON.parse(m));
        return m.length;
      },
      getBufferedAmount: () => sock.buffered,
    };
    return sock;
  }

  test("get no snapshots while their socket is backed up, then only the latest", async () => {
    const store = new QuizStore(t.dir);
    const quiz = store.create({ title: "Behind", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const hub = new GameHub(store, { clock: new FakeClock() });
    const host = fakeSocket({ admin: true, role: "host" });
    const phone = fakeSocket({});
    hub.onOpen(host as never);
    hub.onMessage(host as never, JSON.stringify({ type: "host.open", quizId: quiz.id }));
    hub.onOpen(phone as never);
    hub.onMessage(phone as never, JSON.stringify({ type: "join", nickname: "Ann", avatar: "cat", accessory: "none" }));
    await Promise.resolve();
    phone.sent = [];

    phone.buffered = 4096;
    for (const avatar of ["dog", "fox", "owl"]) {
      hub.onMessage(phone as never, JSON.stringify({ type: "setAvatar", avatar, accessory: "none" }));
      await Promise.resolve();
    }
    expect(phone.sent).toEqual([]);

    phone.buffered = 0;
    hub.onDrain(phone as never);
    expect(phone.sent).toHaveLength(1);
    expect(phone.sent[0]!.type).toBe("player.patch");
    const ops = phone.sent[0]!.type === "player.patch" ? phone.sent[0]!.ops : [];
    expect(JSON.stringify(ops)).toContain('"owl"');
    expect(JSON.stringify(ops)).not.toContain('"fox"');

    // A socket that keeps up isn't sent anything extra on drain.
    hub.onDrain(phone as never);
    expect(phone.sent).toHaveLength(1);
  });
});

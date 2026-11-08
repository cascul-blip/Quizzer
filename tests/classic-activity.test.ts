import { afterAll, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/game.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { GameHub, type SocketData } from "../src/server/ws.ts";
import { OFFERED_AVATARS } from "../src/shared/avatars.ts";
import type { ServerMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";

/** Just enough of a Bun socket for the hub. */
function fakeSocket(data: Partial<SocketData>) {
  const sock = {
    data: { admin: false, ip: "127.0.0.1", role: "player", playerId: null, lastSent: null, lastView: null, behind: false, ...data } as SocketData,
    sent: [] as ServerMsg[],
    send(m: string) {
      sock.sent.push(JSON.parse(m));
      return m.length;
    },
    getBufferedAmount: () => 0,
  };
  return sock;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Classic answers", () => {
  const t = tempDir();
  afterAll(() => t.cleanup());

  test("update the answering phone at once and everyone else on the throttled broadcast", async () => {
    const store = new QuizStore(t.dir);
    const quiz = store.create({ title: "Classic", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const clock = new FakeClock();
    const hub = new GameHub(store, { clock });
    const host = fakeSocket({ admin: true, role: "host" });
    hub.onOpen(host as never);
    hub.onMessage(host as never, JSON.stringify({ type: "host.open", quizId: quiz.id }));
    const phones = ["Ann", "Ben", "Cat"].map((nickname, i) => {
      const phone = fakeSocket({});
      hub.onOpen(phone as never);
      hub.onMessage(phone as never, JSON.stringify({ type: "join", nickname, avatar: OFFERED_AVATARS[i]!.id, accessory: "none" }));
      return phone;
    });
    hub.onMessage(host as never, JSON.stringify({ type: "host.start", pacing: "manual" }));
    clock.advance(INTRO_MS);
    await flush();
    for (const s of [host, ...phones]) s.sent = [];

    const [ann, ben] = phones;
    hub.onMessage(ann as never, JSON.stringify({ type: "answer", qIndex: 0, option: 0 }));
    hub.onMessage(ben as never, JSON.stringify({ type: "answer", qIndex: 0, option: 1 }));
    await Promise.resolve();
    // Each answering phone hears back straight away; nobody gets a whole-room rebuild per answer.
    expect(ann!.sent).toHaveLength(1);
    expect(ben!.sent).toHaveLength(1);
    expect(host.sent).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 150));
    // One throttled broadcast covers both answers.
    expect(host.sent).toHaveLength(1);
    const view = host.sent[0]!.type === "host.state" ? host.sent[0]!.view : null;
    expect(JSON.stringify(view)).toContain('"answeredCount":2');
  });
});

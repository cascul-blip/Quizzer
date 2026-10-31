import { afterAll, describe, expect, test } from "bun:test";
import { MAX_JOINS_PER_ADDRESS, MAX_SOCKETS_PER_ADDRESS } from "../src/server/game/common.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { GameHub, type SocketData } from "../src/server/ws.ts";
import type { ServerMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";

describe("Per-device caps", () => {
  const t = tempDir();
  afterAll(() => t.cleanup());

  function fakeSocket(data: Partial<SocketData>) {
    const sock = {
      data: { admin: false, ip: "192.168.1.50", role: "player", playerId: null, lastSent: null, lastView: null, behind: false, ...data } as SocketData,
      sent: [] as ServerMsg[],
      send(m: string) {
        sock.sent.push(JSON.parse(m));
        return m.length;
      },
      getBufferedAmount: () => 0,
    };
    return sock;
  }

  function openHub() {
    const store = new QuizStore(t.dir);
    const quiz = store.create({ title: "Caps", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const hub = new GameHub(store, { clock: new FakeClock() });
    const host = fakeSocket({ admin: true, role: "host", ip: "127.0.0.1" });
    hub.onOpen(host as never);
    hub.onMessage(host as never, JSON.stringify({ type: "host.open", quizId: quiz.id }));
    return hub;
  }

  function join(hub: GameHub, ip: string, nickname: string) {
    const phone = fakeSocket({ ip });
    hub.onOpen(phone as never);
    hub.onMessage(phone as never, JSON.stringify({ type: "join", nickname, avatar: "cat", accessory: "none" }));
    return phone;
  }

  test("one address can't join more than its share of players", () => {
    const hub = openHub();
    for (let i = 0; i < MAX_JOINS_PER_ADDRESS; i++) expect(join(hub, "192.168.1.50", `P${i}`).sent.some((m) => m.type === "joined")).toBe(true);
    const extra = join(hub, "192.168.1.50", "Extra");
    expect(extra.sent).toContainEqual({ type: "error", message: "Too many players from this device" });
    expect(join(hub, "192.168.1.51", "Other").sent.some((m) => m.type === "joined")).toBe(true);
    // The host machine is exempt.
    for (let i = 0; i < MAX_JOINS_PER_ADDRESS + 1; i++) expect(join(hub, "127.0.0.1", `L${i}`).sent.some((m) => m.type === "joined")).toBe(true);
  });

  test("a closed socket frees its seat in the socket count", () => {
    const hub = openHub();
    const socks = Array.from({ length: MAX_SOCKETS_PER_ADDRESS }, () => fakeSocket({}));
    for (const s of socks) hub.onOpen(s as never);
    expect(hub.socketLimitReached("192.168.1.50")).toBe(true);
    expect(hub.socketLimitReached("192.168.1.51")).toBe(false);
    expect(hub.socketLimitReached("127.0.0.1")).toBe(false);
    hub.onClose(socks[0] as never);
    expect(hub.socketLimitReached("192.168.1.50")).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_JOINS_PER_ADDRESS, MAX_SOCKETS_PER_ADDRESS } from "../src/server/game/common.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

describe("Per-device caps", () => {
  let t: ReturnType<typeof tempDir>;
  beforeAll(() => {
    t = tempDir();
  });
  afterAll(() => t.cleanup());

  async function openHub() {
    const store = new QuizStore(t.dir);
    const quiz = await store.create({ title: "Caps", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const hub = fakeHub(store, new FakeClock());
    const host = new HubSocket(hub, { admin: true, role: "host", ip: "127.0.0.1" });
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    return hub;
  }

  function join(hub: GameHub, ip: string, nickname: string) {
    const phone = new HubSocket(hub, { ip });
    phone.sendMsg({ type: "join", nickname, avatar: "cat", accessory: "none" });
    return phone;
  }

  test("one address can't join more than its share of players", async () => {
    const hub = await openHub();
    for (let i = 0; i < MAX_JOINS_PER_ADDRESS; i++) expect(join(hub, "192.168.1.50", `P${i}`).raw.some((m) => m.type === "joined")).toBe(true);
    const extra = join(hub, "192.168.1.50", "Extra");
    expect(extra.raw).toContainEqual({ type: "error", message: "Too many players from this device" });
    expect(join(hub, "192.168.1.51", "Other").raw.some((m) => m.type === "joined")).toBe(true);
    // The host machine is exempt.
    for (let i = 0; i < MAX_JOINS_PER_ADDRESS + 1; i++) expect(join(hub, "127.0.0.1", `L${i}`).raw.some((m) => m.type === "joined")).toBe(true);
  });

  test("a closed socket frees its seat in the socket count", async () => {
    const hub = await openHub();
    const socks = Array.from({ length: MAX_SOCKETS_PER_ADDRESS }, () => new HubSocket(hub, { ip: "192.168.1.50" }));
    expect(hub.socketLimitReached("192.168.1.50")).toBe(true);
    expect(hub.socketLimitReached("192.168.1.51")).toBe(false);
    expect(hub.socketLimitReached("127.0.0.1")).toBe(false);
    socks[0]!.close();
    expect(hub.socketLimitReached("192.168.1.50")).toBe(false);
  });
});

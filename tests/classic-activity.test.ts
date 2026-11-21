import { afterAll, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/game.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import { OFFERED_AVATARS } from "../src/shared/avatars.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Classic answers", () => {
  const t = tempDir();
  afterAll(() => t.cleanup());

  test("update the answering phone at once and everyone else on the throttled broadcast", async () => {
    const store = new QuizStore(t.dir);
    const quiz = await store.create({ title: "Classic", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const clock = new FakeClock();
    const hub = fakeHub(store, clock);
    const host = new HubSocket(hub, { admin: true, role: "host" });
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    const phones = ["Ann", "Ben", "Cat"].map((nickname, i) => {
      const phone = new HubSocket(hub);
      phone.sendMsg({ type: "join", nickname, avatar: OFFERED_AVATARS[i]!.id, accessory: "none" });
      return phone;
    });
    host.sendMsg({ type: "host.start", pacing: "manual" });
    clock.advance(INTRO_MS);
    await flush();
    for (const s of [host, ...phones]) s.raw = [];

    const [ann, ben] = phones;
    ann!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    ben!.sendMsg({ type: "answer", qIndex: 0, option: 1 });
    await Promise.resolve();
    // Each answering phone hears back straight away; nobody gets a whole-room rebuild per answer.
    expect(ann!.raw).toHaveLength(1);
    expect(ben!.raw).toHaveLength(1);
    expect(host.raw).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 150));
    // One throttled broadcast covers both answers.
    expect(host.raw).toHaveLength(1);
    const view = host.raw[0]!.type === "host.state" ? host.raw[0]!.view : null;
    expect(JSON.stringify(view)).toContain('"answeredCount":2');
  });
});

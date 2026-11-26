import { afterEach, beforeEach } from "bun:test";
import { Lobby } from "../src/server/game/lobby.ts";
import { entryOf } from "../src/server/game/modes.ts";
import { records } from "../src/server/game/results.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

export const NICKNAMES = ["Noel", "Holly", "Ivy"] as const;
export type Nickname = (typeof NICKNAMES)[number];

/** why: registers beforeEach/afterEach hooks, so call it at the top level of a test file. */
export function podiumHub() {
  let data: ReturnType<typeof tempDir>;
  const ctx = {} as { clock: FakeClock; hub: GameHub; host: HubSocket; quizId: string };

  beforeEach(async () => {
    data = tempDir();
    const store = new QuizStore(data.dir);
    const quiz = await store.create({
      title: "Podium",
      questions: [
        { type: "true_false", text: "One", correct: [0] },
        { type: "true_false", text: "Two", correct: [1] },
      ],
    });
    ctx.quizId = quiz.id;
    ctx.clock = new FakeClock();
    ctx.hub = fakeHub(store, ctx.clock);
    ctx.host = new HubSocket(ctx.hub, { admin: true, role: "host" });
    ctx.host.sendMsg({ type: "host.hello" });
  });

  afterEach(() => {
    ctx.host.sendMsg({ type: "host.close" });
    data.cleanup();
  });

  const phones = new Map<Nickname, HubSocket>();

  function answerRight(prefix: string, nickname: Nickname, id: string, count: number) {
    for (let i = 0; i < count; i++) {
      const q = (running().playerView(id) as { question?: { seq: number; text: string; options: string[] } | null } | null)?.question;
      if (!q) throw new Error(`${nickname} has no open question`);
      const option = q.options.indexOf(q.text === "One" ? "True" : "False");
      phones.get(nickname)!.sendMsg({ type: `${prefix}.answer`, seq: q.seq, option } as ClientMsg);
      ctx.clock.advance(FEEDBACK_MS);
    }
  }

  function running() {
    const game = ctx.hub.game;
    if (!game || game instanceof Lobby) throw new Error("expected a running game");
    return game;
  }

  async function finish(mode: GameMode, play: (id: (n: Nickname) => string) => void, after: (id: (n: Nickname) => string) => void = () => {}) {
    ctx.host.sendMsg({ type: "host.open", quizId: ctx.quizId });
    ctx.host.sendMsg({ type: "host.setMode", mode } as ClientMsg);
    const ids = new Map<string, string>();
    phones.clear();
    for (const nickname of NICKNAMES) {
      const phone = new HubSocket(ctx.hub);
      phone.sendMsg({ type: "join", nickname });
      const joined = phone.raw.find((m) => m.type === "joined");
      if (joined?.type !== "joined") throw new Error(`${nickname} did not join`);
      ids.set(nickname, joined.playerId);
      phones.set(nickname, phone);
    }
    const id = (n: Nickname) => ids.get(n)!;
    ctx.host.sendMsg({ type: "host.start", pacing: "manual" });
    play(id);
    ctx.host.sendMsg({ type: "host.end" });
    await new Promise((r) => setTimeout(r, 0));
    after(id);
    const game = running();
    return {
      view: ctx.hub.hostView(),
      phone: (n: Nickname) => game.playerView(id(n)),
      sheet: records(entryOf(game).results(game)),
    };
  }

  return { ctx, running, finish, answerRight };
}

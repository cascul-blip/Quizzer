import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/classic.ts";
import { Lobby } from "../src/server/game/lobby.ts";
import type { HostCommandContext } from "../src/server/host-commands.ts";
import { applyHostCommand } from "../src/server/host-commands.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket } from "./hub-harness.ts";

const QUIZ = {
  title: "Host commands",
  questions: [
    { type: "multiple_choice" as const, text: "2+2", options: ["3", "4"], correct: [1], timeLimitSec: 10 },
    { type: "true_false" as const, text: "Fire is cold", correct: [1], timeLimitSec: 10 },
  ],
};

describe("Host command", () => {
  /** A context that records what the command reached beyond the game. */
  function context(game: Lobby | null) {
    const calls: string[] = [];
    const ctx: HostCommandContext = {
      game,
      promoteAndSendHostSnapshot: () => calls.push("promoteAndSendHostSnapshot"),
      loadQuiz: () => ({ title: "Empty", questions: [] }) as unknown as Quiz,
      openLobby: () => calls.push("openLobby"),
      closeGame: () => calls.push("closeGame"),
      setAddress: (a) => calls.push(`setAddress ${a}`),
      kicked: (p) => calls.push(`kicked ${p.nickname}`),
      handoff: () => {
        throw new Error("not expected");
      },
    };
    return { ctx, calls };
  }

  test("a lobby setting with no game open is refused", () => {
    expect(() => applyHostCommand({ type: "host.setProtect", on: true }, context(null).ctx)).toThrow("No game is open");
  });

  test("opening a quiz with no questions is refused before the lobby opens", () => {
    const { ctx, calls } = context(null);
    expect(() => applyHostCommand({ type: "host.open", quizId: "q" }, ctx)).toThrow("This quiz has no questions yet");
    expect(calls).toEqual([]);
  });

  test("an unknown pacing is refused", () => {
    const lobby = new Lobby(sampleQuiz());
    // @ts-expect-error: a pacing the protocol does not allow, as a bad client could send
    expect(() => applyHostCommand({ type: "host.setPacing", pacing: "warp" }, context(lobby).ctx)).toThrow("Unknown pacing");
  });

  test("lobby settings apply to the lobby", () => {
    const lobby = new Lobby(sampleQuiz());
    const { ctx } = context(lobby);
    applyHostCommand({ type: "host.setPacing", pacing: "auto" }, ctx);
    applyHostCommand({ type: "host.setProtect", on: true }, ctx);
    expect(lobby.choices).toMatchObject({ pacing: "auto", protect: true });
  });

  test("kicking a player reports them so their phones are dropped", () => {
    const lobby = new Lobby(sampleQuiz());
    const p = lobby.join("Ann");
    const { ctx, calls } = context(lobby);
    applyHostCommand({ type: "host.kick", playerId: p.id }, ctx);
    applyHostCommand({ type: "host.kick", playerId: "nobody" }, ctx);
    expect(calls).toEqual(["kicked Ann"]);
    expect(lobby.players.size).toBe(0);
  });

  test("an unknown host message is refused", () => {
    // @ts-expect-error: a message type the protocol does not allow, as a bad client could send
    expect(() => applyHostCommand({ type: "host.dance" }, context(null).ctx)).toThrow("Unknown message host.dance");
  });
});

describe("Host command through the hub", () => {
  let t: ReturnType<typeof tempDir>;
  let hub: GameHub;
  let clock: FakeClock;
  let store: QuizStore;

  beforeEach(() => {
    t = tempDir();
    store = new QuizStore(t.dir);
    clock = new FakeClock();
    hub = fakeHub(store, clock);
  });
  afterEach(() => {
    hub.closeGame();
    t.cleanup();
  });

  async function openEmptyLobby() {
    const quiz = await store.create(QUIZ);
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.phase === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    return { host, quizId: quiz.id };
  }

  async function openLobby() {
    const { host, quizId } = await openEmptyLobby();
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "join", nickname: "Ann" });
    await phone.waitFor((m) => m.type === "joined");
    return { host, phone, quizId };
  }

  test.each([
    ["host.next", "intro"],
    ["host.end", "podium"],
  ] as const)("%s targets Classic from another mode’s lobby", async (type, phase) => {
    const { host, phone } = await openLobby();
    host.sendMsg({ type: "host.setMode", mode: "tower" });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "tower");
    host.sendMsg({ type });
    await host.hostState((v) => v.kind === "classic" && v.phase === phase);
    await phone.playerState((v) => v.kind === "classic" && v.phase === phase);
  });

  test("legacy Next refuses an empty lobby", async () => {
    const { host } = await openEmptyLobby();
    host.sendMsg({ type: "host.setMode", mode: "tower" });
    const lobby = hub.game;
    host.sendMsg({ type: "host.next" });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Wait for at least one player to join" });
    expect(hub.game).toBe(lobby);
  });

  test("legacy End takes an empty lobby to the Classic podium", async () => {
    const { host } = await openEmptyLobby();
    host.sendMsg({ type: "host.setMode", mode: "tower" });
    host.sendMsg({ type: "host.end" });
    const { view } = await host.hostState((v) => v.kind === "classic" && v.phase === "podium");
    expect(view).toMatchObject({ players: [] });
  });

  test("pacing changed during the game carries over to the next lobby (Play again)", async () => {
    const { host, quizId } = await openLobby();
    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.phase === "intro");
    clock.advance(INTRO_MS);
    host.sendMsg({ type: "host.setPacing", pacing: "auto" });
    host.sendMsg({ type: "host.open", quizId });
    const lobby = await host.hostState((v) => v.kind === "lobby");
    expect(lobby.view).toMatchObject({ pacing: "auto" });
  });

  test("a lobby setting sent after Start is refused with the mode's message", async () => {
    const { host } = await openLobby();
    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.phase === "intro");
    host.sendMsg({ type: "host.setProtect", on: true });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("before the game starts") });
  });

  test("a kicked player's phone is told it was removed", async () => {
    const { host, phone } = await openLobby();
    const lb = await host.hostState((v) => v.kind === "lobby" && v.players.length === 1);
    if (lb.view.kind !== "lobby") throw new Error("expected the lobby");
    host.sendMsg({ type: "host.kick", playerId: lb.view.players[0]!.id });
    await phone.waitFor((m) => m.type === "kicked");
    await host.hostState((v) => v.kind === "lobby" && v.players.length === 0);
  });

  test("a phone cannot send host commands", async () => {
    await openLobby();
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "host.close" });
    expect(await phone.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("only available on the host computer") });
    expect(hub.game).not.toBeNull();
  });
});

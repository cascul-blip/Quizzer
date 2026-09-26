import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/game.ts";
import { COUNTDOWN_MS, DROP_COOLDOWN_MS, FEEDBACK_MS } from "../src/server/game/tower.ts";
import { BOOST_MIN_HOLD_MS, COUNTDOWN_MS as SUB_COUNTDOWN_MS } from "../src/server/game/submarine.ts";
import { startServer, type RunningServer } from "../src/server/http.ts";
import { isAdminRequest } from "../src/server/network.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { FakeClock, tempDir } from "./helpers.ts";

class TestSocket {
  msgs: ServerMsg[] = [];
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.onmessage = (e) => {
      this.msgs.push(JSON.parse(e.data));
      this.waiters.splice(0).forEach((w) => w());
    };
  }
  static async open(url: string): Promise<TestSocket> {
    const ws = new WebSocket(url);
    const s = new TestSocket(ws);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    return s;
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  /** Wait for (and consume up to) the first queued or future message matching the predicate. */
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeout?: number): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout?: number): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeout = 2000): Promise<ServerMsg> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const i = this.msgs.findIndex(pred);
      if (i >= 0) return this.msgs.splice(0, i + 1).pop()!;
      if (Date.now() > deadline) throw new Error(`timeout; got ${JSON.stringify(this.msgs.slice(-3))}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  hostState(pred: (v: HostView) => boolean) {
    return this.waitFor((m) => m.type === "host.state" && pred(m.view)) as Promise<Extract<ServerMsg, { type: "host.state" }>>;
  }
  playerState(pred: (v: PlayerView) => boolean) {
    return this.waitFor((m) => m.type === "player.state" && pred(m.view)) as Promise<Extract<ServerMsg, { type: "player.state" }>>;
  }
  close() {
    this.ws.close();
  }
}

let t: ReturnType<typeof tempDir>;
let srv: RunningServer;
let store: QuizStore;
const clock = new FakeClock();
let base: string;

beforeAll(() => {
  t = tempDir();
  store = new QuizStore(t.dir);
  srv = startServer({ store, port: 0, version: "test", clock, address: "127.0.0.1" });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => {
  await srv.stop();
  t.cleanup();
});

describe("REST API", () => {
  test("pages are served", async () => {
    for (const p of ["/", "/admin", "/host"]) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('<div id="app">');
    }
  });

  test("quiz CRUD", async () => {
    let r = await fetch(`${base}/api/quizzes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "REST quiz", questions: [{ type: "true_false", text: "ok?", correct: [0] }] }),
    });
    expect(r.status).toBe(201);
    const q = await r.json();
    r = await fetch(`${base}/api/quizzes/${q.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...q, title: "Renamed" }),
    });
    expect((await r.json()).title).toBe("Renamed");
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "PUT", body: JSON.stringify({ title: "x", questions: [{ type: "bogus" }] }) });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("questions.0");
    r = await fetch(`${base}/api/quizzes/nope-0000`);
    expect(r.status).toBe(404);
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "DELETE" });
    expect(r.status).toBe(204);
  });

  test("media upload + public serving", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const r = await fetch(`${base}/api/media`, { method: "POST", body: png });
    expect(r.status).toBe(201);
    const { ref } = await r.json();
    const img = await fetch(`${base}/${ref}`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png);
    expect((await fetch(`${base}/media/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
  });

  test("admin guard rejects cross-site requests", async () => {
    const r = await fetch(`${base}/api/quizzes`, { method: "POST", headers: { origin: "http://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });
});

describe("isAdminRequest", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  test("loopback with localhost host", () => expect(isAdminRequest("127.0.0.1", h({ host: "localhost:8080" }))).toBe(true));
  test("IPv6 loopback", () => expect(isAdminRequest("::1", h({ host: "[::1]:8080" }))).toBe(true));
  test("LAN client is rejected", () => expect(isAdminRequest("192.168.1.20", h({ host: "localhost:8080" }))).toBe(false));
  test("DNS rebinding is rejected", () => expect(isAdminRequest("127.0.0.1", h({ host: "evil.example:8080" }))).toBe(false));
  test("foreign origin is rejected", () => expect(isAdminRequest("127.0.0.1", h({ host: "localhost", origin: "https://evil.example" }))).toBe(false));
  test("null origin is rejected", () => expect(isAdminRequest("127.0.0.1", h({ host: "localhost", origin: "null" }))).toBe(false));
});

describe("full game over WebSockets", () => {
  test("host + 3 players play a quiz to the podium", async () => {
    const quiz = store.create({
      title: "E2E",
      questions: [
        { type: "multiple_choice", text: "2+2", options: ["3", "4"], correct: [1], timeLimitSec: 10 },
        { type: "true_false", text: "Fire is cold", correct: [1], timeLimitSec: 10 },
      ],
    });
    const wsUrl = `ws://localhost:${srv.port}/ws`;
    const host = await TestSocket.open(wsUrl);
    host.send({ type: "host.hello" });
    await host.hostState((v) => v.phase === "idle");
    host.send({ type: "host.open", quizId: quiz.id });
    const lobby = await host.hostState((v) => v.phase === "lobby");
    expect(lobby.view.join.url).toBe(`http://127.0.0.1:${srv.port}/`);

    const players = await Promise.all(["Ann", "Bob", "Cy"].map(() => TestSocket.open(wsUrl)));
    const tokens: string[] = [];
    for (const [i, name] of ["Ann", "Bob", "Cy"].entries()) {
      const p = players[i]!;
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.send({ type: "join", nickname: name });
      const joined = await p.waitFor((m) => m.type === "joined");
      tokens.push((joined as { token: string }).token);
    }
    // Duplicate nickname → error.
    const dup = await TestSocket.open(wsUrl);
    dup.send({ type: "join", nickname: "ann" });
    expect(await dup.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("taken") });
    dup.close();

    await host.hostState((v) => v.phase === "lobby" && v.players.length === 3);
    // Avatars: picked in the lobby, shown on the host.
    players[0]!.send({ type: "setAvatar", avatar: "panda", accessory: "crown" });
    await host.hostState((v) => v.phase === "lobby" && v.players.some((p) => p.nickname === "Ann" && p.avatar.avatar === "panda" && p.avatar.accessory === "crown"));
    players[1]!.send({ type: "setAvatar", avatar: "panda", accessory: "jetpack" });
    expect(await players[1]!.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unknown avatar" });
    host.send({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.phase === "intro");
    clock.advance(INTRO_MS);
    await srv.hub.broadcast();
    await players[0]!.playerState((v) => v.kind === "player" && v.phase === "open");

    // Q1: Ann right, Bob wrong, Cy right.
    players[0]!.send({ type: "answer", qIndex: 0, option: 1 });
    players[1]!.send({ type: "answer", qIndex: 0, option: 0 });
    players[2]!.send({ type: "answer", qIndex: 0, option: 1 });
    const reveal = await host.hostState((v) => v.phase === "reveal");
    expect(reveal.view.kind === "classic" && reveal.view.answerCounts).toEqual([1, 2]);

    const bobResult = await players[1]!.playerState((v) => v.kind === "player" && v.phase === "reveal");
    expect(bobResult.view.kind === "player" && bobResult.view.result).toEqual({ choice: 0, correct: [1], wasCorrect: false, points: 0 });
    const annResult = await players[0]!.playerState((v) => v.kind === "player" && v.phase === "reveal");
    expect(annResult.view.kind === "player" && annResult.view.result?.wasCorrect).toBe(true);

    // Bob's phone reloads: resume with the token and keep the same identity.
    players[1]!.close();
    await host.hostState((v) => v.kind === "classic" && v.players.some((p) => p.nickname === "Bob" && !p.connected));
    const bob2 = await TestSocket.open(wsUrl);
    bob2.send({ type: "resume", token: tokens[1]! });
    const resumed = await bob2.playerState((v) => v.kind === "player");
    expect(resumed.view.kind === "player" && resumed.view.me.nickname).toBe("Bob");
    players[1] = bob2;

    host.send({ type: "host.next" }); // leaderboard
    const lb = await host.hostState((v) => v.phase === "leaderboard");
    expect(lb.view.kind === "classic" && lb.view.leaderboard.map((e) => e.nickname).slice(2)).toEqual(["Bob"]);
    host.send({ type: "host.next" }); // intro Q2
    await host.hostState((v) => v.phase === "intro");
    host.send({ type: "host.next" }); // open now
    await host.hostState((v) => v.phase === "open");
    host.send({ type: "host.kick", playerId: (lb.view.kind === "classic" && lb.view.players.find((p) => p.nickname === "Cy")!.id) as string });
    await players[2]!.waitFor((m) => m.type === "kicked");
    players[0]!.send({ type: "answer", qIndex: 1, option: 1 });
    players[1]!.send({ type: "answer", qIndex: 1, option: 1 });
    await host.hostState((v) => v.phase === "reveal");
    host.send({ type: "host.next" }); // last question → podium
    const podium = await host.hostState((v) => v.phase === "podium");
    expect(podium.view.kind === "classic" && podium.view.hasResults).toBe(true);
    const annFinal = await players[0]!.playerState((v) => v.kind === "player" && v.phase === "podium");
    expect(annFinal.view.kind === "player" && annFinal.view.me.rank).toBe(1);

    const csv = await fetch(`${base}/api/results/latest.csv`);
    expect(csv.headers.get("content-disposition")).toContain(".csv");
    const text = await csv.text();
    expect(text).toContain("Ann");
    expect(text).not.toContain("Cy"); // kicked players are dropped

    host.send({ type: "host.close" });
    await host.hostState((v) => v.phase === "idle");
    await players[0]!.playerState((v) => v.kind === "none" && v.game === null);
    [host, ...players].forEach((s) => s.close());
  });

  test("resume with an unknown token fails cleanly", async () => {
    const s = await TestSocket.open(`ws://localhost:${srv.port}/ws`);
    s.send({ type: "resume", token: "nope" });
    await s.waitFor((m) => m.type === "resumeFailed");
    s.close();
  });
});

describe("Tallest Tower over WebSockets", () => {
  test("lobby → teams → answer to earn blocks → build → timer → podium", async () => {
    const quiz = store.create({
      title: "Tower E2E",
      questions: [1, 2, 3].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const wsUrl = `ws://localhost:${srv.port}/ws`;
    const host = await TestSocket.open(wsUrl);
    host.send({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.send({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "classic" && v.phase === "lobby");
    host.send({ type: "host.setMode", mode: "tower" });
    host.send({ type: "host.setTower", teams: 2, minutes: 2 });
    await host.hostState((v) => v.kind === "classic" && v.mode === "tower" && v.tower.minutes === 2);

    const names = ["Ann", "Bob", "Cy"];
    const players = await Promise.all(names.map(() => TestSocket.open(wsUrl)));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.send({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const lobby = await host.hostState((v) => v.kind === "classic" && !!v.teams && v.players.length === 3);
    expect(lobby.view.kind === "classic" && lobby.view.teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["Ann", "Cy"], ["Bob"]]);
    const annLobby = await players[0]!.playerState((v) => v.kind === "player" && !!v.team);
    expect(annLobby.view.kind === "player" && annLobby.view.team?.name).toBe("Red");

    host.send({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "tower" && v.phase === "countdown");
    host.send({ type: "host.next" });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("Tallest Tower") });
    clock.advance(COUNTDOWN_MS);
    srv.hub.broadcast();

    // Ann answers 4 correctly at her own pace; the others do nothing.
    const ann = players[0]!;
    for (let i = 0; i < 4; i++) {
      const st = await ann.playerState((v) => v.kind === "tower" && v.phase === "playing" && !!v.question && !v.feedback);
      const q = st.view.kind === "tower" ? st.view.question! : null;
      ann.send({ type: "tower.answer", seq: q!.seq, option: 0 });
      await ann.playerState((v) => v.kind === "tower" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      srv.hub.broadcast();
    }
    const building = await ann.playerState((v) => v.kind === "tower" && v.state === "build");
    expect(building.view.kind === "tower" && building.view.build).toEqual({ columns: [0, 0, 0], floors: 0, sweepMs: 2500 });

    for (const [i, zone] of [1, 2, 3, 0].entries()) {
      ann.send({ type: "tower.drop", zone });
      await ann.playerState((v) => v.kind === "tower" && v.blocksHeld === 3 - i);
      clock.advance(DROP_COOLDOWN_MS);
    }
    const back = await ann.playerState((v) => v.kind === "tower" && v.state === "question" && v.me.placed === 3);
    expect(back.view.kind === "tower" && back.view.blocksHeld).toBe(0);
    const towers = await host.hostState((v) => v.kind === "tower" && v.teams[0]!.floors === 1);
    expect(towers.view.kind === "tower" && towers.view.teams.map((t) => [t.name, t.columns, t.placed])).toEqual([
      ["Red", [1, 1, 1], 3],
      ["Blue", [0, 0, 0], 0],
    ]);

    // At 1/3 of the game the monster egg appears for everyone (monster is on by default).
    clock.advance(40_000);
    const eggView = await host.hostState((v) => v.kind === "tower" && !!v.egg);
    expect(eggView.view.kind === "tower" && eggView.view.monster).toBe(true);
    await players[1]!.playerState((v) => v.kind === "tower" && v.monsterEvent?.kind === "egg" && !!v.egg);

    // Time runs out.
    clock.advance(2 * 60_000);
    const podium = await host.hostState((v) => v.kind === "tower" && v.phase === "podium");
    expect(podium.view.kind === "tower" && podium.view.awards).toEqual({
      mostCorrect: { value: 4, nicknames: ["Ann"] },
      masterBuilder: { value: 3, nicknames: ["Ann"] },
    });
    const bobEnd = await players[1]!.playerState((v) => v.kind === "tower" && v.phase === "podium");
    expect(bobEnd.view.kind === "tower" && bobEnd.view.result).toMatchObject({ teamRank: 2, teamCount: 2, floors: 0 });
    const csv = await (await fetch(`${base}/api/results/latest.csv`)).text();
    expect(csv).toContain("Team,Team rank,Team floors");
    expect(csv).toContain("Red,1,1,3,Ann,4,0,100,3,1,0");

    // Play again keeps Tallest Tower selected.
    host.send({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "classic" && v.phase === "lobby" && v.mode === "tower" && v.tower.teams === 2);
    host.send({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Submarine Squad over WebSockets", () => {
  test("lobby → chase → answer → boost → host sees it → end → results", async () => {
    const quiz = store.create({
      title: "Sub E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const wsUrl = `ws://localhost:${srv.port}/ws`;
    const host = await TestSocket.open(wsUrl);
    host.send({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.send({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "classic" && v.phase === "lobby");
    host.send({ type: "host.setMode", mode: "submarine" });
    await host.hostState((v) => v.kind === "classic" && v.mode === "submarine");

    const players = await Promise.all(["Sam", "Kim"].map(() => TestSocket.open(wsUrl)));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.send({ type: "join", nickname: ["Sam", "Kim"][i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    host.send({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "sub" && v.phase === "countdown");
    clock.advance(SUB_COUNTDOWN_MS);
    srv.hub.broadcast();
    const chase = await host.hostState((v) => v.kind === "sub" && v.phase === "chase");
    expect(chase.view.kind === "sub" && chase.view.required).toBe(5);

    const sam = players[0]!;
    for (let i = 0; i < 4; i++) {
      const st = await sam.playerState((v) => v.kind === "sub" && !!v.question && !v.feedback);
      const q = st.view.kind === "sub" ? st.view.question! : null;
      sam.send({ type: "sub.answer", seq: q!.seq, option: 0 });
      await sam.playerState((v) => v.kind === "sub" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      srv.hub.broadcast();
    }
    await sam.playerState((v) => v.kind === "sub" && v.state === "boost");
    clock.advance(BOOST_MIN_HOLD_MS);
    sam.send({ type: "sub.boost" });
    const boosted = await host.hostState((v) => v.kind === "sub" && v.boosts === 1);
    expect(boosted.view.kind === "sub" && boosted.view.lastBoost?.nickname).toBe("Sam");

    host.send({ type: "host.end" });
    await host.hostState((v) => v.kind === "sub" && v.phase === "podium");
    const csv = await (await fetch(`${base}/api/results/latest.csv`)).text();
    expect(csv).toContain("Nickname,Correct,Wrong,Boosts");
    expect(csv).toContain("Sam,4,0,1,");
    host.send({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

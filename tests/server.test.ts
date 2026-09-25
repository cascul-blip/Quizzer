import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { INTRO_MS } from "../src/server/game/game.ts";
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
    expect(reveal.view.phase !== "idle" && reveal.view.answerCounts).toEqual([1, 2]);

    const bobResult = await players[1]!.playerState((v) => v.kind === "player" && v.phase === "reveal");
    expect(bobResult.view.kind === "player" && bobResult.view.result).toEqual({ choice: 0, correct: [1], wasCorrect: false, points: 0 });
    const annResult = await players[0]!.playerState((v) => v.kind === "player" && v.phase === "reveal");
    expect(annResult.view.kind === "player" && annResult.view.result?.wasCorrect).toBe(true);

    // Bob's phone reloads: resume with the token and keep the same identity.
    players[1]!.close();
    await host.hostState((v) => v.phase !== "idle" && v.players.some((p) => p.nickname === "Bob" && !p.connected));
    const bob2 = await TestSocket.open(wsUrl);
    bob2.send({ type: "resume", token: tokens[1]! });
    const resumed = await bob2.playerState((v) => v.kind === "player");
    expect(resumed.view.kind === "player" && resumed.view.me.nickname).toBe("Bob");
    players[1] = bob2;

    host.send({ type: "host.next" }); // leaderboard
    const lb = await host.hostState((v) => v.phase === "leaderboard");
    expect(lb.view.phase !== "idle" && lb.view.leaderboard.map((e) => e.nickname).slice(2)).toEqual(["Bob"]);
    host.send({ type: "host.next" }); // intro Q2
    await host.hostState((v) => v.phase === "intro");
    host.send({ type: "host.next" }); // open now
    await host.hostState((v) => v.phase === "open");
    host.send({ type: "host.kick", playerId: (lb.view.phase !== "idle" && lb.view.players.find((p) => p.nickname === "Cy")!.id) as string });
    await players[2]!.waitFor((m) => m.type === "kicked");
    players[0]!.send({ type: "answer", qIndex: 1, option: 1 });
    players[1]!.send({ type: "answer", qIndex: 1, option: 1 });
    await host.hostState((v) => v.phase === "reveal");
    host.send({ type: "host.next" }); // last question → podium
    const podium = await host.hostState((v) => v.phase === "podium");
    expect(podium.view.phase !== "idle" && podium.view.hasResults).toBe(true);
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

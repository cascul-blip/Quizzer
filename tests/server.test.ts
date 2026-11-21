import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { COUNTDOWN_MS } from "../src/server/game/tower.ts";
import { startServer, type RunningServer } from "../src/server/http.ts";
import { isAdminRequest } from "../src/server/network.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../src/shared/protocol.ts";
import { applyPatch } from "../src/shared/view-patch.ts";
import { withoutCountdowns } from "./hub-harness.ts";
import { FakeClock, tempDir } from "./helpers.ts";

// Only what a real socket can show lives here: HTTP routes, the WebSocket upgrade, patches over the wire and
// resume after a reconnect. Hub logic runs on fake sockets in tests/hub.test.ts and tests/game-modes.test.ts.


class TestSocket {
  msgs: ServerMsg[] = [];
  /** Raw messages as received, before patches are turned back into player.state. */
  raw: ServerMsg[] = [];
  /** The player's view as the phone holds it, built from snapshots and patches. */
  view: PlayerView | null = null;
  token: string | null = null;
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.onmessage = (e) => {
      const msg: ServerMsg = JSON.parse(e.data);
      this.raw.push(msg);
      if (msg.type === "player.state") this.view = msg.view;
      if (msg.type === "joined") this.token = msg.token;
      // Tests read whole views, as the phone ends up with them.
      if (msg.type === "player.patch") this.view = applyPatch(this.view!, msg.ops);
      this.msgs.push(msg.type === "player.patch" ? { type: "player.state", view: this.view! } : msg);
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



/** The view a phone built from patches matches a fresh snapshot of the same player. */
async function expectInSync(s: TestSocket, wsUrl: string) {
  await new Promise((r) => setTimeout(r, 150)); // past the activity throttle
  const fresh = await TestSocket.open(wsUrl);
  fresh.send({ type: "resume", token: s.token! });
  const st = await fresh.playerState((v) => v.kind !== "none");
  expect(s.raw.some((m) => m.type === "player.patch")).toBe(true);
  expect(withoutCountdowns(s.view)).toEqual(withoutCountdowns(st.view));
  fresh.close();
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
    const renamed = await r.json();
    expect(renamed.title).toBe("Renamed");
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "PUT", headers: { "x-quiz-updated-at": q.updatedAt }, body: JSON.stringify({ ...q, title: "Stale" }) });
    expect(r.status).toBe(409);
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "PUT", headers: { "x-quiz-updated-at": renamed.updatedAt }, body: JSON.stringify({ ...q, title: "Fresh" }) });
    expect((await r.json()).title).toBe("Fresh");
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "PUT", body: JSON.stringify({ title: "x", questions: [{ type: "bogus" }] }) });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("questions.0");
    r = await fetch(`${base}/api/quizzes/nope-0000`);
    expect(r.status).toBe(404);
    r = await fetch(`${base}/api/quizzes/${q.id}`, { method: "DELETE" });
    expect(r.status).toBe(204);
  });

  test("a hand-edit conflicts with an open draft and deletion also stops an explicit overwrite", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const q = await store.create({ title: "Draft" });
    const url = `${base}/api/quizzes/${q.id}`;
    const opened = await (await fetch(url)).json();
    const path = join(store.quizzesDir, `${q.id}.json`);
    const onDisk = await Bun.file(path).json();
    writeFileSync(path, JSON.stringify({ ...onDisk, title: "Corrected by hand" }));
    const save = (revision?: string) => fetch(url, {
      method: "PUT",
      headers: revision === undefined ? {} : { "x-quiz-revision": revision },
      body: JSON.stringify({ title: "Editor draft" }),
    });
    expect((await save(opened.revision)).status).toBe(409);
    const corrected = await (await fetch(url)).json();
    expect(corrected.title).toBe("Corrected by hand");
    expect(corrected.updatedAt).toBe(opened.updatedAt);
    expect(corrected.revision).not.toBe(opened.revision);
    const forced = await (await save()).json();
    expect(forced.title).toBe("Editor draft");
    expect((await save(forced.revision)).status).toBe(200);
    await store.delete(q.id);
    expect((await save(forced.revision)).status).toBe(404);
    expect((await save()).status).toBe(404);
    expect(store.exists(q.id)).toBe(false);
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

  test("custom music: listed by track id, served with the right type, nothing else", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(store.musicDir, "submarine-chase.mp3"), new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]));
    writeFileSync(join(store.musicDir, "notes.txt"), "ignore me");
    writeFileSync(join(store.musicDir, "unknown-song.mp3"), "x");
    const list = await (await fetch(`${base}/api/music`)).json();
    expect(list.files).toEqual({ "submarine-chase": "/music/submarine-chase.mp3" });
    const file = await fetch(`${base}/music/submarine-chase.mp3`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("audio/mpeg");
    expect((await fetch(`${base}/music/notes.txt`)).status).toBe(404);
    expect((await fetch(`${base}/music/unknown-song.mp3`)).status).toBe(404);
    expect((await fetch(`${base}/music/..%2Fquizzes%2Fx.json`)).status).toBe(404);
    // A malformed escape is a plain 404, not a 500 with a URIError on the teacher's console.
    expect((await fetch(`${base}/music/%E0%A4%A`)).status).toBe(404);
    expect((await fetch(`${base}/api/quizzes/%E0%A4%A`)).status).toBe(404);
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
describe("WebSocket transport", () => {
  test("/ws only answers a WebSocket upgrade", async () => {
    expect((await fetch(`${base}/ws`)).status).toBe(426);
  });

  test("sockets negotiate permessage-deflate", async () => {
    const s = await TestSocket.open(`ws://localhost:${srv.port}/ws`);
    expect(s.ws.extensions).toContain("permessage-deflate");
    await s.waitFor((m) => m.type === "player.state");
    s.close();
  });

  const settle = () => new Promise((r) => setTimeout(r, 250)); // longer than the 100 ms activity throttle
  const states = (s: TestSocket) => s.msgs.filter((m) => m.type === "player.state").length;

  test("only changed views are pushed as patches, and a reconnecting phone resumes the same view", async () => {
    const image = await store.saveMedia(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
    const quiz = await store.create({
      title: "Dedupe E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, image, options: ["right", "wrong"], correct: [0] })),
    });
    const wsUrl = `ws://localhost:${srv.port}/ws`;
    const host = await TestSocket.open(wsUrl);
    host.send({ type: "host.hello" });
    host.send({ type: "host.open", quizId: quiz.id });
    host.send({ type: "host.setMode", mode: "tower" });
    host.send({ type: "host.setModeSettings", mode: "tower", settings: { teams: 2, minutes: 2 } });
    await host.hostState((v) => v.kind === "classic" && v.mode === "tower" && v.settings.tower.teams === 2);

    const [ann, bob] = await Promise.all([TestSocket.open(wsUrl), TestSocket.open(wsUrl)]);
    for (const [p, nickname] of [[ann!, "Ann"], [bob!, "Bob"]] as const) {
      p.send({ type: "join", nickname });
      expect(await p.waitFor((m) => m.type === "joined")).toMatchObject({ images: [image] });
    }
    host.send({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "tower" && v.phase === "countdown");
    clock.advance(COUNTDOWN_MS);
    srv.hub.broadcast();
    const annQ = await ann!.playerState((v) => v.kind === "tower" && v.phase === "playing" && !!v.question);
    await bob!.playerState((v) => v.kind === "tower" && v.phase === "playing" && !!v.question);
    await settle();
    ann!.msgs = [];
    bob!.msgs = [];

    // Only the clock moved: countdowns run on the phone, so nothing is sent.
    clock.advance(500);
    srv.hub.broadcast();
    await settle();
    expect([states(ann!), states(bob!)]).toEqual([0, 0]);

    // Ann answers: she hears back, Bob's screen is unchanged so he gets nothing.
    const q = annQ.view.kind === "tower" ? annQ.view.question! : null;
    ann!.send({ type: "tower.answer", seq: q!.seq, option: 0 });
    await ann!.playerState((v) => v.kind === "tower" && v.feedback?.seq === q!.seq);
    await settle();
    expect(states(bob!)).toBe(0);
    await host.hostState((v) => v.kind === "tower");

    // A rejected action (dropping without blocks) always resyncs the phone.
    bob!.send({ type: "tower.drop", zone: 2 });
    await bob!.playerState((v) => v.kind === "tower" && v.state === "question");

    // The view Ann built from patches over the wire matches what a phone reconnecting with her token gets.
    await expectInSync(ann!, wsUrl);

    host.send({ type: "host.close" });
    await host.hostState((v) => v.kind === "idle");
    [host, ann!, bob!].forEach((s) => s.close());
  });
});

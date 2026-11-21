import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AUTO_REVEAL_MS, INTRO_MS } from "../src/server/game/classic.ts";
import { COUNTDOWN_MS as CUP_COUNTDOWN_MS } from "../src/server/game/cup.ts";
import { COUNTDOWN_MS as FIGHT_COUNTDOWN_MS, RESULT_MS } from "../src/server/game/fight.ts";
import { COUNTDOWN_MS as LAND_COUNTDOWN_MS } from "../src/server/game/land.ts";
import { RacerGame } from "../src/server/game/racer.ts";
import { COUNTDOWN_MS as ROBOT_COUNTDOWN_MS } from "../src/server/game/robot.ts";
import type { SiegeGame } from "../src/server/game/siege.ts";
import { BOOST_MIN_HOLD_MS, COUNTDOWN_MS as SUB_COUNTDOWN_MS } from "../src/server/game/submarine.ts";
import { COUNTDOWN_MS, DROP_COOLDOWN_MS, FEEDBACK_MS } from "../src/server/game/tower.ts";
import { QuizStore } from "../src/server/quiz/store.ts";
import type { GameHub } from "../src/server/ws.ts";
import { OFFERED_ACCESSORIES, OFFERED_AVATARS } from "../src/shared/avatars.ts";
import { GIFT_GOODS, GIFT_READY_MS } from "../src/shared/gift-rules.ts";
import { CUP_ROLL_MS, CUP_SIP_MS, cupQuizMs } from "../src/shared/modes/cup.ts";
import { ROBOT_MOVE_MS, robotQuizMs } from "../src/shared/modes/robot.ts";
import { SIEGE_COUNTDOWN_MS, SIEGE_GIANT_WAIT_MS, SIEGE_OPENING_MS, SIEGE_TICK_MS } from "../src/shared/siege-rules.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { fakeHub, HubSocket, pastThrottle, withoutTimers } from "./hub-harness.ts";

// The hub's game logic, end to end, on fake sockets; tests/server.test.ts keeps what only a real socket can show.

let t: ReturnType<typeof tempDir>;
let store: QuizStore;
let hub: GameHub;
let clock: FakeClock;

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

/** The results CSV the server would serve at /api/results/latest.csv. */
async function resultsCsv() {
  await new Promise((r) => setTimeout(r, 0));
  return hub.lastResults?.csv ?? "";
}

/** The view a phone built from patches matches a fresh snapshot of the same player. */
async function expectInSync(s: HubSocket) {
  await pastThrottle();
  const fresh = new HubSocket(hub);
  fresh.sendMsg({ type: "resume", token: s.token! });
  const st = await fresh.playerState((v) => v.kind !== "none");
  expect(s.raw.some((m) => m.type === "player.patch")).toBe(true);
  expect(withoutTimers(s.view)).toEqual(withoutTimers(st.view));
  fresh.close();
}

describe("Game mode: Classic", () => {
  test("host + 3 players play a quiz to the podium", async () => {
    const quiz = await store.create({
      title: "E2E",
      questions: [
        { type: "multiple_choice", text: "2+2", options: ["3", "4"], correct: [1], timeLimitSec: 10 },
        { type: "true_false", text: "Fire is cold", correct: [1], timeLimitSec: 10 },
      ],
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.phase === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    const lobby = await host.hostState((v) => v.kind === "lobby");
    expect(lobby.view.join.url).toBe("http://127.0.0.1:4321/");

    const players = ["Ann", "Bob", "Cy"].map(() => new HubSocket(hub));
    const tokens: string[] = [];
    for (const [i, name] of ["Ann", "Bob", "Cy"].entries()) {
      const p = players[i]!;
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: name });
      const joined = await p.waitFor((m) => m.type === "joined");
      if (joined.type !== "joined") throw new Error("expected joined");
      tokens.push(joined.token);
    }
    // Duplicate nickname → error.
    const dup = new HubSocket(hub);
    dup.sendMsg({ type: "join", nickname: "ann" });
    expect(await dup.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("taken") });
    dup.close();

    await host.hostState((v) => v.kind === "lobby" && v.players.length === 3);
    // Avatars: picked in the lobby, shown on the host.
    const look = { avatar: OFFERED_AVATARS[0]!.id, accessory: OFFERED_ACCESSORIES[1]!.id };
    players[0]!.sendMsg({ type: "setAvatar", ...look });
    await host.hostState(
      (v) => v.kind === "lobby" && v.players.some((p) => p.nickname === "Ann" && p.avatar.avatar === look.avatar && p.avatar.accessory === look.accessory),
    );
    players[1]!.sendMsg({ type: "setAvatar", avatar: look.avatar, accessory: "jetpack" });
    expect(await players[1]!.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unknown avatar" });
    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.phase === "intro");
    players[0]!.sendMsg({ type: "setAvatar", ...look });
    expect(await players[0]!.waitFor((m) => m.type === "error")).toMatchObject({ message: "The game has already started" });
    clock.advance(INTRO_MS);
    await hub.broadcast();
    await players[0]!.playerState((v) => v.kind === "classic" && v.phase === "open");

    // Q1: Ann right, Bob wrong, Cy right.
    players[0]!.sendMsg({ type: "answer", qIndex: 0, option: 1 });
    players[1]!.sendMsg({ type: "answer", qIndex: 0, option: 0 });
    players[2]!.sendMsg({ type: "answer", qIndex: 0, option: 1 });
    const reveal = await host.hostState((v) => v.phase === "reveal");
    expect(reveal.view.kind === "classic" && reveal.view.answerCounts).toEqual([1, 2]);

    const bobResult = await players[1]!.playerState((v) => v.kind === "classic" && v.phase === "reveal");
    expect(bobResult.view.kind === "classic" && bobResult.view.result).toEqual({ choice: 0, correct: [1], wasCorrect: false, points: 0 });
    const annResult = await players[0]!.playerState((v) => v.kind === "classic" && v.phase === "reveal");
    expect(annResult.view.kind === "classic" && annResult.view.result?.wasCorrect).toBe(true);

    // Bob's phone reloads: resume with the token and keep the same identity.
    players[1]!.close();
    await host.hostState((v) => v.kind === "classic" && v.players.some((p) => p.nickname === "Bob" && !p.connected));
    const bob2 = new HubSocket(hub);
    bob2.sendMsg({ type: "resume", token: tokens[1]! });
    const resumed = await bob2.playerState((v) => v.kind === "classic");
    expect(resumed.view.kind === "classic" && resumed.view.me.nickname).toBe("Bob");
    players[1] = bob2;

    host.sendMsg({ type: "host.next" }); // leaderboard
    const lb = await host.hostState((v) => v.phase === "leaderboard");
    expect(lb.view.kind === "classic" && lb.view.leaderboard.map((e) => e.nickname).slice(2)).toEqual(["Bob"]);
    host.sendMsg({ type: "host.next" }); // intro Q2
    await host.hostState((v) => v.phase === "intro");
    host.sendMsg({ type: "host.next" }); // open now
    await host.hostState((v) => v.phase === "open");
    host.sendMsg({ type: "host.kick", playerId: (lb.view.kind === "classic" && lb.view.players.find((p) => p.nickname === "Cy")!.id) as string });
    await players[2]!.waitFor((m) => m.type === "kicked");
    players[0]!.sendMsg({ type: "answer", qIndex: 1, option: 1 });
    players[1]!.sendMsg({ type: "answer", qIndex: 1, option: 1 });
    await host.hostState((v) => v.phase === "reveal");
    host.sendMsg({ type: "host.next" }); // last question → podium
    const podium = await host.hostState((v) => v.phase === "podium");
    expect(podium.view.kind).toBe("classic");
    // Bob got the first question wrong: the "Show errors" table has it.
    const errors = podium.view.kind === "classic" ? podium.view.errors! : [];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.wrong > 0 && !!e.text && e.answers.length > 0)).toBe(true);
    const annFinal = await players[0]!.playerState((v) => v.kind === "classic" && v.phase === "podium");
    expect(annFinal.view.kind === "classic" && annFinal.view.me.rank).toBe(1);

    const text = await resultsCsv();
    expect(text).toContain("Ann");
    expect(text).not.toContain("Cy"); // kicked players are dropped

    host.sendMsg({ type: "host.close" });
    await host.hostState((v) => v.phase === "idle");
    await players[0]!.playerState((v) => v.kind === "none" && v.game === null);
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Tallest Tower", () => {
  test("lobby → teams → answer to earn blocks → build → timer → podium", async () => {
    const quiz = await store.create({
      title: "Tower E2E",
      questions: [1, 2, 3].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "tower" });
    host.sendMsg({ type: "host.setModeSettings", mode: "tower", settings: { teams: 2, minutes: 2, theme: "classic" } });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "tower" && v.settings.tower.minutes === 2);

    const names = ["Ann", "Bob", "Cy"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const lobby = await host.hostState((v) => v.kind === "lobby" && !!v.teams && v.players.length === 3);
    expect(lobby.view.kind === "lobby" && lobby.view.teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["Ann", "Cy"], ["Bob"]]);
    const annLobby = await players[0]!.playerState((v) => v.kind === "lobby" && !!v.team);
    expect(annLobby.view.kind === "lobby" && annLobby.view.team?.name).toBe("Red");

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const themedHost = await host.hostState((v) => v.kind === "tower" && v.phase === "countdown");
    expect(themedHost.view.kind === "tower" && themedHost.view.theme).toBe("classic");
    const themedPlayer = await players[0]!.playerState((v) => v.kind === "tower");
    expect(themedPlayer.view.kind === "tower" && themedPlayer.view.theme).toBe("classic");
    host.sendMsg({ type: "host.next" });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("Tallest Tower") });
    clock.advance(COUNTDOWN_MS);
    hub.broadcast();

    // Ann answers 4 correctly at her own pace; the others do nothing.
    const ann = players[0]!;
    for (let i = 0; i < 4; i++) {
      const st = await ann.playerState((v) => v.kind === "tower" && v.phase === "playing" && !!v.question && !v.feedback);
      const q = st.view.kind === "tower" ? st.view.question! : null;
      ann.sendMsg({ type: "tower.answer", seq: q!.seq, option: 0 });
      await ann.playerState((v) => v.kind === "tower" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    const building = await ann.playerState((v) => v.kind === "tower" && v.state === "build");
    expect(building.view.kind === "tower" && building.view.build).toEqual({ columns: [0, 0, 0], floors: 0, sweepMs: 2500 });

    let back!: Awaited<ReturnType<typeof ann.playerState>>;
    for (const [i, zone] of [1, 2, 3, 0].entries()) {
      ann.sendMsg({ type: "tower.drop", zone });
      back = await ann.playerState((v) => v.kind === "tower" && v.blocksHeld === 3 - i);
      clock.advance(DROP_COOLDOWN_MS);
    }
    expect(back.view.kind === "tower" && back.view.state === "question" && back.view.me.placed).toBe(3);
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
    const csv = await resultsCsv();
    expect(csv).toContain("Team,Team rank,Team floors");
    expect(csv).toContain("Red,1,1,3,Ann,4,0,100,3,1,0");

    // Play again keeps Tallest Tower selected.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "tower" && v.settings.tower.teams === 2 && v.settings.tower.theme === "classic");
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Submarine Squad", () => {
  test("lobby → chase → answer → boost → host sees it → end → results", async () => {
    const quiz = await store.create({
      title: "Sub E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "submarine" });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "submarine");

    const players = ["Sam", "Kim"].map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: ["Sam", "Kim"][i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "submarine" && v.phase === "countdown");
    clock.advance(SUB_COUNTDOWN_MS);
    hub.broadcast();
    const chase = await host.hostState((v) => v.kind === "submarine" && v.phase === "chase");
    expect(chase.view.kind === "submarine" && chase.view.required).toBe(5);

    const sam = players[0]!;
    for (let i = 0; i < 4; i++) {
      const st = await sam.playerState((v) => v.kind === "submarine" && !!v.question && !v.feedback);
      const q = st.view.kind === "submarine" ? st.view.question! : null;
      sam.sendMsg({ type: "sub.answer", seq: q!.seq, option: 0 });
      await sam.playerState((v) => v.kind === "submarine" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    await sam.playerState((v) => v.kind === "submarine" && v.state === "boost");
    clock.advance(BOOST_MIN_HOLD_MS);
    sam.sendMsg({ type: "sub.boost" });
    const boosted = await host.hostState((v) => v.kind === "submarine" && v.boosts === 1);
    expect(boosted.view.kind === "submarine" && boosted.view.lastBoost?.nickname).toBe("Sam");
    // The boost carries Sam's avatar so the projector can show who boosted.
    if (boosted.view.kind === "submarine") {
      const samAvatar = boosted.view.players.find((p) => p.nickname === "Sam")!.avatar;
      expect(boosted.view.lastBoost?.avatar).toEqual(samAvatar);
    }

    host.sendMsg({ type: "host.end" });
    await host.hostState((v) => v.kind === "submarine" && v.phase === "podium");
    const csv = await resultsCsv();
    expect(csv).toContain("Nickname,Correct,Wrong,Boosts");
    expect(csv).toContain("Sam,4,0,1,");
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Tower Fight", () => {
  test("lobby → Red vs Blue → earn a move → fire → host sees the shot land → end → results", async () => {
    const quiz = await store.create({
      title: "Fight E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "fight" });
    host.sendMsg({ type: "host.setModeSettings", mode: "fight", settings: { hill: "low" } });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "fight" && v.settings.fight.hill === "low");

    const names = ["Red1", "Blue1"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const lobby = await host.hostState((v) => v.kind === "lobby" && !!v.teams && v.players.length === 2);
    expect(lobby.view.kind === "lobby" && lobby.view.teams!.map((t) => t.name)).toEqual(["Red", "Blue"]);

    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "fight" && v.phase === "countdown" && v.hill === "low");
    clock.advance(FIGHT_COUNTDOWN_MS);
    hub.broadcast();

    const red = players[0]!;
    for (let i = 0; i < 4; i++) {
      const st = await red.playerState((v) => v.kind === "fight" && v.phase === "playing" && !!v.question && !v.feedback);
      const q = st.view.kind === "fight" ? st.view.question! : null;
      red.sendMsg({ type: "fight.answer", seq: q!.seq, option: 0 });
      await red.playerState((v) => v.kind === "fight" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    // Undamaged tower: straight to aiming.
    const aiming = await red.playerState((v) => v.kind === "fight" && v.state === "aim");
    expect(aiming.view.kind === "fight" && aiming.view.decisionMs).toBe(0);

    // A hard throw backwards: friendly fire on Red's own tower.
    red.sendMsg({ type: "fight.fire", dx: 170, dy: -20 });
    const watching = await red.playerState((v) => v.kind === "fight" && v.state === "watch" && !!v.shot);
    const shot = watching.view.kind === "fight" ? watching.view.shot! : null;
    expect(shot!.impact).toMatchObject({ kind: "tower", team: 0 });
    await host.hostState((v) => v.kind === "fight" && v.shots.some((s) => s.id === shot!.id));
    clock.advance(shot!.durationMs);
    const hit = await host.hostState((v) => v.kind === "fight" && v.teams[0]!.damage === 1);
    expect(hit.view.kind === "fight" && hit.view.events.at(-1)).toMatchObject({ kind: "friendly", nickname: "Red1" });
    clock.advance(RESULT_MS);
    hub.broadcast();
    await red.playerState((v) => v.kind === "fight" && v.state === "question");
    await expectInSync(red);

    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "fight" && v.phase === "podium");
    expect(podium.view.kind === "fight" && podium.view.outcome).toEqual({ winner: 1, reason: "damage" });
    const blueEnd = await players[1]!.playerState((v) => v.kind === "fight" && v.phase === "podium");
    expect(blueEnd.view.kind === "fight" && blueEnd.view.result?.outcome.winner).toBe(1);
    const csv = await resultsCsv();
    expect(csv).toContain("Blue,Won,0,Blue1,");
    expect(csv).toContain("Red,Lost,1,Red1,4,0,100,1,0,1,0");

    // Play again keeps Tower Fight and the hill.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "fight" && v.settings.fight.hill === "low");
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Robot Attack", () => {
  test("lobby → quiz for points → move on the board → lasers → end → results", async () => {
    const quiz = await store.create({
      title: "Robot E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "robot" });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "robot" && v.teams === null);

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    await host.hostState((v) => v.kind === "lobby" && v.players.length === 2);

    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "robot" && v.phase === "countdown");
    clock.advance(ROBOT_COUNTDOWN_MS);
    hub.broadcast();

    const ann = players[0]!;
    for (let i = 0; i < 2; i++) {
      const st = await ann.playerState((v) => v.kind === "robot" && v.phase === "quiz" && !!v.question && !v.feedback);
      const q = st.view.kind === "robot" ? st.view.question! : null;
      expect(st.view.kind === "robot" && st.view.board).toBeNull();
      ann.sendMsg({ type: "robot.answer", seq: q!.seq, option: 0 });
      await ann.playerState((v) => v.kind === "robot" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    await ann.playerState((v) => v.kind === "robot" && v.me.points === 2);

    clock.advance(robotQuizMs(1));
    hub.broadcast();
    const moving = await ann.playerState((v) => v.kind === "robot" && v.phase === "move" && !!v.board);
    const start = moving.view.kind === "robot" ? moving.view.me : null;
    expect(moving.view.kind === "robot" && moving.view.board!.marked.length).toBeGreaterThanOrEqual(108);
    // Step away from the edge the player is nearest, twice.
    const dir = start!.x < 6 ? "right" : "left";
    ann.sendMsg({ type: "robot.move", dir });
    ann.sendMsg({ type: "robot.move", dir });
    const moved = await ann.playerState((v) => v.kind === "robot" && v.me.points === 0);
    expect(moved.view.kind === "robot" && moved.view.me.x).toBe(start!.x + (dir === "right" ? 2 : -2));
    await expectInSync(ann);
    await host.hostState((v) => v.kind === "robot" && v.players.some((p) => p.nickname === "Ann" && p.x === start!.x + (dir === "right" ? 2 : -2)));

    // Bob stood still, so the lasers hit him.
    clock.advance(ROBOT_MOVE_MS);
    const attack = await host.hostState((v) => v.kind === "robot" && v.phase === "attack");
    const bob = attack.view.kind === "robot" ? attack.view.players.find((p) => p.nickname === "Bob")! : null;
    expect(bob!.lives).toBe(2);
    expect(attack.view.kind === "robot" && attack.view.lastAttack!.hit).toContain(bob!.id);

    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "robot" && v.phase === "podium");
    expect(podium.view.kind === "robot" && podium.view.standings!.at(-1)!.nickname).toBe("Bob");
    await players[1]!.playerState((v) => v.kind === "robot" && v.phase === "podium" && !!v.result);
    const csv = await resultsCsv();
    expect(csv).toContain("Rank,Nickname,Status");
    expect(csv).toContain("Bob,");

    // Play again keeps Robot Attack.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "robot");
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Cup of Death", () => {
  test("lobby → roll → answer to safety → the other picks a cup → reveal → end → results", async () => {
    const quiz = await store.create({
      title: "Cup E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "cup" });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "cup" && v.teams === null && v.settings.cup.cups === 3);
    host.sendMsg({ type: "host.setModeSettings", mode: "cup", settings: { cups: 7 } });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("between 1 and 6") });
    host.sendMsg({ type: "host.setModeSettings", mode: "cup", settings: { cups: 5, theme: "classic" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.cup.cups === 5 && v.settings.cup.theme === "classic");
    host.sendMsg({ type: "host.setModeSettings", mode: "cup", settings: { cups: 5, theme: "christmas" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.cup.theme === "christmas");

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    await host.hostState((v) => v.kind === "lobby" && v.players.length === 2);

    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "cup" && v.phase === "countdown" && v.theme === "christmas");
    await players[0]!.playerState((v) => v.kind === "cup" && v.theme === "christmas");
    clock.advance(CUP_COUNTDOWN_MS);
    hub.broadcast();
    const rolled = await host.hostState((v) => v.kind === "cup" && v.phase === "roll");
    for (const p of rolled.view.kind === "cup" ? rolled.view.players : []) {
      expect(p.target).toBeGreaterThanOrEqual(1);
      expect(p.cups).toBe(5);
    }
    clock.advance(CUP_ROLL_MS);
    hub.broadcast();

    // Ann answers until she's safe; Bob does nothing.
    const [ann, bob] = players as [HubSocket, HubSocket];
    for (;;) {
      const st = await ann.playerState((v) => v.kind === "cup" && v.phase === "quiz" && (v.me.safe || (!!v.question && !v.feedback)));
      if (st.view.kind !== "cup" || st.view.me.safe) break;
      const q = st.view.question!;
      ann.sendMsg({ type: "cup.answer", seq: q.seq, option: 0 });
      await ann.playerState((v) => v.kind === "cup" && v.feedback?.seq === q.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    clock.advance(cupQuizMs(1));
    hub.broadcast();
    await bob.playerState((v) => v.kind === "cup" && v.phase === "drink" && v.drink?.picked === null);
    await ann.playerState((v) => v.kind === "cup" && v.phase === "drink" && v.drink === null);
    bob.sendMsg({ type: "cup.pick", cup: 2 });
    const reveal = await host.hostState((v) => v.kind === "cup" && v.phase === "reveal");
    expect(reveal.view.kind === "cup" && reveal.view.reveal!.drinks.map((d) => d.cup)).toEqual([2]);
    await bob.playerState((v) => v.kind === "cup" && v.myDrink?.turn === true && v.myDrink.verdict === null);
    clock.advance(CUP_SIP_MS);
    hub.broadcast();
    await bob.playerState((v) => v.kind === "cup" && v.myDrink?.verdict !== null);

    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "cup" && v.phase === "podium");
    expect(podium.view.kind === "cup" && podium.view.standings![0]!.nickname).toBe("Ann");
    await bob.playerState((v) => v.kind === "cup" && v.phase === "podium" && !!v.result);
    const csv = await resultsCsv();
    expect(csv).toContain("Rank,Nickname,Status,Cups left");
    expect(csv).toContain("Bob,");

    // Play again keeps the Cup of Cheer theme and cup count.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "cup" && v.settings.cup.theme === "christmas" && v.settings.cup.cups === 5);
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Kingdom Siege", () => {
  test("a giant starting to walk refreshes the projector without reading phone views", async () => {
    const quiz = await store.create({ title: "Siege ticks", questions: [{ type: "true_false", text: "Q", correct: [0] }] });
    const host = new HubSocket(hub, { admin: true, role: "host" });
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    host.sendMsg({ type: "host.setMode", mode: "siege" });
    const phone = new HubSocket(hub);
    phone.sendMsg({ type: "join", nickname: "Ann" });
    host.sendMsg({ type: "host.start", pacing: "manual" });
    clock.advance(SIEGE_COUNTDOWN_MS);
    await host.hostState((v) => v.kind === "siege" && v.phase === "build");
    if (!hub.game || !("battlefield" in hub.game)) throw new Error("Expected Kingdom Siege to be running");
    hub.game.battlefield.spawn("giant", 0);
    const phoneView = spyOn(hub, "playerView");
    host.raw = [];
    phone.raw = [];

    clock.advance(Math.ceil(SIEGE_GIANT_WAIT_MS / SIEGE_TICK_MS) * SIEGE_TICK_MS);
    await Promise.resolve();

    expect(host.raw).toEqual([{ type: "host.state", view: expect.objectContaining({ kind: "siege" }) }]);
    expect(phone.raw).toEqual([]);
    expect(phoneView).not.toHaveBeenCalled();
  });

  test("Endless lobby → build → lane map → wave 1 → end → results and record → play again", async () => {
    const quiz = await store.create({
      title: "Siege E2E",
      questions: [1, 2, 3].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "siege" });
    const siegeLobby = await host.hostState((v) => v.kind === "lobby" && v.mode === "siege" && v.settings.siege.waves === 5 && v.teams === null);
    expect(siegeLobby.view.kind === "lobby" && siegeLobby.view.settings.siege.theme).toBe("christmas");
    hub.onMessage(host, JSON.stringify({ type: "host.setModeSettings", mode: "siege", settings: { waves: 7 } })); // not a valid choice, as a stale page might send
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("waves") });
    host.sendMsg({ type: "host.setModeSettings", mode: "siege", settings: { waves: "endless", theme: "classic" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.siege.waves === "endless");

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const [ann, bob] = players as [HubSocket, HubSocket];

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const siegeCountdown = await host.hostState((v) => v.kind === "siege" && v.phase === "countdown" && v.gold === 100);
    expect(siegeCountdown.view.kind === "siege" && siegeCountdown.view.settings.theme).toBe("classic");
    clock.advance(SIEGE_COUNTDOWN_MS);
    hub.broadcast();
    const st = await ann.playerState((v) => v.kind === "siege" && v.phase === "build" && !!v.question);
    expect(st.view.kind === "siege" && st.view.theme).toBe("classic");
    const q = st.view.kind === "siege" ? st.view.question! : null;
    ann.sendMsg({ type: "siege.answer", seq: q!.seq, option: 0 });
    await ann.playerState((v) => v.kind === "siege" && v.gold === 75);
    await host.hostState((v) => v.kind === "siege" && v.gold === 125);
    // Bob's own purse doesn't change when Ann answers.
    expect(bob.view?.kind === "siege" && bob.view.gold).toBe(50);

    // The map's contents only come while it is open.
    expect(bob.view?.kind === "siege" && bob.view.map).toBeNull();
    bob.sendMsg({ type: "siege.map", open: true });
    await bob.playerState((v) => v.kind === "siege" && !!v.map && v.map.defenders.length === 0);
    // Bob's 50 gold can't buy a knight; Ann's 75 can.
    bob.sendMsg({ type: "siege.place", defender: "knight", lane: 2, square: 3 });
    expect(await bob.waitFor((m) => m.type === "error")).toMatchObject({ message: "Not enough gold." });
    ann.sendMsg({ type: "siege.place", defender: "knight", lane: 2, square: 3 });
    await host.hostState((v) => v.kind === "siege" && v.defenders.length === 1 && v.gold === 50 && v.events[0]?.text === "placed a knight");
    await bob.playerState((v) => v.kind === "siege" && v.map?.defenders.length === 1);
    await ann.playerState((v) => v.kind === "siege" && v.gold === 0 && v.lastPlaced === "knight");
    bob.sendMsg({ type: "siege.upgrade", lane: 2, square: 3 });
    expect(await bob.waitFor((m) => m.type === "error")).toMatchObject({ message: "Not enough gold." });
    bob.sendMsg({ type: "siege.place", defender: "archer", lane: 2, square: 8 });
    expect(await bob.waitFor((m) => m.type === "error")).toMatchObject({ message: "You can't build on that square." });
    bob.sendMsg({ type: "siege.map", open: false });
    await bob.playerState((v) => v.kind === "siege" && v.map === null);
    await expectInSync(bob);

    clock.advance(SIEGE_OPENING_MS);
    hub.broadcast();
    await host.hostState((v) => v.kind === "siege" && v.phase === "wave" && v.wave === 1);
    const siege = hub.game as SiegeGame;
    // Spawn a goblin near the wall in an undefended lane to guarantee a wall hit.
    siege.battlefield.spawn("goblin", 0, 1);
    for (let i = 0; i < 120 && !(siege.phase === "build" && siege.wave === 2); i++) clock.advance(500);
    hub.broadcast();
    const wave2 = await host.hostState((v) => v.kind === "siege" && v.phase === "build" && v.wave === 2);
    expect(wave2.view.kind === "siege" && wave2.view.hearts).toBeLessThan(10);
    // Phones never get monster positions.
    expect(JSON.stringify(ann.raw.filter((m) => m.type === "player.state" || m.type === "player.patch"))).not.toContain("goblin");

    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "siege" && v.phase === "podium");
    expect(podium.view.kind === "siege" && podium.view.result).toMatchObject({ outcome: "ended", wavesSurvived: 1, newRecord: true });
    await ann.playerState((v) => v.kind === "siege" && v.phase === "podium" && !!v.result);
    const csv = await resultsCsv();
    expect(csv).toContain("Nickname,Correct,Wrong,Accuracy %,Gold earned,Gold spent");
    expect(csv).toContain("Wave,Difficulty scale %,Defense gold,Strength boost,Monster budget,Monster health ×,Monsters sent,Class accuracy %,Hearts lost");
    expect(csv).toContain(",Ended,1,");
    const records = JSON.parse(await Bun.file(`${t.dir}/siege-records.json`).text());
    expect(records[quiz.id]).toMatchObject({ waves: 1, avgScale: 100 });

    // Play again keeps Kingdom Siege and Endless, and the next run knows the record.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    const siegeAgain = await host.hostState((v) => v.kind === "lobby" && v.mode === "siege" && v.settings.siege.waves === "endless");
    expect(siegeAgain.view.kind === "lobby" && siegeAgain.view.settings.siege.theme).toBe("classic");
    for (const [i, p] of players.entries()) {
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    host.sendMsg({ type: "host.start", pacing: "manual" });
    await host.hostState((v) => v.kind === "siege" && v.phase === "countdown");
    host.sendMsg({ type: "host.end" });
    const again = await host.hostState((v) => v.kind === "siege" && v.phase === "podium");
    expect(again.view.kind === "siege" && again.view.result).toMatchObject({ newRecord: false, record: { waves: 1 } });
    host.sendMsg({ type: "host.close" });
    players.forEach((s) => s.close());
    host.close();
  });
});

describe("Game mode: Land Grab", () => {
  test("lobby → answer 3 → place tiles → done → timer → podium", async () => {
    const quiz = await store.create({
      title: "Land E2E",
      questions: [1, 2, 3].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0] })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    host.sendMsg({ type: "host.setMode", mode: "land" });
    host.sendMsg({ type: "host.setModeSettings", mode: "land", settings: { teams: 1, minutes: 3 } });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("between 2 and 6") });
    host.sendMsg({ type: "host.setModeSettings", mode: "land", settings: { teams: 2, minutes: 3, theme: "classic" } });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "land" && v.settings.land.minutes === 3 && v.settings.land.theme === "classic");
    host.sendMsg({ type: "host.setModeSettings", mode: "land", settings: { teams: 2, minutes: 3, theme: "christmas" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.land.theme === "christmas");

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const lobby = await host.hostState((v) => v.kind === "lobby" && !!v.teams && v.players.length === 2);
    expect(lobby.view.kind === "lobby" && lobby.view.teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["Ann"], ["Bob"]]);

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const started = await host.hostState((v) => v.kind === "land" && v.phase === "countdown");
    expect(started.view.kind === "land" && started.view.board.size).toBe(10);
    expect(started.view.kind === "land" && started.view.theme).toBe("christmas");
    host.sendMsg({ type: "host.next" });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: expect.stringContaining("Land Grab") });
    clock.advance(LAND_COUNTDOWN_MS);
    hub.broadcast();

    // Ann answers her three questions correctly, then is on the land with 3 tiles to place.
    const ann = players[0]!;
    for (let i = 0; i < 3; i++) {
      const st = await ann.playerState((v) => v.kind === "land" && v.phase === "playing" && !!v.question && !v.feedback);
      const q = st.view.kind === "land" ? st.view.question! : null;
      ann.sendMsg({ type: "land.answer", seq: q!.seq, option: 0 });
      await ann.playerState((v) => v.kind === "land" && v.feedback?.seq === q!.seq);
      clock.advance(FEEDBACK_MS);
      hub.broadcast();
    }
    const claiming = await ann.playerState((v) => v.kind === "land" && v.state === "claim" && !v.feedback);
    expect(claiming.view.kind === "land" && [claiming.view.claims, claiming.view.board?.size]).toEqual([3, 10]);
    await host.hostState((v) => v.kind === "land" && v.teams[0]!.members[0]!.claiming);

    // A tile next to Blue's start is refused; grass is taken.
    const blueStart = started.view.kind === "land" ? started.view.board.starts[1]!.tile : 0;
    ann.sendMsg({ type: "land.place", tile: blueStart + 1 });
    await ann.playerState((v) => v.kind === "land" && v.claims === 3);
    ann.sendMsg({ type: "land.place", tile: 0 });
    await ann.playerState((v) => v.kind === "land" && v.claims === 2 && v.board?.owners[0] === 0);
    const placed = await host.hostState((v) => v.kind === "land" && v.lastPlace?.tile === 0);
    expect(placed.view.kind === "land" && placed.view.teams.map((t) => t.tiles)).toEqual([2, 1]);
    await expectInSync(ann);
    ann.sendMsg({ type: "land.done" });
    const back = await ann.playerState((v) => v.kind === "land" && v.state === "question");
    expect(back.view.kind === "land" && [back.view.claims, back.view.board]).toEqual([2, null]);

    // Time runs out.
    clock.advance(3 * 60_000);
    const podium = await host.hostState((v) => v.kind === "land" && v.phase === "podium");
    expect(podium.view.kind === "land" && podium.view.teams.map((t) => [t.name, t.rank, t.tiles])).toEqual([
      ["Red", 1, 2],
      ["Blue", 2, 1],
    ]);
    const bobEnd = await players[1]!.playerState((v) => v.kind === "land" && v.phase === "podium");
    expect(bobEnd.view.kind === "land" && bobEnd.view.result).toMatchObject({ teamRank: 2, teamCount: 2, tiles: 1, won: false });
    const csv = await resultsCsv();
    expect(csv).toContain("Red,1,2,,Ann,3,0,100,1,0,0");

    // Play again keeps Land Grab and its settings.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "land" && v.settings.land.minutes === 3);
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Racer", () => {
  test("lobby → lever → go → answers → reveal → auto pacing → skip → end → results", async () => {
    const quiz = await store.create({
      title: "Racer E2E",
      questions: [1, 2, 3].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0], timeLimitSec: 10 })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "racer" });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "racer" && v.teams === null);

    host.sendMsg({ type: "host.setModeSettings", mode: "racer", settings: { theme: "christmas" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.racer.theme === "christmas");

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    await host.hostState((v) => v.kind === "lobby" && v.players.length === 2);

    // Straight into turn 1: one of them drives, the options are hidden.
    host.sendMsg({ type: "host.start", pacing: "manual" });
    const started = await host.hostState((v) => v.kind === "racer" && v.phase === "confidence");
    const first = started.view.kind === "racer" ? started.view : null;
    expect(first).toMatchObject({ theme: "christmas", pacing: "manual", lever: "low", confidence: null, playerCount: 2, car: { speed: 30, crashed: false } });
    expect(first!.question).toMatchObject({ index: 0, total: 3, text: "Q1", options: [] });
    const driverName = first!.driver!.nickname;
    const driver = players[names.indexOf(driverName)]!;
    const other = players[1 - names.indexOf(driverName)]!;
    await driver.playerState((v) => v.kind === "racer" && v.phase === "confidence" && v.theme === "christmas" && v.isDriver);
    await other.playerState((v) => v.kind === "racer" && v.phase === "confidence" && !v.isDriver && v.driver?.nickname === driverName);

    // Only the driver has the lever: the other phone's attempts are rejected and its state is sent again.
    other.msgs.length = 0;
    other.sendMsg({ type: "racer.lever", level: "high" });
    other.sendMsg({ type: "racer.go" });
    await other.playerState((v) => v.kind === "racer" && v.phase === "confidence" && v.lever === "low");
    await other.playerState((v) => v.kind === "racer" && v.phase === "confidence" && v.lever === "low");
    expect(hub.game instanceof RacerGame && [hub.game.phase, hub.game.lever]).toEqual(["confidence", "low"]);

    driver.sendMsg({ type: "racer.lever", level: "mid" });
    await host.hostState((v) => v.kind === "racer" && v.lever === "mid" && v.confidence === null);
    await other.playerState((v) => v.kind === "racer" && v.lever === "mid");
    driver.sendMsg({ type: "racer.go" });
    const open = await host.hostState((v) => v.kind === "racer" && v.phase === "open");
    expect(open.view.kind === "racer" && [open.view.confidence, open.view.question!.options]).toEqual(["mid", ["right", "wrong"]]);

    // Classic-only host controls say which mode is in the way.
    host.sendMsg({ type: "host.setShuffle", questions: true, answers: true });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Not available in Racer" });

    // Everyone right at "Confident": +20 mph.
    for (const p of players) {
      await p.playerState((v) => v.kind === "racer" && v.phase === "open" && v.question!.options.length === 2);
      p.sendMsg({ type: "racer.answer", index: 0, option: 0 });
    }
    const reveal = await host.hostState((v) => v.kind === "racer" && v.phase === "reveal");
    expect(reveal.view.kind === "racer" && reveal.view).toMatchObject({
      correct: [0],
      answerCounts: [2, 0],
      answeredCount: 2,
      car: { speed: 50, crashed: false, topSpeed: 50 },
      lastTurn: { index: 0, driver: { nickname: driverName }, confidence: "mid", correct: 2, total: 2, gain: 20, fails: 0, speedBefore: 30, speedAfter: 50 },
    });
    const mine = await other.playerState((v) => v.kind === "racer" && v.phase === "reveal");
    expect(mine.view.kind === "racer" && mine.view).toMatchObject({
      reveal: { choice: 0, correct: [0], wasCorrect: true },
      me: { correct: 1 },
      car: { speed: 50 },
    });

    // Pacing can change mid-game: on auto the reveal moves on by itself.
    host.sendMsg({ type: "host.setPacing", pacing: "auto" });
    await host.hostState((v) => v.kind === "racer" && v.phase === "reveal" && v.pacing === "auto");
    clock.advance(AUTO_REVEAL_MS);
    hub.broadcast();
    const second = await host.hostState((v) => v.kind === "racer" && v.phase === "confidence" && v.question?.index === 1);
    expect(second.view.kind === "racer" && second.view.driver!.nickname).not.toBe(driverName);

    // The host skips the lever (locked on "Not confident"), then closes the question with one wrong answer in.
    host.sendMsg({ type: "host.skip" });
    await host.hostState((v) => v.kind === "racer" && v.phase === "open" && v.confidence === "low");
    await players[0]!.playerState((v) => v.kind === "racer" && v.phase === "open");
    players[0]!.sendMsg({ type: "racer.answer", index: 1, option: 1 });
    await host.hostState((v) => v.kind === "racer" && v.phase === "open" && v.answeredCount === 1);
    host.sendMsg({ type: "host.skip" });
    const failed = await host.hostState((v) => v.kind === "racer" && v.phase === "reveal" && v.lastTurn?.index === 1);
    expect(failed.view.kind === "racer" && failed.view).toMatchObject({
      car: { speed: 25, crashed: false },
      lastTurn: { correct: 0, total: 2, fails: 1, speedBefore: 50, speedAfter: 25 },
    });
    // Too late: the answer is rejected and the phone gets its state again.
    await players[1]!.playerState((v) => v.kind === "racer" && v.phase === "reveal");
    players[1]!.msgs.length = 0;
    players[1]!.sendMsg({ type: "racer.answer", index: 1, option: 0 });
    const late = await players[1]!.playerState((v) => v.kind === "racer");
    expect(late.view.kind === "racer" && late.view).toMatchObject({ phase: "reveal", myChoice: null, reveal: { choice: null, wasCorrect: false } });

    // Next question, then the host ends the game before it opens: that turn is dropped.
    host.sendMsg({ type: "host.next" });
    await host.hostState((v) => v.kind === "racer" && v.phase === "confidence" && v.question?.index === 2);
    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "racer" && v.phase === "podium");
    expect(podium.view.kind === "racer" && podium.view).toMatchObject({
      result: { distance: 12.5, topSpeed: 50, crashes: 0, turns: 2 },
      awards: { mostCorrect: { value: 1, nicknames: ["Ann", "Bob"] }, bestDriver: { value: 20, nicknames: [driverName] } },
      errors: [{ wrong: 1, text: "Q2", answers: ["right"] }],
    });
    const end = await driver.playerState((v) => v.kind === "racer" && v.phase === "podium" && !!v.result);
    expect(end.view.kind === "racer" && end.view.result).toEqual({
      distance: 12.5,
      topSpeed: 50,
      crashes: 0,
      turns: 2,
      awards: ["Most correct answers", "Best driver"],
    });
    const csv = await resultsCsv();
    expect(csv).toContain("Nickname,Correct,Wrong,Accuracy %,Turns driven,Mph gained,Fail points as driver");
    expect(csv).toContain("Ann,1,1,50,1,");
    expect(csv).toContain(",12.5,50,0");

    // Play again keeps Racer and the pacing.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "racer" && v.pacing === "auto" && v.settings.racer.theme === "christmas");
    host.sendMsg({ type: "host.setPacing", pacing: "manual" });
    await host.hostState((v) => v.kind === "lobby" && v.pacing === "manual");
    host.sendMsg({ type: "host.close" });
    await host.hostState((v) => v.kind === "idle");
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Game mode: Showdown", () => {
  test("lobby rounds → start → duel.answer → reveal → next → end → results", async () => {
    const quiz = await store.create({
      title: "Showdown E2E",
      questions: [1, 2].map((n) => ({ type: "multiple_choice", text: `Q${n}`, options: ["right", "wrong"], correct: [0], timeLimitSec: 10 })),
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "duel" });
    await host.hostState(
      (v) => v.kind === "lobby" && v.mode === "duel" && v.settings.duel.rounds === 15 && v.settings.duel.theme === "christmas" && v.teams === null,
    );
    host.sendMsg({ type: "host.setModeSettings", mode: "duel", settings: { rounds: 7 } });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unsupported number of rounds" });
    host.sendMsg({ type: "host.setModeSettings", mode: "duel", settings: { rounds: 10, theme: "classic" } });
    await host.hostState((v) => v.kind === "lobby" && v.settings.duel.rounds === 10 && v.settings.duel.theme === "classic");

    const names = ["Ann", "Bob"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    await host.hostState((v) => v.kind === "lobby" && v.players.length === 2);

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const started = await host.hostState((v) => v.kind === "duel" && v.phase === "intro");
    expect(started.view.kind === "duel" && started.view).toMatchObject({
      theme: "classic",
      round: 1,
      rounds: 10,
      playerCount: 2,
      question: { index: 0, total: 10, text: "Q1", options: [] },
    });
    host.sendMsg({ type: "host.setShuffle", questions: true, answers: true });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Not available in Showdown" });
    const ann = await players[0]!.playerState((v) => v.kind === "duel" && v.phase === "intro");
    expect(ann.view.kind === "duel" && ann.view.theme).toBe("classic");
    expect(ann.view.kind === "duel" && ann.view.opponents.map((o) => o.nickname)).toEqual(["Bob"]);

    // Ann right, Bob wrong: Ann wins Arena 1 and tops the ladder.
    host.sendMsg({ type: "host.skip" });
    await players[0]!.playerState((v) => v.kind === "duel" && v.phase === "open" && v.question!.options.length === 2);
    players[0]!.sendMsg({ type: "duel.answer", index: 0, option: 0 });
    await host.hostState((v) => v.kind === "duel" && v.phase === "open" && v.answeredCount === 1);
    await players[1]!.playerState((v) => v.kind === "duel" && v.phase === "open");
    players[1]!.sendMsg({ type: "duel.answer", index: 0, option: 1 });
    const reveal = await host.hostState((v) => v.kind === "duel" && v.phase === "reveal");
    expect(reveal.view.kind === "duel" && reveal.view).toMatchObject({
      correct: [0],
      lastRound: { round: 1 },
      players: [
        { nickname: "Ann", rank: 1, wins: 1, reign: 1 },
        { nickname: "Bob", rank: 2, losses: 1 },
      ],
    });
    const mine = await players[1]!.playerState((v) => v.kind === "duel" && v.phase === "reveal");
    expect(mine.view.kind === "duel" && mine.view).toMatchObject({ reveal: { choice: 1, correct: [0], wasCorrect: false }, myDuel: { arena: 1, draw: false } });

    host.sendMsg({ type: "host.next" });
    await host.hostState((v) => v.kind === "duel" && v.phase === "intro" && v.round === 2);
    host.sendMsg({ type: "host.end" });
    const podium = await host.hostState((v) => v.kind === "duel" && v.phase === "podium");
    expect(podium.view.kind === "duel" && podium.view).toMatchObject({
      awards: { longestReign: { value: 1, nicknames: ["Ann"] } },
      errors: [{ wrong: 1, text: "Q1" }],
    });
    const end = await players[0]!.playerState((v) => v.kind === "duel" && v.phase === "podium" && !!v.result);
    expect(end.view.kind === "duel" && end.view.result).toEqual({ rank: 1, playerCount: 2, awards: ["Longest reign", "Most wins"] });
    const csv = await resultsCsv();
    expect(csv).toContain("Rank,Nickname,Points,Final arena,Start arena,Wins,Losses,Draws,Rounds won in Arena 1,Correct,Wrong,R1 answer (Q1)");
    expect(csv).toContain("1,Ann,1,1,1,1,0,0,1,1,0,right,yes,");

    // Play again keeps Showdown and its rounds.
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "duel" && v.settings.duel.rounds === 10 && v.settings.duel.theme === "classic");
    host.sendMsg({ type: "host.close" });
    await host.hostState((v) => v.kind === "idle");
    [host, ...players].forEach((s) => s.close());
  });
});

describe("Phone attachment", () => {
  test.each([false, true])("reassignment across the Lobby handoff with a second attachment: %s", async (keepSecondPhone) => {
    const quiz = await store.create({ title: "Attachment", questions: [{ type: "true_false", text: "True?", correct: [0] }] });
    const host = new HubSocket(hub, { admin: true });
    const first = new HubSocket(hub);
    const second = new HubSocket(hub);
    const replacement = new HubSocket(hub);
    try {
      host.sendMsg({ type: "host.hello" });
      host.sendMsg({ type: "host.open", quizId: quiz.id });
      first.sendMsg({ type: "join", nickname: "Ann" });
      const ann = await first.waitFor((m) => m.type === "joined");
      replacement.sendMsg({ type: "join", nickname: "Bob" });
      const bob = await replacement.waitFor((m) => m.type === "joined");
      replacement.close();

      if (keepSecondPhone) {
        second.sendMsg({ type: "resume", token: ann.token });
        expect(await second.waitFor((m) => m.type === "joined")).toMatchObject({ playerId: ann.playerId });
      }

      host.sendMsg({ type: "host.start", pacing: "manual" });
      await host.hostState((v) => v.kind === "classic");
      first.sendMsg({ type: "resume", token: bob.token });
      expect(await first.waitFor((m) => m.type === "joined")).toMatchObject({ playerId: bob.playerId });
      const switched = await host.hostState((v) => v.kind === "classic" && v.players.some((p) => p.id === bob.playerId && p.connected));
      expect(switched.view).toMatchObject({
        players: [
          { id: ann.playerId, connected: keepSecondPhone },
          { id: bob.playerId, connected: true },
        ],
      });

      if (keepSecondPhone) {
        second.close();
        await host.hostState((v) => v.kind === "classic" && v.players.some((p) => p.id === ann.playerId && !p.connected));
      }
    } finally {
      [host, first, second, replacement].forEach((socket) => socket.close());
    }
  });
});

describe("Lobby handoff", () => {
  test("the host moves a player to another team; the phone follows and the game starts with it", async () => {
    const quiz = await store.create({
      title: "Teams E2E",
      questions: [{ type: "multiple_choice", text: "Q1", options: ["right", "wrong"], correct: [0] }],
    });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby");
    host.sendMsg({ type: "host.setMode", mode: "tower" });
    host.sendMsg({ type: "host.setModeSettings", mode: "tower", settings: { teams: 2, minutes: 2 } });
    await host.hostState((v) => v.kind === "lobby" && v.mode === "tower" && v.settings.tower.minutes === 2);

    const names = ["Ann", "Bob", "Cy"];
    const players = names.map(() => new HubSocket(hub));
    for (const [i, p] of players.entries()) {
      await p.playerState((v) => v.kind === "none" && !!v.game);
      p.sendMsg({ type: "join", nickname: names[i]! });
      await p.waitFor((m) => m.type === "joined");
    }
    const lobby = await host.hostState((v) => v.kind === "lobby" && !!v.teams && v.players.length === 3);
    const ann = lobby.view.kind === "lobby" ? lobby.view.players.find((p) => p.nickname === "Ann")! : null;
    await players[0]!.playerState((v) => v.kind === "lobby" && v.team?.name === "Red");

    host.sendMsg({ type: "host.setTeam", playerId: ann!.id, team: 1 });
    const moved = await host.hostState((v) => v.kind === "lobby" && !!v.teams && v.teams[1]!.members.length === 2);
    expect(moved.view.kind === "lobby" && moved.view.teams!.map((t) => t.members.map((m) => m.nickname))).toEqual([["Cy"], ["Ann", "Bob"]]);
    const annLobby = await players[0]!.playerState((v) => v.kind === "lobby" && v.team?.name === "Blue");
    expect(annLobby.view.kind === "lobby" && annLobby.view.team?.index).toBe(1);

    host.sendMsg({ type: "host.setTeam", playerId: ann!.id, team: 2 });
    expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unknown team" });

    host.sendMsg({ type: "host.start", pacing: "manual" });
    const tower = await host.hostState((v) => v.kind === "tower" && v.phase === "countdown");
    expect(tower.view.kind === "tower" && tower.view.teams.map((t) => t.members.map((m) => m.nickname))).toEqual([["Cy"], ["Ann", "Bob"]]);
    const annTower = await players[0]!.playerState((v) => v.kind === "tower");
    expect(annTower.view.kind === "tower" && annTower.view.team.name).toBe("Blue");

    host.sendMsg({ type: "host.end" });
    await host.hostState((v) => v.kind === "tower" && v.phase === "podium");
    host.sendMsg({ type: "host.close" });
    [host, ...players].forEach((s) => s.close());
  });

  test("resume with an unknown token fails cleanly", async () => {
    const s = new HubSocket(hub);
    s.sendMsg({ type: "resume", token: "nope" });
    await s.waitFor((m) => m.type === "resumeFailed");
    s.close();
  });

  test("an empty lobby can retry Start after a player joins", async () => {
    const quiz = await store.create({ title: "Retry Start", questions: [{ type: "true_false", text: "True?", correct: [0] }] });
    const host = new HubSocket(hub, { admin: true });
    const phone = new HubSocket(hub);
    try {
      host.sendMsg({ type: "host.hello" });
      host.sendMsg({ type: "host.open", quizId: quiz.id });
      host.sendMsg({ type: "host.setMode", mode: "gift" });
      await host.hostState((v) => v.kind === "lobby" && v.mode === "gift" && v.players.length === 0);
      host.sendMsg({ type: "host.start", pacing: "manual" });
      expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Wait for at least one player to join" });

      phone.sendMsg({ type: "join", nickname: "Noel" });
      const joined = await phone.waitFor((m) => m.type === "joined");
      await host.hostState((v) => v.kind === "lobby" && v.players.some((p) => p.id === joined.playerId));
      host.sendMsg({ type: "host.start", pacing: "manual" });
      const countdown = await host.hostState((v) => v.kind === "gift" && v.phase === "countdown");
      expect(countdown.view).toMatchObject({ standings: [{ id: joined.playerId, nickname: "Noel", connected: true }] });
      await phone.playerState((v) => v.kind === "gift" && v.phase === "countdown");
    } finally {
      host.sendMsg({ type: "host.close" });
      await host.hostState((v) => v.kind === "idle");
      host.close();
      phone.close();
    }
  });
});

describe("Game mode: Gift Grab", () => {
  test("lobby settings, earned bonus, reconnect, standings and CSV", async () => {
    const quiz = await store.create({
      title: "Gift Grab E2E",
      questions: [{ type: "true_false", text: "True?", correct: [0] }],
    });
    const host = new HubSocket(hub, { admin: true });
    const player = new HubSocket(hub);
    let resumed: HubSocket | undefined;
    try {
      host.sendMsg({ type: "host.hello" });
      host.sendMsg({ type: "host.open", quizId: quiz.id });
      await host.hostState((v) => v.kind === "lobby");
      host.sendMsg({ type: "host.setMode", mode: "gift" });
      await host.hostState((v) => v.kind === "lobby" && v.mode === "gift" && v.settings.gift.minutes === 5);
      host.sendMsg({ type: "host.setModeSettings", mode: "gift", settings: { minutes: 4 } });
      expect(await host.waitFor((m) => m.type === "error")).toMatchObject({ message: "Unsupported game length" });
      host.sendMsg({ type: "host.setModeSettings", mode: "gift", settings: { minutes: 3 } });
      player.sendMsg({ type: "join", nickname: "Noel" });
      const joined = await player.waitFor((m) => m.type === "joined");
      await host.hostState((v) => v.kind === "lobby" && v.settings.gift.minutes === 3 && v.players.length === 1);
      host.sendMsg({ type: "host.start", pacing: "manual" });
      await host.hostState((v) => v.kind === "gift" && v.phase === "countdown");
      clock.advance(3_000);
      for (let i = 1; i <= 5; i++) {
        const state = await player.playerState((v) => v.kind === "gift" && v.question?.seq === i);
        if (state.view.kind !== "gift") throw new Error("Expected Gift Grab view");
        player.sendMsg({ type: "gift.answer", seq: state.view.question!.seq, option: 0 });
        await player.playerState((v) => v.kind === "gift" && v.feedback?.seq === i);
        clock.advance(FEEDBACK_MS);
        hub.broadcast();
      }
      const earned = await player.playerState((v) => v.kind === "gift" && v.bonus !== null);
      if (earned.view.kind !== "gift" || joined.type !== "joined") throw new Error("Expected joined Gift Grab player");
      const bonus = earned.view.bonus!;
      const item = bonus.items.find((candidate) => GIFT_GOODS.some((kind) => kind === candidate.kind))!;
      clock.advance(GIFT_READY_MS + item.from);
      player.sendMsg({ type: "gift.tap", round: bonus.round, item: item.id });
      await player.playerState((v) => v.kind === "gift" && v.score === 10);
      await host.hostState((v) => v.kind === "gift" && v.standings[0]?.score === 10 && v.standings[0]?.inBonus);

      player.close();
      resumed = new HubSocket(hub);
      resumed.sendMsg({ type: "resume", token: joined.token });
      const restored = await resumed.playerState((v) => v.kind === "gift");
      expect(restored.view).toMatchObject({ score: 10, bonus: { round: 1, hits: [{ item: item.id, delta: 10 }] } });
      host.sendMsg({ type: "host.end" });
      await host.hostState((v) => v.kind === "gift" && v.phase === "podium");
      await resumed.playerState((v) => v.kind === "gift" && v.phase === "podium" && v.rank === 1);
      expect(await resultsCsv()).toContain("1,Noel,10,5,0,1,1,0,0");

      host.sendMsg({ type: "host.open", quizId: quiz.id });
      await host.hostState((v) => v.kind === "lobby" && v.mode === "gift" && v.settings.gift.minutes === 3);
    } finally {
      host.sendMsg({ type: "host.close" });
      await host.hostState((v) => v.kind === "idle");
      host.close();
      player.close();
      resumed?.close();
    }
  });
});

describe("Protect from abuse", () => {
  test("Protect from abuse is on by default, toggles in the lobby and carries over to the next lobby", async () => {
    const quiz = await store.create({ title: "Protect", questions: [{ type: "true_false", text: "Fire is cold", correct: [1] }] });
    const host = new HubSocket(hub, { admin: true });
    host.sendMsg({ type: "host.hello" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && v.protect);
    host.sendMsg({ type: "host.setProtect", on: false });
    await host.hostState((v) => v.kind === "lobby" && !v.protect);
    host.sendMsg({ type: "host.close" });
    await host.hostState((v) => v.kind === "idle");
    host.sendMsg({ type: "host.open", quizId: quiz.id });
    await host.hostState((v) => v.kind === "lobby" && !v.protect);
    host.sendMsg({ type: "host.setProtect", on: true });
    await host.hostState((v) => v.kind === "lobby" && v.protect);
    host.sendMsg({ type: "host.close" });
    await host.hostState((v) => v.kind === "idle");
    host.close();
  });
});

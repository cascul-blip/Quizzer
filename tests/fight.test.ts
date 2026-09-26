import { describe, expect, test } from "bun:test";
import { COLLAPSE_MS, COUNTDOWN_MS, DECISION_GRACE_MS, FEEDBACK_MS, FightGame, RESULT_MS, type FightPlayer } from "../src/server/game/fight.ts";
import { Game } from "../src/server/game/game.ts";
import { buildFightResultsCsv } from "../src/server/game/results.ts";
import { MAX_PULL, launchVector, simulate } from "../src/shared/fight-physics.ts";
import { CORRECT_PER_DECISION, DECISION_MS, REPAIR_MS, TOWER_MAX_DAMAGE } from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe"],
      correct: [0],
    })),
  });
}

function setup(names: string[], hill: "low" | "medium" | "high" | "random" = "medium") {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock });
  lobby.setMode("fight");
  lobby.setFight({ hill });
  for (const n of names) lobby.join(n);
  const game = FightGame.fromLobby(lobby, { clock, onFinish: () => finished++ });
  game.start();
  clock.advance(COUNTDOWN_MS);
  expect(game.phase).toBe("playing");
  return { clock, game, lobby, finished: () => finished };
}

const byName = (game: FightGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: FightGame, clock: FakeClock, p: FightPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

function earnDecision(game: FightGame, clock: FakeClock, p: FightPlayer) {
  for (let i = 0; i < CORRECT_PER_DECISION; i++) answer(game, clock, p, true);
}

/** Find a pull that sends `team`'s shot onto the given tower (on the game's current terrain). */
function pullFor(game: FightGame, team: number, target: number | "ground") {
  for (let angle = -80; angle <= 260; angle += 1) {
    for (let pull = 20; pull <= MAX_PULL; pull += 3) {
      const rad = (angle * Math.PI) / 180;
      const dx = -Math.cos(rad) * pull;
      const dy = -Math.sin(rad) * pull;
      const v = launchVector(dx, dy)!;
      const { impact, durationMs } = simulate(game.terrain, team, v.vx, v.vy);
      if (target === "ground" ? impact.kind === "ground" : impact.kind === "tower" && impact.team === target) return { dx, dy, durationMs };
    }
  }
  throw new Error("no pull found");
}

/** Earn a decision, attack, and wait for the shot to land and the result to pass. */
function shoot(game: FightGame, clock: FakeClock, p: FightPlayer, target: number | "ground") {
  earnDecision(game, clock, p);
  if (p.state === "decide") expect(game.choose(p.id, "attack")).toBe(true);
  const { dx, dy, durationMs } = pullFor(game, p.team, target);
  expect(game.fire(p.id, dx, dy)).not.toBeNull();
  clock.advance(durationMs + RESULT_MS);
}

describe("lobby → fight", () => {
  test("always Red vs Blue, split by join order, with a preview in the lobby", () => {
    const clock = new FakeClock();
    const lobby = new Game(quiz(), { clock });
    lobby.setMode("fight");
    for (const n of ["A", "B", "C"]) lobby.join(n);
    expect(lobby.hostView().teams!.map((t) => [t.name, t.members.map((m) => m.nickname)])).toEqual([
      ["Red", ["A", "C"]],
      ["Blue", ["B"]],
    ]);
    const game = FightGame.fromLobby(lobby, { clock });
    expect(game.teams.map((t) => t.name)).toEqual(["Red", "Blue"]);
    expect([...game.players.values()].map((p) => p.team)).toEqual([0, 1, 0]);
  });

  test("late joiners go to the smaller team", () => {
    const { game } = setup(["A", "B", "C"]);
    expect(game.join("D").team).toBe(1);
    expect(game.join("E").team).toBe(0);
  });

  test("hill setting: fixed or random", () => {
    expect(setup(["A"], "high").game.hill).toBe("high");
    expect(["low", "medium", "high"]).toContain(setup(["A"], "random").game.hill);
    const lobby = new Game(quiz());
    expect(() => lobby.setFight({ hill: "huge" as never })).toThrow();
  });
});

describe("decisions", () => {
  test("every 4th correct answer earns a decision; wrong answers don't reset the count", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    answer(game, clock, a, true);
    answer(game, clock, a, false);
    answer(game, clock, a, true);
    answer(game, clock, a, true);
    expect(a.state).toBe("question");
    expect(game.playerView(a.id)!.towardDecision).toBe(3);
    answer(game, clock, a, true);
    // Undamaged tower: nothing to rebuild, straight to the catapult (no time limit there).
    expect(a.state).toBe("aim");
    expect(game.playerView(a.id)!.question).toBeNull();
    expect(game.playerView(a.id)!.decisionMs).toBe(0);
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
  });

  test("with a damaged tower the player chooses; rebuild takes REPAIR_MS, then repairs one damage", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    shoot(game, clock, b, 0);
    expect(game.teams[0]!.damage).toBe(1);
    earnDecision(game, clock, a);
    expect(a.state).toBe("decide");
    expect(game.choose(a.id, "rebuild")).toBe(true);
    expect(a.state).toBe("repair");
    expect(game.playerView(a.id)!.repairMs).toBe(REPAIR_MS);
    expect(game.hostView().teams.map((t) => t.repairing)).toEqual([true, false]);
    // No questions while repairing, and the decide timer no longer applies.
    expect(game.playerView(a.id)!.question).toBeNull();
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    clock.advance(REPAIR_MS - 1);
    expect(game.teams[0]!.damage).toBe(1);
    expect(a.rebuilds).toBe(0);
    clock.advance(1);
    expect(game.teams[0]!.damage).toBe(0);
    expect(a.rebuilds).toBe(1);
    expect(a.state).toBe("question");
    expect(game.playerView(a.id)!.lastRepair).toMatchObject({ repaired: true });
    expect(game.hostView().teams[0]!.repairing).toBe(false);
    expect(game.hostView().events.at(-1)).toMatchObject({ kind: "rebuild", nickname: "A", team: 0 });
  });

  test("a repair is wasted if teammates already fixed the tower", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n)) as [FightPlayer, FightPlayer, FightPlayer];
    shoot(game, clock, b, 0);
    earnDecision(game, clock, a);
    earnDecision(game, clock, c);
    expect(game.choose(a.id, "rebuild")).toBe(true);
    clock.advance(100);
    // Both can start: the tower is still damaged until A finishes.
    expect(game.choose(c.id, "rebuild")).toBe(true);
    clock.advance(REPAIR_MS);
    expect(game.teams[0]!.damage).toBe(0);
    expect(a.rebuilds).toBe(1);
    expect(c.rebuilds).toBe(0);
    expect(c.state).toBe("question");
    expect(game.playerView(c.id)!.lastRepair).toMatchObject({ repaired: false });
  });

  test("a repair never lands if the tower falls first", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    const b = byName(game, "B");
    for (let i = 0; i < TOWER_MAX_DAMAGE - 1; i++) shoot(game, clock, b, 0);
    earnDecision(game, clock, a);
    earnDecision(game, clock, b);
    expect(game.choose(a.id, "rebuild")).toBe(true);
    const { dx, dy, durationMs } = pullFor(game, 1, 0);
    expect(durationMs).toBeLessThan(REPAIR_MS);
    game.fire(b.id, dx, dy);
    clock.advance(durationMs);
    expect(game.phase).toBe("collapse");
    clock.advance(REPAIR_MS);
    expect(game.teams[0]!.damage).toBe(TOWER_MAX_DAMAGE);
    expect(a.rebuilds).toBe(0);
  });

  test("taking too long to choose attack or rebuild forfeits the move", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    shoot(game, clock, byName(game, "B"), 0);
    earnDecision(game, clock, a);
    expect(a.state).toBe("decide");
    expect(game.playerView(a.id)!.decisionMs).toBe(DECISION_MS - FEEDBACK_MS);
    clock.advance(DECISION_MS + DECISION_GRACE_MS);
    expect(a.state).toBe("question");
    expect(game.choose(a.id, "attack")).toBeNull();
    expect(a.shots).toBe(0);
  });

  test("aiming has no time limit, whether chosen or skipped to", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    earnDecision(game, clock, a);
    expect(a.state).toBe("aim");
    clock.advance(DECISION_MS * 10);
    expect(a.state).toBe("aim");
    expect(game.fire(a.id, -100, -100)).not.toBeNull();

    const s = setup(["C", "D"]);
    const c = byName(s.game, "C");
    shoot(s.game, s.clock, byName(s.game, "D"), 0);
    earnDecision(s.game, s.clock, c);
    s.clock.advance(DECISION_MS - FEEDBACK_MS - 1);
    expect(s.game.choose(c.id, "attack")).toBe(true);
    s.clock.advance(DECISION_MS * 10);
    expect(c.state).toBe("aim");
    expect(s.game.playerView(c.id)!.decisionMs).toBe(0);
    expect(s.game.fire(c.id, -100, -100)).not.toBeNull();
  });

  test("a too-short pull is rejected and the player can aim again", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    earnDecision(game, clock, a);
    expect(game.fire(a.id, 2, 2)).toBeNull();
    expect(a.state).toBe("aim");
  });
});

describe("shots", () => {
  test("damage lands when the shot arrives, then the thrower returns to questions", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    earnDecision(game, clock, a);
    const { dx, dy, durationMs } = pullFor(game, 0, 1);
    const shot = game.fire(a.id, dx, dy)!;
    expect(shot.impact).toMatchObject({ kind: "tower", team: 1 });
    expect(a.state).toBe("watch");
    expect(game.playerView(a.id)!.shot?.id).toBe(shot.id);
    expect(game.hostView().shots.map((s) => s.id)).toEqual([shot.id]);
    clock.advance(durationMs - 1);
    expect(game.teams[1]!.damage).toBe(0);
    clock.advance(1);
    expect(game.teams[1]!.damage).toBe(1);
    expect(a.hits).toBe(1);
    expect(a.state).toBe("watch");
    clock.advance(RESULT_MS);
    expect(a.state).toBe("question");
    expect(game.hostView().events.at(-1)).toMatchObject({ kind: "hit", nickname: "A" });
  });

  test("friendly fire damages your own tower but doesn't count as a hit", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    shoot(game, clock, a, 0);
    expect(game.teams[0]!.damage).toBe(1);
    expect(a.hits).toBe(0);
    expect(a.friendlyHits).toBe(1);
    expect(game.hostView().events.at(-1)!.kind).toBe("friendly");
  });

  test("ground hits carve a crater", () => {
    const { game, clock } = setup(["A", "B"]);
    const a = byName(game, "A");
    earnDecision(game, clock, a);
    const { dx, dy, durationMs } = pullFor(game, 0, "ground");
    const before = [...game.terrain];
    const shot = game.fire(a.id, dx, dy)!;
    clock.advance(durationMs);
    expect(game.terrain).not.toEqual(before);
    const i = Math.round(shot.impact.x / 5);
    expect(game.terrain[i]!).toBeLessThan(before[i]!);
  });
});

describe("end of game", () => {
  test("the 5th hit collapses the tower, then the podium: the other team wins", () => {
    const { game, clock, finished } = setup(["A", "B"]);
    const a = byName(game, "A");
    for (let i = 0; i < TOWER_MAX_DAMAGE - 1; i++) shoot(game, clock, a, 1);
    expect(game.phase).toBe("playing");
    earnDecision(game, clock, a);
    const { dx, dy, durationMs } = pullFor(game, 0, 1);
    game.fire(a.id, dx, dy);
    clock.advance(durationMs);
    expect(game.phase).toBe("collapse");
    expect(game.hostView().outcome).toEqual({ winner: 0, reason: "destroyed" });
    expect(finished()).toBe(0);
    clock.advance(COLLAPSE_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.playerView(a.id)!.result).toEqual({ outcome: { winner: 0, reason: "destroyed" }, awards: ["Top gunner", "Most correct answers"] });
    expect(game.hostView().awards!.topGunner).toEqual({ value: 5, nicknames: ["A"] });
  });

  test("host end: least damaged tower wins", () => {
    const { game, clock } = setup(["A", "B"]);
    shoot(game, clock, byName(game, "B"), 0);
    game.end();
    expect(game.phase).toBe("podium");
    expect(game.outcome).toEqual({ winner: 1, reason: "damage" });
  });

  test("host end with equal damage: more correct answers wins, otherwise a draw", () => {
    const s = setup(["A", "B"]);
    answer(s.game, s.clock, byName(s.game, "B"), true);
    s.game.end();
    expect(s.game.outcome).toEqual({ winner: 1, reason: "correct" });

    const t = setup(["A", "B"]);
    t.game.end();
    expect(t.game.outcome).toEqual({ winner: null, reason: "draw" });
  });

  test("shots still in the air when a tower falls don't count", () => {
    const { game, clock } = setup(["A", "B", "C"]);
    const a = byName(game, "A");
    const c = byName(game, "C");
    for (let i = 0; i < TOWER_MAX_DAMAGE - 1; i++) shoot(game, clock, a, 1);
    earnDecision(game, clock, a);
    earnDecision(game, clock, c);
    game.choose(c.id, "attack");
    const pa = pullFor(game, 0, 1);
    game.fire(a.id, pa.dx, pa.dy);
    // A slower lob from C, still flying when A's shot lands.
    game.fire(c.id, pa.dx * 0.99, pa.dy * 1.02);
    clock.advance(pa.durationMs);
    expect(game.phase).toBe("collapse");
    clock.advance(5000);
    expect(game.teams[1]!.damage).toBe(TOWER_MAX_DAMAGE);
    expect(c.hits).toBe(0);
  });

  test("results CSV lists the winners first", () => {
    const { game, clock } = setup(["A", "B"]);
    shoot(game, clock, byName(game, "B"), 0);
    game.end();
    const lines = buildFightResultsCsv(game).trim().split("\r\n");
    expect(lines[0]).toContain("Enemy hits");
    expect(lines[1]!.startsWith("Blue,Won,0,B,")).toBe(true);
    expect(lines[2]!.startsWith("Red,Lost,1,A,")).toBe(true);
  });
});

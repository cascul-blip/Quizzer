import { describe, expect, test } from "bun:test";
import { FEEDBACK_MS, SIEGE_NO_GOLD, SiegeGame, type SiegePlayer } from "../src/server/game/siege.ts";
import { Game } from "../src/server/game/game.ts";
import { WRONG_PENALTY_2_MS } from "../src/server/game/stream.ts";
import { buildSiegeResultsCsv } from "../src/server/game/results.ts";
import { loadSiegeRecord, saveSiegeRecord } from "../src/server/siege-records.ts";
import { siegeRecordsPath } from "../src/server/paths.ts";
import { writeFileSync } from "node:fs";
import {
  SIEGE_BREAK_MS,
  SIEGE_COUNTDOWN_MS,
  SIEGE_DEFENDERS,
  SIEGE_ENDING_MS,
  SIEGE_GIANT_WAIT_MS,
  SIEGE_GOLD_PER_CORRECT,
  SIEGE_HEARTS,
  SIEGE_OPENING_MS,
  SIEGE_START_GOLD,
  SIEGE_TICK_MS,
  SIEGE_WARNING_MS,
  siegeBaseBudget,
  siegeClassSizeFactor,
  siegeGiants,
  siegeNextScale,
  siegeSpawnWindowMs,
  siegeTargetScale,
  siegeUpgradeCost,
  siegeWaveBudget,
  type SiegeWaves,
} from "../src/shared/siege-rules.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz, tempDir } from "./helpers.ts";

function quiz(count = 5): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe"],
      correct: [0],
    })),
  });
}

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

const NAMES = ["Ana", "Ben", "Cal", "Dee", "Eve", "Fay"];

function setup({ players = 3, waves = 5 as SiegeWaves, protect = false, seed = 42 } = {}) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(), { clock, protect });
  lobby.setMode("siege");
  lobby.setSiege({ waves });
  for (const n of NAMES.slice(0, players)) lobby.join(n);
  const game = SiegeGame.fromLobby(lobby, { clock, rng: seeded(seed), onFinish: () => finished++ });
  game.start();
  clock.advance(SIEGE_COUNTDOWN_MS);
  expect(game.phase).toBe("build");
  return { clock, game, finished: () => finished };
}

/** Into wave 1 with its own monsters cleared, so a test can bring on exactly the monsters it wants. */
function quietWave(opts: Parameters<typeof setup>[0] = {}) {
  const s = setup(opts);
  s.clock.advance(SIEGE_OPENING_MS);
  expect(s.game.phase).toBe("wave");
  s.game.pending = [];
  return s;
}

const byName = (game: SiegeGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: SiegeGame, clock: FakeClock, p: SiegePlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

describe("rules", () => {
  test("budget, class size factor and the giants", () => {
    expect(siegeBaseBudget(1)).toBe(6);
    expect(siegeBaseBudget(5)).toBe(18);
    expect(siegeBaseBudget(10)).toBe(33);
    expect(siegeBaseBudget(11)).toBe(37);
    expect(siegeBaseBudget(12)).toBe(41);
    expect(siegeClassSizeFactor(1)).toBe(0.7);
    expect(siegeClassSizeFactor(3)).toBe(0.9);
    expect(siegeClassSizeFactor(6)).toBe(1.2);
    expect(siegeClassSizeFactor(20)).toBe(1.4);
    expect(siegeWaveBudget(1, 3, 100)).toBe(5);
    expect(siegeWaveBudget(3, 6, 130)).toBe(19);
    expect(siegeWaveBudget(1, 0, 70)).toBe(3);
    expect([1, 2, 3, 4, 5, 6, 9, 10].map((w) => siegeGiants(w, false))).toEqual([0, 0, 0, 0, 1, 0, 0, 1]);
    expect([5, 10, 15, 20, 21].map((w) => siegeGiants(w, true))).toEqual([1, 1, 2, 2, 0]);
    expect(siegeSpawnWindowMs(1)).toBe(30_000);
    expect(siegeSpawnWindowMs(50)).toBe(60_000);
  });

  test("the adaptive scale: 70% to 130%, at most 20 points per wave, kept without answers", () => {
    expect(siegeTargetScale(0.2)).toBe(70);
    expect(siegeTargetScale(0.4)).toBe(70);
    expect(siegeTargetScale(0.65)).toBe(100);
    expect(siegeTargetScale(0.9)).toBe(130);
    expect(siegeTargetScale(1)).toBe(130);
    expect(siegeNextScale(100, 10, 10)).toBe(120);
    expect(siegeNextScale(120, 10, 10)).toBe(130);
    expect(siegeNextScale(100, 0, 10)).toBe(80);
    expect(siegeNextScale(80, 0, 10)).toBe(70);
    expect(siegeNextScale(100, 13, 20)).toBe(100);
    expect(siegeNextScale(110, 0, 0)).toBe(110);
  });

  test("prices: each upgrade costs more, none past Lv 3", () => {
    expect(SIEGE_DEFENDERS.archer.cost).toEqual([50, 75, 125]);
    expect(SIEGE_DEFENDERS.knight.cost).toEqual([75, 100, 150]);
    expect(SIEGE_DEFENDERS.wall.cost).toEqual([50, 50, 100]);
    expect(siegeUpgradeCost("archer", 1)).toBe(75);
    expect(siegeUpgradeCost("archer", 2)).toBe(125);
    expect(siegeUpgradeCost("archer", 3)).toBeNull();
  });
});

describe("gold and building", () => {
  test("the treasury starts at 100 and only correct answers add gold", () => {
    const { game, clock } = setup();
    expect(game.gold).toBe(SIEGE_START_GOLD);
    const ana = byName(game, "Ana");
    answer(game, clock, ana, true);
    expect(game.gold).toBe(SIEGE_START_GOLD + SIEGE_GOLD_PER_CORRECT);
    answer(game, clock, ana, false);
    expect(game.gold).toBe(SIEGE_START_GOLD + SIEGE_GOLD_PER_CORRECT);
    expect(ana.goldEarned).toBe(25);
    expect(ana.correct).toBe(1);
    expect(ana.wrong).toBe(1);
  });

  test("answers are only taken while playing, not during the countdown", () => {
    const clock = new FakeClock();
    const lobby = new Game(quiz(), { clock });
    lobby.setMode("siege");
    lobby.join("Ana");
    const game = SiegeGame.fromLobby(lobby, { clock, rng: seeded() });
    game.start();
    const ana = byName(game, "Ana");
    expect(ana.current).toBeNull();
    expect(game.place(ana.id, "archer", 0, 1)).not.toBeNull();
    clock.advance(SIEGE_COUNTDOWN_MS);
    expect(ana.current).not.toBeNull();
  });

  test("placing and upgrading spend the shared gold; upgrades add the extra health to what is left", () => {
    const { game, clock } = setup();
    const ana = byName(game, "Ana");
    const ben = byName(game, "Ben");
    expect(game.place(ana.id, "knight", 2, 3)).toBeNull();
    expect(game.gold).toBe(25);
    for (let i = 0; i < 4; i++) answer(game, clock, ben, true);
    expect(game.gold).toBe(125);
    const knight = game.defenderAt(2, 3)!;
    knight.health = 4;
    expect(game.upgrade(ben.id, 2, 3)).toBeNull();
    expect(knight.level).toBe(2);
    expect(knight.maxHealth).toBe(16);
    expect(knight.health).toBe(10);
    expect(game.gold).toBe(25);
    expect(game.upgrade(ben.id, 2, 3)).toBe(SIEGE_NO_GOLD);
    game.gold = 1000;
    expect(game.upgrade(ben.id, 2, 3)).toBeNull();
    expect(knight.level).toBe(3);
    expect(game.upgrade(ben.id, 2, 3)).toBe("Already at max level.");
    expect(game.gold).toBe(850);
    expect(ana.goldSpent).toBe(75);
    expect(ben.goldSpent).toBe(250);
    expect(ben.upgrades).toBe(2);
    expect(ana.placed.knight).toBe(1);
    expect(ana.lastPlaced).toBe("knight");
    expect(game.events.map((e) => `${e.nickname} ${e.text}`)).toEqual(["Ana placed a knight", "Ben upgraded a knight to Lv 2", "Ben upgraded a knight to Lv 3"]);
  });

  test("two purchases racing for the last gold: the first one wins", () => {
    const { game } = setup();
    game.gold = 60;
    expect(game.place(byName(game, "Ana").id, "archer", 0, 1)).toBeNull();
    expect(game.place(byName(game, "Ben").id, "wall", 1, 1)).toBe(SIEGE_NO_GOLD);
    expect(game.gold).toBe(10);
    expect(game.defenders).toHaveLength(1);
  });

  test("taken squares, monster squares, the entry square and bad input are refused", () => {
    const { game } = setup();
    const ana = byName(game, "Ana").id;
    game.gold = 1000;
    expect(game.place(ana, "wall", 0, 4)).toBeNull();
    expect(game.place(ana, "archer", 0, 4)).toBe("That square is taken.");
    expect(game.place(ana, "archer", 0, 8)).toBe("You can't build on that square.");
    expect(game.place(ana, "archer", 0, 0)).toBe("You can't build on that square.");
    expect(game.place(ana, "archer", 5, 1)).toBe("You can't build on that square.");
    expect(game.place(ana, "archer", 1.5, 1)).toBe("You can't build on that square.");
    expect(game.place(ana, "catapult", 1, 1)).toBe("Unknown defender.");
    game.spawn("goblin", 3, 6);
    expect(game.place(ana, "wall", 3, 6)).toBe("A monster is standing there.");
    expect(game.place(ana, "wall", 3, 5)).toBeNull();
    expect(game.upgrade(ana, 4, 4)).toBe("That defender is gone.");
  });
});

describe("the battle", () => {
  test("a monster stops at the first defender in its way, attacks it, and walks on once it is destroyed", () => {
    const { game, clock } = quietWave();
    game.place(byName(game, "Ana").id, "wall", 0, 5);
    const wall = game.defenderAt(0, 5)!;
    const goblin = game.spawn("goblin", 0);
    // Two squares at 2 s each, then 1 damage a second.
    clock.advance(4000);
    expect(goblin.x).toBeCloseTo(6, 5);
    expect(goblin.state).toBe("attack");
    clock.advance(3000);
    expect(wall.health).toBe(12);
    clock.advance(12_000);
    expect(game.defenderAt(0, 5)).toBeUndefined();
    clock.advance(SIEGE_TICK_MS * 2);
    expect(goblin.state).toBe("walk");
    expect(goblin.x).toBeLessThan(6);
  });

  test("archers shoot the nearest monster ahead every 1.5 s, every 1 s at Lv 2, and 2 arrows at Lv 3", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.gold = 1000;
    game.place(ana.id, "archer", 1, 1);
    const far = game.spawn("troll", 1, 8);
    const near = game.spawn("troll", 1, 6);
    clock.advance(SIEGE_TICK_MS);
    expect(near.health).toBe(11);
    expect(far.health).toBe(12);
    clock.advance(1400);
    expect(near.health).toBe(11);
    clock.advance(100);
    expect(near.health).toBe(10);
    game.upgrade(ana.id, 1, 1);
    clock.advance(1500);
    expect(near.health).toBe(9);
    clock.advance(1000);
    expect(near.health).toBe(8);
    game.upgrade(ana.id, 1, 1);
    clock.advance(1000);
    expect(near.health).toBe(6);
    expect(game.shots.length).toBeGreaterThanOrEqual(5);
  });

  test("an archer's second arrow goes to the next monster when the first one falls", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.gold = 1000;
    game.place(ana.id, "archer", 1, 1);
    game.upgrade(ana.id, 1, 1);
    game.upgrade(ana.id, 1, 1);
    const near = game.spawn("wolf", 1, 7);
    near.health = 1;
    const far = game.spawn("troll", 1, 8);
    clock.advance(SIEGE_TICK_MS);
    expect(game.monsters).not.toContain(near);
    expect(far.health).toBe(11);
    expect(ana.defeated).toBe(1);
    expect(ana.archerKills).toBe(1);
  });

  test("knights strike the monster in front of them; Lv 3 hits harder", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.gold = 1000;
    game.place(ana.id, "knight", 2, 3);
    const troll = game.spawn("troll", 2, 4);
    clock.advance(SIEGE_TICK_MS);
    expect(troll.health).toBe(10);
    clock.advance(1000);
    expect(troll.health).toBe(8);
    game.upgrade(ana.id, 2, 3);
    game.upgrade(ana.id, 2, 3);
    clock.advance(1000);
    expect(troll.health).toBe(5);
  });

  test("a stone wall with spikes hurts whatever hits it", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.gold = 1000;
    game.place(ana.id, "wall", 0, 3);
    game.upgrade(ana.id, 0, 3);
    game.upgrade(ana.id, 0, 3);
    const wall = game.defenderAt(0, 3)!;
    expect(wall.maxHealth).toBe(25);
    const goblin = game.spawn("goblin", 0, 4);
    clock.advance(1000 + SIEGE_TICK_MS);
    expect(wall.health).toBe(24);
    expect(goblin.health).toBe(2);
    clock.advance(2000);
    expect(game.monsters).not.toContain(goblin);
    expect(ana.defeated).toBe(1);
    expect(ana.archerKills).toBe(0);
  });

  test("the wolf leaps over the first stone wall in its lane, and only the first", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.gold = 1000;
    game.place(ana.id, "wall", 4, 6);
    game.place(ana.id, "wall", 4, 3);
    const wolf = game.spawn("wolf", 4);
    clock.advance(1000);
    expect(wolf.state).toBe("leap");
    clock.advance(1000);
    expect(wolf.x).toBeLessThan(6);
    // Lands on square 5, walks to square 4 and hits the second wall a second later.
    clock.advance(2000);
    expect(wolf.x).toBeCloseTo(4, 5);
    expect(wolf.state).toBe("attack");
    expect(game.defenderAt(4, 6)!.health).toBe(15);
    expect(game.defenderAt(4, 3)!.health).toBe(14);
    clock.advance(1000);
    expect(game.defenderAt(4, 3)!.health).toBe(13);
  });

  test("the wolf doesn't leap a knight, and takes two strikes to fall", () => {
    const { game, clock } = quietWave();
    game.gold = 1000;
    game.place(byName(game, "Ana").id, "knight", 4, 6);
    const wolf = game.spawn("wolf", 4);
    clock.advance(1100);
    expect(wolf.state).toBe("attack");
    expect(wolf.x).toBeCloseTo(7, 5);
    expect(wolf.health).toBe(1);
    clock.advance(500);
    expect(game.monsters).not.toContain(wolf);
  });

  test("a wolf leaping the wall next to the castle lands on the castle wall", () => {
    const { game, clock } = quietWave();
    game.place(byName(game, "Ana").id, "wall", 2, 1);
    game.spawn("wolf", 2, 2);
    clock.advance(SIEGE_TICK_MS * 12);
    expect(game.hearts).toBe(SIEGE_HEARTS - 1);
  });

  test("trolls do triple damage to stone walls, normal damage to others", () => {
    const { game, clock } = quietWave();
    game.gold = 1000;
    const ana = byName(game, "Ana").id;
    game.place(ana, "wall", 0, 4);
    game.place(ana, "knight", 1, 4);
    game.spawn("troll", 0, 5);
    game.spawn("troll", 1, 5);
    clock.advance(1000 + SIEGE_TICK_MS);
    expect(game.defenderAt(0, 4)!.health).toBe(15 - 6);
    expect(game.defenderAt(1, 4)!.health).toBe(10 - 2);
  });

  test("the giant waits 3 s with a horn, then stomps: 6 to the defender in front, 2 to the squares above and below", () => {
    const { game, clock } = quietWave({ players: 4 });
    game.gold = 1000;
    const ana = byName(game, "Ana").id;
    game.place(ana, "wall", 2, 6);
    game.place(ana, "knight", 1, 6);
    game.place(ana, "archer", 3, 6);
    game.place(ana, "archer", 4, 6);
    const seq = game.giantSeq;
    const giant = game.spawn("giant", 2, 7);
    expect(giant.maxHealth).toBe(40 + 5 * 4);
    expect(game.giantSeq).toBe(seq + 1);
    expect(game.alert?.kind).toBe("giant");
    expect(game.hostView().giant).toEqual({ lane: 2, ms: SIEGE_GIANT_WAIT_MS });
    clock.advance(SIEGE_GIANT_WAIT_MS - SIEGE_TICK_MS);
    expect(giant.state).toBe("wait");
    expect(giant.x).toBe(7);
    clock.advance(SIEGE_TICK_MS * 2);
    expect(giant.state).toBe("attack");
    clock.advance(3000);
    expect(game.defenderAt(2, 6)!.health).toBe(15 - 6);
    expect(game.defenderAt(1, 6)!.health).toBe(10 - 2);
    expect(game.defenderAt(3, 6)!.health).toBe(4 - 2);
    expect(game.defenderAt(4, 6)!.health).toBe(4);
  });

  test("monsters that reach the wall take hearts and are gone: goblin and wolf 1, troll 2, giant 5", () => {
    const { game, clock } = quietWave();
    const before = game.wallHitSeq;
    game.spawn("goblin", 0, 1);
    game.spawn("wolf", 1, 1);
    game.spawn("troll", 2, 1);
    game.spawn("giant", 3, 1).waitUntil = 0;
    clock.advance(2500);
    expect(game.monsters).toHaveLength(0);
    expect(game.hearts).toBe(SIEGE_HEARTS - 9);
    expect(game.wallHitSeq).toBe(before + 4);
    expect(game.fallen.filter((f) => f.reachedWall)).toHaveLength(4);
    expect(game.waveLog[0]!.heartsLost).toBe(9);
  });

  test("a lane is in danger while a monster is within 2 squares of the wall", () => {
    const { game, clock } = quietWave();
    game.spawn("troll", 3, 3);
    clock.advance(SIEGE_TICK_MS);
    expect(game.danger).toEqual([]);
    clock.advance(2000);
    expect(game.danger).toEqual([3]);
    expect(game.hostView().danger).toEqual([3]);
    expect(game.playerView(byName(game, "Ana").id)!.danger).toEqual([3]);
  });
});

describe("waves", () => {
  test("warning arrows show 2 s before a monster comes on, and wave 1 is goblins only", () => {
    const { game, clock } = setup({ players: 6 });
    clock.advance(SIEGE_OPENING_MS);
    expect(game.wave).toBe(1);
    expect(game.pending.every((s) => s.type === "goblin")).toBe(true);
    const first = game.pending[0]!;
    expect(first.at - clock.now()).toBeGreaterThanOrEqual(SIEGE_WARNING_MS);
    clock.advance(first.at - clock.now() - SIEGE_WARNING_MS + SIEGE_TICK_MS);
    const warning = game.hostView().warnings;
    expect(warning.length).toBeGreaterThan(0);
    expect(warning[0]!.ms).toBeLessThanOrEqual(SIEGE_WARNING_MS);
    clock.advance(SIEGE_WARNING_MS);
    expect(game.monsters.length).toBeGreaterThan(0);
  });

  test("the wave make-up: wolves from wave 2, trolls from wave 3, a giant on top of the budget in wave 5", () => {
    const { game } = setup();
    for (let i = 0; i < 20; i++) {
      expect(game.planWave(1, 20).every((s) => s.type === "goblin")).toBe(true);
      expect(game.planWave(2, 20).some((s) => s.type === "troll" || s.type === "giant")).toBe(false);
      expect(game.planWave(4, 20).some((s) => s.type === "giant")).toBe(false);
    }
    expect(Array.from({ length: 20 }, () => game.planWave(2, 20)).flat().some((s) => s.type === "wolf")).toBe(true);
    expect(Array.from({ length: 20 }, () => game.planWave(3, 20)).flat().some((s) => s.type === "troll")).toBe(true);
    const five = game.planWave(5, 3);
    expect(five.filter((s) => s.type === "giant")).toHaveLength(1);
    expect(five[five.length - 1]!.type).toBe("giant");
    expect(five.filter((s) => s.type !== "giant").length).toBeGreaterThan(0);
  });

  test("the plan spends the budget at the monster costs and keeps goblin groups at 2–3", () => {
    const { game } = setup();
    for (let i = 0; i < 20; i++) {
      const plan = game.planWave(4, 17);
      const cost = { goblin: 1, wolf: 2, troll: 4, giant: 0 };
      expect(plan.reduce((n, s) => n + cost[s.type], 0)).toBe(17);
      const groups = new Map<number, number>();
      for (const s of plan) if (s.type === "goblin") groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
      for (const size of groups.values()) expect(size).toBeLessThanOrEqual(3);
    }
  });

  test("Endless brings 2 giants in different lanes from wave 15 on", () => {
    const { game, clock } = setup({ waves: "endless" });
    expect(game.planWave(10, 5).filter((s) => s.type === "giant")).toHaveLength(1);
    const plan = game.planWave(15, 5);
    expect(plan.filter((s) => s.type === "giant")).toHaveLength(2);
    clock.advance(SIEGE_OPENING_MS);
    game.pending = plan.filter((s) => s.type === "giant");
    clock.advance(siegeSpawnWindowMs(15) + 500);
    const giants = game.monsters.filter((m) => m.type === "giant");
    expect(giants).toHaveLength(2);
    expect(giants[0]!.lane).not.toBe(giants[1]!.lane);
  });

  test("no more than 2 monsters come onto one lane at once", () => {
    const { game, clock } = setup({ players: 6 });
    clock.advance(SIEGE_OPENING_MS);
    const now = clock.now();
    game.pending = Array.from({ length: 20 }, (_, i) => ({ at: now + SIEGE_WARNING_MS + i * 50, type: "goblin" as const, group: 1000 + i, lane: -1 }));
    for (let t = 0; t < 8000; t += SIEGE_TICK_MS) {
      clock.advance(SIEGE_TICK_MS);
      for (let lane = 0; lane < 5; lane++) expect(game.monsters.filter((m) => m.lane === lane && m.x > 6.5).length).toBeLessThanOrEqual(2);
    }
  });

  test("the budget uses the class size factor at the start of the wave and the scale from the last wave's accuracy", () => {
    const { game, clock } = quietWave({ players: 3 });
    // Keeps the wave going while the class answers.
    game.spawn("troll", 0);
    const log1 = game.waveLog[0]!;
    expect(log1.scale).toBe(100);
    expect(log1.budget).toBe(siegeWaveBudget(1, 3, 100));
    // Everyone answers right during wave 1: the scale goes up by the 20-point step.
    const players = [...game.players.values()];
    for (let i = 0; i < 4; i++) for (const p of players) answer(game, clock, p, true);
    game.monsters = [];
    clock.advance(SIEGE_TICK_MS);
    expect(game.phase).toBe("build");
    expect(game.wave).toBe(2);
    // A player who disconnects isn't counted for wave 2.
    game.setConnected(players[0]!.id, false);
    clock.advance(SIEGE_BREAK_MS);
    expect(game.phase).toBe("wave");
    const log2 = game.waveLog[1]!;
    expect(log1.correct).toBe(12);
    expect(log1.answered).toBe(12);
    expect(log2.scale).toBe(120);
    expect(log2.budget).toBe(siegeWaveBudget(2, 2, 120));
  });

  test("a wave with no answers keeps the scale", () => {
    const { game, clock } = quietWave();
    game.scale = 110;
    game.waveLog[0]!.scale = 110;
    clock.advance(SIEGE_TICK_MS);
    clock.advance(SIEGE_BREAK_MS);
    expect(game.waveLog[1]!.scale).toBe(110);
  });
});

describe("endings", () => {
  test("the kingdom stands when the last wave is beaten with hearts left", () => {
    const { game, clock, finished } = setup({ waves: 5 });
    clock.advance(SIEGE_OPENING_MS);
    for (let w = 1; w <= 5; w++) {
      expect(game.wave).toBe(w);
      game.pending = [];
      game.monsters = [];
      clock.advance(SIEGE_TICK_MS);
      if (w < 5) {
        expect(game.phase).toBe("build");
        clock.advance(SIEGE_BREAK_MS);
      }
    }
    expect(game.phase).toBe("stands");
    expect(game.result().headline).toBe("The kingdom stands with 10 of 10 hearts!");
    clock.advance(SIEGE_ENDING_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    const r = game.result();
    expect(r.outcome).toBe("stands");
    expect(r.wavesSurvived).toBe(5);
    expect(game.playerView(byName(game, "Ana").id)!.result!.headline).toBe(r.headline);
  });

  test("the castle falls at 0 hearts", () => {
    const { game, clock, finished } = quietWave();
    game.hearts = 2;
    game.spawn("troll", 0, 1);
    clock.advance(4000);
    expect(game.phase).toBe("fallen");
    expect(game.hearts).toBe(0);
    expect(game.result().headline).toBe("The castle fell on wave 1 of 5.");
    expect(game.result().wavesSurvived).toBe(0);
    clock.advance(SIEGE_ENDING_MS);
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
  });

  test("End game goes straight to the podium", () => {
    const { game, clock, finished } = quietWave();
    game.hearts = 6;
    game.spawn("goblin", 0);
    game.end();
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.result().outcome).toBe("ended");
    expect(game.result().headline).toBe("Ended on wave 1 with 6 hearts left.");
    clock.advance(10_000);
    expect(game.phase).toBe("podium");
    game.end();
    expect(finished()).toBe(1);
  });

  test("Endless: waves survived, average difficulty and the record", () => {
    const clock = new FakeClock();
    const lobby = new Game(quiz(), { clock });
    lobby.setMode("siege");
    lobby.setSiege({ waves: "endless" });
    lobby.join("Ana");
    const game = SiegeGame.fromLobby(lobby, { clock, rng: seeded(), record: { waves: 2, avgScale: 90, date: "2026-01-01" } });
    game.start();
    clock.advance(SIEGE_COUNTDOWN_MS + SIEGE_OPENING_MS);
    for (let w = 1; w <= 3; w++) {
      game.pending = [];
      game.monsters = [];
      clock.advance(SIEGE_TICK_MS);
      clock.advance(SIEGE_BREAK_MS);
    }
    expect(game.wave).toBe(4);
    game.pending = [];
    game.hearts = 1;
    game.spawn("goblin", 0, 1);
    clock.advance(1000);
    expect(game.phase).toBe("fallen");
    const r = game.result();
    expect(r.wavesSurvived).toBe(3);
    expect(r.headline).toBe("Survived 3 waves");
    expect(r.avgScale).toBe(100);
    expect(r.newRecord).toBe(true);
    expect(r.record).toMatchObject({ waves: 3, avgScale: 100 });
  });

  test("Endless: a shorter run doesn't beat the record", () => {
    const clock = new FakeClock();
    const lobby = new Game(quiz(), { clock });
    lobby.setMode("siege");
    lobby.setSiege({ waves: "endless" });
    lobby.join("Ana");
    const record = { waves: 12, avgScale: 108, date: "2026-01-01" };
    const game = SiegeGame.fromLobby(lobby, { clock, rng: seeded(), record });
    game.start();
    clock.advance(SIEGE_COUNTDOWN_MS + SIEGE_OPENING_MS);
    game.end();
    expect(game.result().newRecord).toBe(false);
    expect(game.result().record).toEqual(record);
  });
});

describe("players", () => {
  test("Protect from abuse holds the ✗ longer after wrong answers in a row", () => {
    const { game, clock } = setup({ protect: true });
    const ana = byName(game, "Ana");
    answer(game, clock, ana, false);
    const cur = ana.current!;
    expect(game.answer(ana.id, cur.seq, 1)).toBe(true);
    expect(ana.readyAt - clock.now()).toBe(FEEDBACK_MS + WRONG_PENALTY_2_MS);
  });

  test("reconnects keep the same player; an open map closes on disconnect", () => {
    const { game, clock } = setup();
    const ana = byName(game, "Ana");
    answer(game, clock, ana, true);
    game.setMap(ana.id, true);
    expect(game.playerView(ana.id)!.map).not.toBeNull();
    game.setConnected(ana.id, false);
    expect(ana.mapOpen).toBe(false);
    expect(game.byToken(ana.token)).toBe(ana);
    game.setConnected(ana.id, true);
    expect(byName(game, "Ana").goldEarned).toBe(25);
    expect(game.playerView(ana.id)!.map).toBeNull();
  });

  test("late joiners answer right away and count for the class size from the next wave", () => {
    const { game, clock } = quietWave({ players: 2 });
    const zed = game.join("Zed");
    expect(zed.current).not.toBeNull();
    answer(game, clock, zed, true);
    expect(game.gold).toBe(SIEGE_START_GOLD + 25);
    expect(game.waveLog[0]!.budget).toBe(siegeWaveBudget(1, 2, 100));
    clock.advance(SIEGE_TICK_MS);
    clock.advance(SIEGE_BREAK_MS);
    expect(game.waveLog[1]!.budget).toBe(siegeWaveBudget(2, 3, game.waveLog[1]!.scale));
  });

  test("a player who joins during the ending waits for the podium", () => {
    const { game, clock } = quietWave();
    game.hearts = 1;
    game.spawn("goblin", 0, 1);
    clock.advance(1000);
    expect(game.phase).toBe("fallen");
    const late = game.join("Late");
    expect(late.current).toBeNull();
    expect(game.playerView(late.id)!.question).toBeNull();
  });

  test("a kicked player's defenders stay on the board and their stats stay in the results", () => {
    const { game } = setup();
    const ana = byName(game, "Ana");
    game.place(ana.id, "archer", 0, 2);
    game.kick(ana.id);
    expect(game.players.has(ana.id)).toBe(false);
    expect(game.defenderAt(0, 2)?.owner).toBe(ana);
    expect(game.everyone).toContain(ana);
    expect(game.gold).toBe(50);
  });

  test("if every phone disconnects, the monsters keep marching", () => {
    const { game, clock } = quietWave();
    for (const p of game.players.values()) game.setConnected(p.id, false);
    const goblin = game.spawn("goblin", 0);
    clock.advance(2000);
    expect(goblin.x).toBeCloseTo(7, 5);
  });

  test("1 and 2 players and 3 and 6 players can play a whole game", () => {
    for (const players of [1, 2, 3, 6]) {
      const { game, clock } = setup({ players, seed: players });
      const rng = seeded(players * 7);
      for (let t = 0; t < 30 * 60_000 && game.phase !== "podium"; t += 500) {
        clock.advance(500);
        for (const p of game.players.values()) {
          if (!p.current || clock.now() < p.readyAt || rng() < 0.6) continue;
          const right = rng() < 0.75;
          const option = right ? p.current.correct[0]! : p.current.options.findIndex((_, i) => !p.current!.correct.includes(i));
          game.answer(p.id, p.current.seq, option);
          const lane = Math.floor(rng() * 5);
          const type = (["archer", "knight", "wall"] as const)[Math.floor(rng() * 3)]!;
          if (game.place(p.id, type, lane, 1 + Math.floor(rng() * 7)) !== null) game.upgrade(p.id, lane, 1 + Math.floor(rng() * 7));
        }
      }
      expect(game.phase).toBe("podium");
      expect(["stands", "fallen"]).toContain(game.result().outcome);
    }
  });
});

describe("views", () => {
  test("phones get no monster positions, and the lane map only while it is open", () => {
    const { game, clock } = quietWave();
    const ana = byName(game, "Ana");
    game.place(ana.id, "archer", 0, 1);
    game.spawn("troll", 2, 6);
    clock.advance(SIEGE_TICK_MS);
    const closed = game.playerView(ana.id)!;
    expect(closed.map).toBeNull();
    expect(JSON.stringify(closed)).not.toContain("troll");
    game.setMap(ana.id, true);
    clock.advance(1000);
    const open = game.playerView(ana.id)!;
    expect(open.map!.defenders).toEqual([{ lane: 0, square: 1, type: "archer", level: 1 }]);
    expect(open.map!.monsters).toEqual([{ lane: 2, square: 6 }]);
    game.setMap(ana.id, false);
    expect(game.playerView(ana.id)!.map).toBeNull();
  });

  test("the phone's gold is rounded to 5, and it sees the hearts, wave and last defender placed", () => {
    const { game } = setup();
    const ana = byName(game, "Ana");
    game.place(ana.id, "wall", 0, 1);
    game.gold = 123;
    const v = game.playerView(ana.id)!;
    expect(v.gold).toBe(125);
    expect(v.hearts).toBe(SIEGE_HEARTS);
    expect(v.wave).toBe(1);
    expect(v.waves).toBe(5);
    expect(v.lastPlaced).toBe("wall");
  });

  test("the projector gets each monster's position, target and time to get there", () => {
    const { game } = quietWave();
    game.place(byName(game, "Ana").id, "wall", 1, 3);
    game.spawn("goblin", 1, 8);
    const m = game.hostView().monsters[0]!;
    expect(m.x).toBe(8);
    expect(m.toX).toBe(4);
    expect(m.moveMs).toBe(8000);
  });

  test("awards: Top Archer Captain (ties by archer upgrades), Master Mason and Most correct answers", () => {
    const { game, clock } = setup();
    const [ana, ben, cal] = ["Ana", "Ben", "Cal"].map((n) => byName(game, n));
    ana!.archerKills = 3;
    ben!.archerKills = 3;
    ben!.archerUpgrades = 1;
    cal!.placed.wall = 2;
    cal!.wallUpgrades = 1;
    answer(game, clock, ana!, true);
    const a = game.awards();
    expect(a.topArcher).toEqual({ value: 3, nicknames: ["Ben"] });
    expect(a.masterMason).toEqual({ value: 3, nicknames: ["Cal"] });
    expect(a.mostCorrect).toEqual({ value: 1, nicknames: ["Ana"] });
  });
});

describe("results", () => {
  test("the CSV has a row per player (kicked players too) with the class result, then the wave log", () => {
    const { game, clock } = quietWave();
    game.spawn("troll", 4);
    const ana = byName(game, "Ana");
    answer(game, clock, ana, true);
    answer(game, clock, ana, false);
    game.place(ana.id, "archer", 0, 1);
    game.kick(byName(game, "Cal").id);
    game.hearts = 7;
    game.end();
    const csv = buildSiegeResultsCsv(game);
    const lines = csv.replace("\ufeff", "").trim().split("\r\n");
    expect(lines[0]).toBe("Nickname,Correct,Wrong,Accuracy %,Gold earned,Gold spent,Archers placed,Knights placed,Walls placed,Upgrades bought,Monsters defeated,Class result,Waves survived,Hearts left,Endless record");
    expect(lines[1]).toBe("Ana,1,1,50,25,50,1,0,0,0,0,Ended,0,7,");
    expect(lines.filter((l) => l.startsWith("Cal,"))).toHaveLength(1);
    expect(lines).toContain("Wave,Difficulty scale %,Monster budget,Monsters sent,Class accuracy %,Hearts lost");
    expect(lines[lines.length - 1]).toBe(`1,100,${siegeWaveBudget(1, 3, 100)},1,50,0`);
  });

  test("Endless records are kept per quiz; a missing or broken file means no record", () => {
    const t = tempDir();
    try {
      expect(loadSiegeRecord(t.dir, "quiz-a")).toBeNull();
      saveSiegeRecord(t.dir, "quiz-a", { waves: 7, avgScale: 104, date: "2026-10-19T00:00:00.000Z" });
      saveSiegeRecord(t.dir, "quiz-b", { waves: 3, avgScale: 90, date: "2026-10-19T00:00:00.000Z" });
      expect(loadSiegeRecord(t.dir, "quiz-a")).toEqual({ waves: 7, avgScale: 104, date: "2026-10-19T00:00:00.000Z" });
      expect(loadSiegeRecord(t.dir, "quiz-b")?.waves).toBe(3);
      writeFileSync(siegeRecordsPath(t.dir), "{ not json");
      expect(loadSiegeRecord(t.dir, "quiz-a")).toBeNull();
    } finally {
      t.cleanup();
    }
  });
});

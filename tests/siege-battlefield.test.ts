import { beforeEach, describe, expect, test } from "bun:test";
import { SiegeBattlefield } from "../src/server/game/siege-battlefield.ts";
import type { SiegeDefenderType } from "../src/shared/siege-rules.ts";
import { FakeClock } from "./helpers.ts";

const TICK = 100;

let clock: FakeClock;
let defeats: { owner: string; by: SiegeDefenderType }[];
let field: SiegeBattlefield<string>;
let wave: number;

beforeEach(() => {
  clock = new FakeClock();
  defeats = [];
  wave = 1;
  field = new SiegeBattlefield<string>({
    clock,
    rng: () => 0.5,
    endless: false,
    wave: () => wave,
    classSize: () => 1,
    onDefeat: (owner, by) => defeats.push({ owner, by }),
  });
  field.beginWave({ wave: 1, budget: 0, toughness: 1, giantPace: 1 });
});

function runEachBattleTick(ms: number) {
  const seen = { changed: false, phones: false, map: false };
  for (let t = 0; t < ms; t += TICK) {
    clock.advance(TICK);
    const r = field.tick(clock.now());
    seen.changed ||= r.changed;
    seen.phones ||= r.phones;
    seen.map ||= r.map;
  }
  return seen;
}

describe("Battlefield: placement", () => {
  test("a defender goes only on a free, buildable square with no monster on it", () => {
    expect(field.placementError("catapult", 0, 1)).toBe("Unknown defender.");
    expect(field.placementError("knight", 5, 1)).toBe("You can't build on that square.");
    expect(field.placementError("knight", 0, 0)).toBe("You can't build on that square.");
    expect(field.placementError("knight", 0, 8)).toBe("You can't build on that square.");
    expect(field.placementError("knight", 0, 1.5)).toBe("You can't build on that square.");
    expect(field.placementError("knight", 2, 3)).toBeNull();
    field.place("knight", 2, 3, "Ana");
    expect(field.placementError("wall", 2, 3)).toBe("That square is taken.");
    field.spawn("goblin", 1, 4);
    expect(field.placementError("wall", 1, 4)).toBe("A monster is standing there.");
    expect(field.mapView().defenders).toEqual([{ lane: 2, square: 3, type: "knight", level: 1 }]);
  });

  test("an upgrade adds the extra health to what the defender has left, up to level 3", () => {
    const wall = field.place("wall", 0, 2, "Ana");
    field.spawn("goblin", 0, 3);
    runEachBattleTick(1100);
    expect(wall.health).toBe(14);
    field.upgrade(wall);
    expect([wall.level, wall.health, wall.maxHealth]).toEqual([2, 24, 25]);
    field.upgrade(wall);
    field.upgrade(wall);
    expect(wall.level).toBe(3);
  });
});

describe("Battlefield: combat", () => {
  test("a monster takes the game's wave for its health, even in the build break before that wave", () => {
    wave = 4;
    expect(field.spawn("goblin", 0).maxHealth).toBe(4);
    expect(field.spawn("troll", 1).maxHealth).toBe(16);
  });

  test("a goblin on an empty lane reaches the wall and costs one heart", () => {
    field.spawn("goblin", 0, 2);
    const seen = runEachBattleTick(4000);
    expect(field.hearts).toBe(9);
    expect(field.heartsLost).toBe(1);
    expect(field.sent).toBe(1);
    expect(field.monsters).toEqual([]);
    expect(field.fallen.map((f) => f.reachedWall)).toEqual([true]);
    expect(field.alert?.kind).toBe("wall");
    expect(seen.phones).toBe(true);
    expect(field.waveCleared).toBe(true);
  });

  test("a knight defeats the goblin that walks into it, and its owner gets the credit", () => {
    const knight = field.place("knight", 2, 3, "Ana");
    field.spawn("goblin", 2, 5);
    runEachBattleTick(5000);
    expect(field.monsters).toEqual([]);
    expect(field.fallen.map((f) => f.reachedWall)).toEqual([false]);
    expect(defeats).toEqual([{ owner: "Ana", by: "knight" }]);
    expect(field.hearts).toBe(10);
    expect(knight.health).toBeGreaterThan(0);
  });

  test("a goblin breaks a wall and walks on to the castle", () => {
    field.place("wall", 0, 2, "Ben");
    field.spawn("goblin", 0, 3);
    const seen = runEachBattleTick(22000);
    expect(field.defenderAt(0, 2)).toBeUndefined();
    expect(seen.map).toBe(true);
    expect(field.hearts).toBe(9);
  });

  test("an archer shoots the nearest monster ahead in its lane, and a troll's armor halves each arrow", () => {
    field.place("archer", 0, 1, "Ana");
    field.place("archer", 1, 1, "Ben");
    const far = field.spawn("goblin", 0, 6);
    const near = field.spawn("goblin", 0, 4);
    const troll = field.spawn("troll", 1, 8);
    runEachBattleTick(TICK);
    expect([near.health, far.health, troll.health]).toEqual([2, 3, 11.5]);
    expect(field.shots).toHaveLength(2);
  });

  test("a troll does triple damage to a stone wall and normal damage to a knight", () => {
    const wall = field.place("wall", 0, 4, "Ana");
    const knight = field.place("knight", 1, 4, "Ana");
    field.spawn("troll", 0, 5);
    field.spawn("troll", 1, 5);
    runEachBattleTick(1100);
    expect(wall.health).toBe(9);
    expect(knight.health).toBe(8);
  });

  test("a stone wall with spikes hurts whatever hits it, and its owner gets the credit", () => {
    const wall = field.place("wall", 0, 3, "Ana");
    field.upgrade(wall);
    field.upgrade(wall);
    const goblin = field.spawn("goblin", 0, 4);
    runEachBattleTick(1100);
    expect([wall.health, goblin.health]).toEqual([24, 2]);
    runEachBattleTick(2000);
    expect(field.monsters).toEqual([]);
    expect(defeats).toEqual([{ owner: "Ana", by: "wall" }]);
  });

  test("the wolf leaps the first stone wall in its lane, and only the first", () => {
    const first = field.place("wall", 4, 6, "Ana");
    const second = field.place("wall", 4, 3, "Ana");
    const wolf = field.spawn("wolf", 4);
    runEachBattleTick(1000);
    expect(wolf.state).toBe("leap");
    runEachBattleTick(3000);
    expect(wolf.state).toBe("attack");
    expect(wolf.x).toBeCloseTo(4, 5);
    expect([first.health, second.health]).toEqual([15, 14]);
  });

  test("the giant waits, then stomps: 6 to the defender in front, 2 to the squares above and below", () => {
    const wall = field.place("wall", 2, 6, "Ana");
    const knight = field.place("knight", 1, 6, "Ana");
    const above = field.place("archer", 3, 6, "Ana");
    const apart = field.place("archer", 4, 6, "Ana");
    const giant = field.spawn("giant", 2, 7);
    expect(giant.maxHealth).toBe(45);
    expect(field.alert?.kind).toBe("giant");
    runEachBattleTick(2900);
    expect(giant.state).toBe("wait");
    runEachBattleTick(3300);
    expect([wall.health, knight.health, above.health, apart.health]).toEqual([9, 8, 2, 4]);
  });

  test("the projector sees monsters glide only while the battle runs", () => {
    field.spawn("goblin", 0, 6);
    expect(field.hostBoard(true, false).monsters[0]).toMatchObject({ x: 6, toX: 0.5, moveRemainingMs: 11000 });
    expect(field.hostBoard(false, false).monsters[0]).toMatchObject({ x: 6, toX: 6, moveRemainingMs: 0 });
  });

  test("a stopped battle brings on no more monsters", () => {
    field.beginWave({ wave: 1, budget: 6, toughness: 1, giantPace: 1 });
    expect(field.pending.length).toBeGreaterThan(0);
    field.stop();
    runEachBattleTick(20000);
    expect(field.monsters).toEqual([]);
    expect(field.sent).toBe(0);
  });
});

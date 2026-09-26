import { describe, expect, test } from "bun:test";
import {
  CATAPULT_X,
  COLS,
  GROUND,
  HILL_HEIGHTS,
  MAX_PULL,
  MAX_SPEED,
  MIN_GROUND,
  MIN_PULL,
  TOWER_X,
  carve,
  groundAt,
  launchVector,
  makeTerrain,
  simulate,
  type HillHeight,
} from "../src/shared/fight-physics.ts";

/** Seeded RNG so terrain is reproducible. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const flat = () => Array.from({ length: COLS + 1 }, () => GROUND);

/** Every pull on a coarse grid, fired by `team`: the impacts that result. */
function sweep(terrain: number[], team: number) {
  const out = [];
  for (let angle = -80; angle <= 260; angle += 2) {
    for (let pull = MIN_PULL + 1; pull <= MAX_PULL; pull += 6) {
      const rad = (angle * Math.PI) / 180;
      const v = launchVector(-Math.cos(rad) * pull, -Math.sin(rad) * pull)!;
      out.push(simulate(terrain, team, v.vx, v.vy).impact);
    }
  }
  return out;
}

describe("terrain", () => {
  test("the hill is in the middle and the towers stand on flat ground", () => {
    for (const hill of Object.keys(HILL_HEIGHTS) as HillHeight[]) {
      const t = makeTerrain(hill, seeded(7));
      expect(t).toHaveLength(COLS + 1);
      const peak = Math.max(...t);
      expect(peak).toBeGreaterThan(GROUND + HILL_HEIGHTS[hill] * 0.8);
      expect(t.indexOf(peak)).toBeGreaterThan(COLS * 0.4);
      expect(t.indexOf(peak)).toBeLessThan(COLS * 0.6);
      for (const x of [...TOWER_X, ...CATAPULT_X]) expect(groundAt(t, x)).toBeCloseTo(GROUND, 0);
    }
  });

  test("higher settings make higher hills", () => {
    const peak = (h: HillHeight) => Math.max(...makeTerrain(h, seeded(3)));
    expect(peak("low")).toBeLessThan(peak("medium"));
    expect(peak("medium")).toBeLessThan(peak("high"));
  });

  test("craters dig the hill away, but never below the minimum or under a tower", () => {
    let t = makeTerrain("high", seeded(1));
    const underTower = groundAt(t, TOWER_X[0]);
    for (let i = 0; i < 200; i++) for (let x = 0; x <= 1000; x += 20) t = carve(t, x);
    expect(Math.max(...t.filter((_, i) => Math.abs(i * 5 - 500) < 200))).toBe(MIN_GROUND);
    expect(Math.min(...t)).toBe(MIN_GROUND);
    expect(groundAt(t, TOWER_X[0])).toBe(underTower);
  });
});

describe("launch", () => {
  test("slingshot: the shot flies opposite to the pull", () => {
    const v = launchVector(-50, -50)!;
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeGreaterThan(0);
  });

  test("power grows with the pull and is capped", () => {
    const speed = (pull: number) => Math.hypot(...Object.values(launchVector(pull, 0)!));
    expect(speed(MAX_PULL / 2)).toBeCloseTo(MAX_SPEED / 2);
    expect(speed(MAX_PULL)).toBeCloseTo(MAX_SPEED);
    expect(speed(MAX_PULL * 3)).toBeCloseTo(MAX_SPEED);
  });

  test("tiny or invalid pulls are rejected", () => {
    expect(launchVector(3, 3)).toBeNull();
    expect(launchVector(NaN, 50)).toBeNull();
  });
});

describe("flight", () => {
  test("a flat shot at the hill hits the ground", () => {
    const t = makeTerrain("medium", seeded(2));
    const f = simulate(t, 0, 500, 0);
    expect(f.impact.kind).toBe("ground");
    expect(f.impact.x).toBeGreaterThan(CATAPULT_X[0]);
    expect(f.impact.x).toBeLessThan(TOWER_X[1]);
  });

  test("a hard throw backwards hits your own tower (friendly fire)", () => {
    const f = simulate(flat(), 0, -500, 60);
    expect(f.impact).toMatchObject({ kind: "tower", team: 0 });
  });

  test("a hard throw over everything leaves the field", () => {
    const f = simulate(flat(), 0, MAX_SPEED * 0.7, MAX_SPEED * 0.7);
    expect(f.impact.kind).toBe("offscreen");
  });

  test("duration grows with a higher lob", () => {
    const low = simulate(flat(), 0, 400, 100);
    const high = simulate(flat(), 0, 150, 500);
    expect(high.durationMs).toBeGreaterThan(low.durationMs);
  });

  for (const hill of Object.keys(HILL_HEIGHTS) as HillHeight[]) {
    test(`both teams can lob over a ${hill} hill onto the enemy tower`, () => {
      const t = makeTerrain(hill, seeded(11));
      for (const team of [0, 1]) {
        const hits = sweep(t, team).filter((i) => i.kind === "tower" && i.team === 1 - team);
        expect(hits.length).toBeGreaterThan(0);
      }
    });
  }

  test("the hill blocks every flat-ish shot", () => {
    const t = makeTerrain("low", seeded(5));
    for (let pull = MIN_PULL; pull <= MAX_PULL; pull += 10) {
      const v = launchVector(-pull, 0)!;
      expect(simulate(t, 0, v.vx, v.vy).impact.kind).not.toBe("tower");
    }
  });
});

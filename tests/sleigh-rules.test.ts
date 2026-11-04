import { describe, expect, test } from "bun:test";
import {
  CITY,
  CX,
  CY,
  DELIVER_MARGIN,
  PAD_R,
  SLEIGH_HOUSE_CHOICES,
  SLEIGH_MAX_HOUSES,
  SLEIGH_MIN_HOUSES,
  SLEIGH_SPEED,
  SLEIGH_W,
  STICK_DEAD_ZONE,
  MAX_TURN_RATE,
  WALL_SPEED_KEEP,
  hitsHouse,
  houseDistance,
  launchSlot,
  HOUSE_SPOTS,
  pickHouses,
  polygonDistance,
  seededRng,
  sleighColor,
  stepSleigh,
  stickPush,
  type Sleigh,
} from "../src/shared/sleigh-rules.ts";

/** The sleigh's centre stays this far inside the city wall. */
const EDGE = SLEIGH_W / 2;
const LO = { x: CITY.x0 + EDGE, y: CITY.y0 + EDGE };
const HI = { x: CITY.x1 - EDGE, y: CITY.y1 - EDGE };

function at(x: number, y: number, heading = 0, speed = 1): Sleigh {
  return { x, y, heading, speed, distance: 0, scraping: false };
}

/** The stick pushed fully toward `heading` (or `push` of the way). */
function toward(heading: number, push = 1) {
  return { x: Math.cos(heading) * push, y: Math.sin(heading) * push };
}
const LET_GO = { x: 0, y: 0 };

describe("sleigh flight", () => {
  test("a stick held the way it flies keeps it straight at top speed", () => {
    const start = at(CX, CY);
    const { sleigh, bump, turn } = stepSleigh(start, toward(0), true, 100);
    expect(bump).toBe(false);
    expect(turn).toBe(0);
    expect(sleigh.y).toBeCloseTo(start.y, 6);
    expect(sleigh.x - start.x).toBeCloseTo(SLEIGH_SPEED * 0.1, 6);
    expect(sleigh.heading).toBeCloseTo(0, 9);
    expect(sleigh.distance).toBeCloseTo(SLEIGH_SPEED * 0.1, 6);
    expect(sleigh.scraping).toBe(false);
  });

  test("a stopped sleigh stays put until the stick is pushed, then speeds up", () => {
    const start = at(CX, CY, 0, 0);
    expect(stepSleigh(start, LET_GO, true, 100).sleigh).toEqual({ ...start, speed: 0 });
    expect(stepSleigh(start, toward(0, STICK_DEAD_ZONE * 0.9), true, 100).sleigh.speed).toBe(0);
    let s = start;
    s = stepSleigh(s, toward(0), true, 100).sleigh;
    expect(s.speed).toBeGreaterThan(0);
    expect(s.speed).toBeLessThan(1);
    for (let i = 0; i < 10; i++) s = stepSleigh(s, toward(0), true, 100).sleigh;
    expect(s.speed).toBe(1);
  });

  test("how hard the stick is pushed sets the speed", () => {
    expect(stickPush(LET_GO)).toBe(0);
    expect(stickPush({ x: STICK_DEAD_ZONE, y: 0 })).toBe(0);
    expect(stickPush({ x: 0, y: -1 })).toBe(1);
    expect(stickPush({ x: 3, y: 4 })).toBe(1);
    expect(stickPush({ x: Number.NaN, y: 1 })).toBe(0);
    let s = at(CX, CY, 0, 0);
    const half = (1 + STICK_DEAD_ZONE) / 2;
    for (let i = 0; i < 20; i++) s = stepSleigh(s, toward(0, half), true, 50).sleigh;
    expect(s.speed).toBeCloseTo(0.5, 6);
  });

  test("letting go of the stick brings it to a stop", () => {
    let s = at(CX, CY);
    for (let i = 0; i < 20; i++) s = stepSleigh(s, LET_GO, true, 50).sleigh;
    expect(s.speed).toBe(0);
    expect(s.distance).toBeGreaterThan(0);
  });

  test("without fuel a flying sleigh glides to a stop, whatever the stick says", () => {
    let s = at(CX, CY);
    for (let i = 0; i < 40; i++) s = stepSleigh(s, toward(1), false, 50).sleigh;
    expect(s.speed).toBe(0);
    expect(s.heading).toBeCloseTo(0, 9);
    expect(s.distance).toBeGreaterThan(0);
  });

  test("it turns toward the stick: up turns counter-clockwise (heading decreases), down clockwise", () => {
    const left = stepSleigh(at(CX, CY), toward(-Math.PI / 2), true, 50);
    const right = stepSleigh(at(CX, CY), toward(Math.PI / 2), true, 50);
    expect(left.sleigh.heading).toBeLessThan(0);
    expect(right.sleigh.heading).toBeGreaterThan(0);
    expect(left.turn).toBe(-1);
    expect(right.turn).toBe(1);
    // On screen (y down) a left turn moves the sleigh up.
    expect(left.sleigh.y).toBeLessThan(CY);
    expect(right.sleigh.y).toBeGreaterThan(CY);
  });

  test("it turns no faster than MAX_TURN_RATE and settles on the stick's direction", () => {
    let s = at(CX, CY);
    const want = 2.5;
    s = stepSleigh(s, toward(want), true, 100).sleigh;
    expect(s.heading).toBeCloseTo(MAX_TURN_RATE * 0.1, 9);
    for (let i = 0; i < 20; i++) s = stepSleigh(s, toward(want), true, 50).sleigh;
    expect(s.heading).toBeCloseTo(want, 9);
    const r = stepSleigh(s, toward(want), true, 50);
    expect(r.turn).toBeCloseTo(0, 9);
  });

  test("it turns the short way round, even across ±π", () => {
    const s = at(CX, CY, Math.PI - 0.1);
    const r = stepSleigh(s, toward(-Math.PI + 0.1), true, 20);
    expect(r.turn).toBeGreaterThan(0);
  });

  test("a non-finite stick counts as let go", () => {
    const { sleigh, turn } = stepSleigh(at(CX, CY), { x: Number.NaN, y: 1 }, true, 50);
    expect(sleigh.heading).toBeCloseTo(0, 9);
    expect(sleigh.speed).toBeLessThan(1);
    expect(turn).toBe(0);
  });

  test("flying head-on into the wall: clamped, one bump, speed lost, bounced back", () => {
    let s = at(HI.x - 5, CY, 0);
    const r = stepSleigh(s, toward(0), true, 50);
    expect(r.bump).toBe(true);
    expect(r.sleigh.x).toBe(HI.x);
    expect(r.sleigh.speed).toBeCloseTo(WALL_SPEED_KEEP, 6);
    expect(Math.abs(r.sleigh.heading)).toBeCloseTo(Math.PI, 6);
    s = r.sleigh;
    // Now steering away from the wall.
    for (let i = 0; i < 10; i++) {
      const n = stepSleigh(s, toward(Math.PI), true, 50);
      expect(n.bump).toBe(false);
      s = n.sleigh;
    }
    expect(s.x).toBeLessThan(HI.x - 50);
  });

  test("pressing along the wall counts one bump while scraping and slides along it", () => {
    // Flying down the right-hand wall, the stick held into it (down and right).
    let s = at(HI.x - 10, 300, Math.PI / 2 - 0.4);
    let bumps = 0;
    let streak = 0;
    let longest = 0;
    let streakStartY = 0;
    let slid = 0;
    for (let i = 0; i < 40; i++) {
      const was = s.scraping;
      const r = stepSleigh(s, toward(Math.PI / 2 - 0.4), true, 50);
      // A bump only when contact starts.
      expect(r.bump).toBe(!was && r.sleigh.scraping);
      if (r.bump) bumps++;
      s = r.sleigh;
      expect(s.x).toBeGreaterThanOrEqual(LO.x - 1e-9);
      expect(s.x).toBeLessThanOrEqual(HI.x + 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(LO.y - 1e-9);
      expect(s.y).toBeLessThanOrEqual(HI.y + 1e-9);
      if (s.scraping) {
        if (streak === 0) streakStartY = s.y;
        streak++;
        if (streak > longest) {
          longest = streak;
          slid = s.y - streakStartY;
        }
      } else streak = 0;
    }
    // A long scrape along the wall counts once and keeps moving.
    expect(longest).toBeGreaterThanOrEqual(20);
    expect(slid).toBeGreaterThan(300);
    expect(bumps).toBeLessThanOrEqual(3);
  });

  test("distance is the length of the path flown, walls included", () => {
    let s = at(HI.x - 100, LO.y + 100, -0.6);
    let path = 0;
    for (let i = 0; i < 120; i++) {
      const next = stepSleigh(s, toward(i % 30 < 15 ? 0.7 : -2.4, i % 7 === 0 ? 0.5 : 1), i < 100, 50).sleigh;
      path += Math.hypot(next.x - s.x, next.y - s.y);
      s = next;
    }
    expect(s.distance).toBeCloseTo(path, 6);
    expect(s.distance).toBeGreaterThan(1000);
  });
});

describe("houses", () => {
  test("house choices are 15–30", () => {
    expect(SLEIGH_HOUSE_CHOICES[0]).toBe(SLEIGH_MIN_HOUSES);
    expect(SLEIGH_HOUSE_CHOICES.at(-1)).toBe(SLEIGH_MAX_HOUSES);
    expect(SLEIGH_HOUSE_CHOICES.length).toBe(16);
  });

  test("the town has enough houses for the most the host can pick", () => {
    expect(HOUSE_SPOTS.length).toBeGreaterThanOrEqual(SLEIGH_MAX_HOUSES);
  });

  for (let n = SLEIGH_MIN_HOUSES; n <= SLEIGH_MAX_HOUSES; n++) {
    test(`pickHouses(${n}): different town houses inside the city, clear of the pad, same seed → same houses`, () => {
      for (const seed of [1, 7, 42, 1234, 99999]) {
        const houses = pickHouses(n, seededRng(seed));
        expect(houses.length).toBe(n);
        expect(houses.map((h) => h.id)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(new Set(houses.map((h) => h.spot)).size).toBe(n);
        for (const h of houses) {
          expect(h.w).toBeGreaterThan(0);
          expect(h.h).toBeGreaterThan(0);
          for (const [x, y] of h.poly) {
            expect(x).toBeGreaterThan(CITY.x0);
            expect(y).toBeGreaterThan(CITY.y0);
            expect(x).toBeLessThan(CITY.x1);
            expect(y).toBeLessThan(CITY.y1);
            // The bounding box holds the outline.
            expect(x).toBeGreaterThanOrEqual(h.x);
            expect(x).toBeLessThanOrEqual(h.x + h.w);
            expect(y).toBeGreaterThanOrEqual(h.y);
            expect(y).toBeLessThanOrEqual(h.y + h.h);
          }
          // The chimney is on the roof, and so is the box's centre (the tests aim there).
          expect(hitsHouse({ x: h.x + h.chimney.x, y: h.y + h.chimney.y }, h)).toBe(true);
          expect(hitsHouse({ x: h.x + h.w / 2, y: h.y + h.h / 2 }, h)).toBe(true);
          expect(polygonDistance(CX, CY, h.poly)).toBeGreaterThan(PAD_R);
        }
        expect(pickHouses(n, seededRng(seed))).toEqual(houses);
      }
    });
  }

  test("different seeds pick different houses", () => {
    expect(pickHouses(20, seededRng(1))).not.toEqual(pickHouses(20, seededRng(2)));
  });

  test("hitsHouse: the roof outline plus DELIVER_MARGIN; houseDistance from the box's centre", () => {
    const h = { x: 100, y: 200, w: 80, h: 60, poly: [[100, 200], [180, 200], [180, 260], [100, 260]] as [number, number][] };
    expect(hitsHouse({ x: 140, y: 230 }, h)).toBe(true);
    expect(hitsHouse({ x: 100, y: 200 }, h)).toBe(true);
    expect(hitsHouse({ x: 100 - DELIVER_MARGIN, y: 230 }, h)).toBe(true);
    expect(hitsHouse({ x: 140, y: 260 + DELIVER_MARGIN }, h)).toBe(true);
    expect(hitsHouse({ x: 100 - DELIVER_MARGIN - 0.1, y: 230 }, h)).toBe(false);
    expect(hitsHouse({ x: 140, y: 260 + DELIVER_MARGIN + 0.1 }, h)).toBe(false);
    expect(hitsHouse({ x: 500, y: 500 }, h)).toBe(false);
    // A triangle roof: the empty corner of its box is not over the house.
    const tri = { poly: [[0, 0], [100, 0], [0, 100]] as [number, number][] };
    expect(hitsHouse({ x: 20, y: 20 }, tri)).toBe(true);
    expect(hitsHouse({ x: 90, y: 90 }, tri)).toBe(false);
    expect(houseDistance({ x: 140, y: 230 }, h)).toBe(0);
    expect(houseDistance({ x: 143, y: 234 }, h)).toBeCloseTo(5, 9);
  });
});

describe("launch pad", () => {
  test("launch slots are inside the city, stopped, for 1–200 sleighs", () => {
    for (let total = 1; total <= 200; total++) {
      for (let i = 0; i < total; i++) {
        const s = launchSlot(i, total);
        expect(s.x).toBeGreaterThanOrEqual(LO.x);
        expect(s.x).toBeLessThanOrEqual(HI.x);
        expect(s.y).toBeGreaterThanOrEqual(LO.y);
        expect(s.y).toBeLessThanOrEqual(HI.y);
        expect(s.speed).toBe(0);
        expect(s.distance).toBe(0);
        expect(s.scraping).toBe(false);
      }
    }
    // Distinct slots for a small group, all on the pad.
    const slots = Array.from({ length: 8 }, (_, i) => launchSlot(i, 8));
    expect(new Set(slots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`)).size).toBe(8);
    for (const s of slots) expect(Math.hypot(s.x - CX, s.y - CY)).toBeLessThanOrEqual(PAD_R);
  });

  test("sleigh colours are distinct for the first players", () => {
    const colours = new Set(Array.from({ length: 30 }, (_, i) => sleighColor(i)));
    expect(colours.size).toBe(30);
  });
});

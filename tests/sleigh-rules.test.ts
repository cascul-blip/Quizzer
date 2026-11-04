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
  WALL_SPEED_KEEP,
  hitsHouse,
  houseDistance,
  launch,
  launchSlot,
  HOUSE_SPOTS,
  pickHouses,
  polygonDistance,
  seededRng,
  sleighColor,
  stepSleigh,
  type Sleigh,
} from "../src/shared/sleigh-rules.ts";

/** The sleigh's centre stays this far inside the city wall. */
const EDGE = SLEIGH_W / 2;
const LO = { x: CITY.x0 + EDGE, y: CITY.y0 + EDGE };
const HI = { x: CITY.x1 - EDGE, y: CITY.y1 - EDGE };

function at(x: number, y: number, heading = 0, speed = 1): Sleigh {
  return { x, y, heading, speed, distance: 0, scraping: false };
}

describe("sleigh flight", () => {
  test("with fuel and a straight wheel a sleigh flies straight at top speed", () => {
    const start = at(CX, CY);
    const { sleigh, bump } = stepSleigh(start, 0, true, 100);
    expect(bump).toBe(false);
    expect(sleigh.y).toBeCloseTo(start.y, 6);
    expect(sleigh.x - start.x).toBeCloseTo(SLEIGH_SPEED * 0.1, 6);
    expect(sleigh.heading).toBeCloseTo(0, 9);
    expect(sleigh.distance).toBeCloseTo(SLEIGH_SPEED * 0.1, 6);
    expect(sleigh.scraping).toBe(false);
  });

  test("launch gives full speed; a stopped sleigh without fuel stays put", () => {
    expect(launch(at(CX, CY, 0, 0)).speed).toBe(1);
    const start = at(CX, CY, 0, 0);
    const { sleigh } = stepSleigh(start, 1, false, 100);
    expect(sleigh.x).toBe(start.x);
    expect(sleigh.y).toBe(start.y);
    expect(sleigh.speed).toBe(0);
  });

  test("without fuel a flying sleigh glides to a stop", () => {
    let s = at(CX, CY);
    for (let i = 0; i < 40; i++) s = stepSleigh(s, 0, false, 50).sleigh;
    expect(s.speed).toBe(0);
    expect(s.distance).toBeGreaterThan(0);
  });

  test("wheel −1 turns counter-clockwise (heading decreases), +1 clockwise", () => {
    const left = stepSleigh(at(CX, CY), -1, true, 50).sleigh;
    const right = stepSleigh(at(CX, CY), 1, true, 50).sleigh;
    expect(left.heading).toBeLessThan(0);
    expect(right.heading).toBeGreaterThan(0);
    // On screen (y down) a left turn moves the sleigh up.
    expect(left.y).toBeLessThan(CY);
    expect(right.y).toBeGreaterThan(CY);
  });

  test("full lock flies a circle and comes back round", () => {
    let s = at(CX, CY);
    let turned = 0;
    for (let i = 0; i < 200 && turned < 2 * Math.PI; i++) {
      const before = s.heading;
      s = stepSleigh(s, 1, true, 50).sleigh;
      turned += Math.atan2(Math.sin(s.heading - before), Math.cos(s.heading - before));
    }
    expect(turned).toBeGreaterThanOrEqual(2 * Math.PI);
    expect(Math.hypot(s.x - CX, s.y - CY)).toBeLessThan(40);
  });

  test("non-finite wheel counts as straight", () => {
    const { sleigh } = stepSleigh(at(CX, CY), Number.NaN, true, 50);
    expect(sleigh.heading).toBeCloseTo(0, 9);
  });

  test("flying head-on into the wall: clamped, one bump, speed lost, bounced back", () => {
    let s = at(HI.x - 5, CY, 0);
    const r = stepSleigh(s, 0, true, 50);
    expect(r.bump).toBe(true);
    expect(r.sleigh.x).toBe(HI.x);
    expect(r.sleigh.speed).toBeCloseTo(WALL_SPEED_KEEP, 6);
    expect(Math.abs(r.sleigh.heading)).toBeCloseTo(Math.PI, 6);
    s = r.sleigh;
    for (let i = 0; i < 10; i++) {
      const n = stepSleigh(s, 0, true, 50);
      expect(n.bump).toBe(false);
      s = n.sleigh;
    }
    expect(s.x).toBeLessThan(HI.x - 50);
  });

  test("pressing along the wall counts one bump while scraping and slides along it", () => {
    // Flying down the right-hand wall, steering into it.
    let s = at(HI.x - 10, 300, Math.PI / 2 - 0.4);
    let bumps = 0;
    let streak = 0;
    let longest = 0;
    let streakStartY = 0;
    let slid = 0;
    for (let i = 0; i < 40; i++) {
      const was = s.scraping;
      const r = stepSleigh(s, -1, true, 50);
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
      const next = stepSleigh(s, i % 30 < 15 ? 0.7 : -0.4, i < 100, 50).sleigh;
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

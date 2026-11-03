import { describe, expect, test } from "bun:test";
import {
  CX,
  CY,
  KART_SPEED,
  LAP,
  STRAIGHT,
  TURN_R,
  WALL_LIMIT,
  WALL_SPEED_KEEP,
  gridSlot,
  kartColor,
  lapsOf,
  launch,
  stepCar,
  trackCoords,
  trackPoint,
  type Car,
} from "../src/shared/kart-rules.ts";

function carAt(s: number, offset = 0, speed = 1): Car {
  const p = trackPoint(s, offset);
  return { ...p, speed, distance: s, scraping: false };
}

describe("kart rules", () => {
  test("a car with fuel and a straight wheel drives straight at top speed", () => {
    const start = carAt(0);
    const { car, hit } = stepCar(start, 0, true, 100);
    expect(hit).toBe(false);
    expect(car.y).toBeCloseTo(start.y, 6);
    expect(car.x - start.x).toBeCloseTo(KART_SPEED * 0.1, 6);
    expect(car.heading).toBeCloseTo(0, 9);
    expect(car.distance).toBeCloseTo(KART_SPEED * 0.1, 6);
  });

  test("a stopped car without fuel stays put", () => {
    const start = carAt(0, 0, 0);
    const { car } = stepCar(start, 1, false, 100);
    expect(car.x).toBe(start.x);
    expect(car.y).toBe(start.y);
    expect(car.speed).toBe(0);
  });

  test("without fuel a moving car coasts to a stop", () => {
    let car = carAt(0);
    for (let i = 0; i < 40; i++) car = stepCar(car, 0, false, 50).car;
    expect(car.speed).toBe(0);
    expect(car.distance).toBeGreaterThan(0);
  });

  test("wheel −1 turns counter-clockwise (heading decreases), +1 clockwise", () => {
    const left = stepCar(carAt(0), -1, true, 50).car;
    const right = stepCar(carAt(0), 1, true, 50).car;
    expect(left.heading).toBeLessThan(0);
    expect(right.heading).toBeGreaterThan(0);
    // On screen (y down) a left turn moves the car up.
    expect(left.y).toBeLessThan(carAt(0).y);
  });

  test("non-finite wheel counts as straight", () => {
    const { car } = stepCar(carAt(0), Number.NaN, true, 50);
    expect(car.heading).toBeCloseTo(0, 9);
  });

  for (const [name, wheel, side] of [
    ["outside", 1, 1],
    ["inside", -1, -1],
  ] as const) {
    test(`the ${name} wall clamps the car, costs speed and counts one hit while scraping`, () => {
      let car = carAt(0, side * (WALL_LIMIT - 2));
      let hits = 0;
      let firstHitSpeed = -1;
      for (let i = 0; i < 20; i++) {
        const before = car.speed;
        const r = stepCar(car, wheel, true, 50);
        car = r.car;
        if (r.hit) {
          hits++;
          if (firstHitSpeed < 0) firstHitSpeed = car.speed / Math.min(1, before + 0.05);
        }
        expect(Math.abs(trackCoords(car.x, car.y).offset)).toBeLessThanOrEqual(WALL_LIMIT + 1e-6);
      }
      expect(hits).toBe(1);
      expect(firstHitSpeed).toBeCloseTo(WALL_SPEED_KEEP, 6);
      expect(car.scraping).toBe(true);
    });
  }

  test("a lap forwards counts; reversing over the line takes it back", () => {
    let car = launch(carAt(-20));
    // Follow the centre line by steering towards it.
    let guard = 0;
    while (car.distance < LAP + 50 && guard++ < 2000) {
      const ahead = trackPoint(trackCoords(car.x, car.y).s + 60);
      const want = Math.atan2(ahead.y - car.y, ahead.x - car.x);
      const diff = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
      car = stepCar(car, Math.max(-1, Math.min(1, diff * 3)), true, 50).car;
    }
    expect(lapsOf(car.distance)).toBe(1);
    expect(car.distance).toBeGreaterThan(LAP);

    // Turn around just past the line and drive back over it.
    let back: Car = { ...carAt(LAP + 10), heading: Math.PI, distance: LAP + 10 };
    for (let i = 0; i < 4; i++) back = stepCar(back, 0, true, 50).car;
    expect(back.distance).toBeLessThan(LAP);
    expect(lapsOf(back.distance)).toBe(0);
    expect(lapsOf(-100)).toBe(0);
  });

  test("trackPoint and trackCoords round-trip all the way round", () => {
    for (let s = 0; s < LAP; s += LAP / 97) {
      for (const offset of [-WALL_LIMIT, -10, 0, 17, WALL_LIMIT]) {
        const p = trackPoint(s, offset);
        const c = trackCoords(p.x, p.y);
        const ds = Math.abs(c.s - s);
        expect(Math.min(ds, LAP - ds)).toBeLessThan(1e-6);
        expect(c.offset).toBeCloseTo(offset, 6);
      }
    }
    expect(trackPoint(0)).toMatchObject({ x: CX, y: CY + TURN_R, heading: 0 });
    expect(Math.abs(trackPoint(STRAIGHT / 2 + Math.PI * TURN_R).heading)).toBeCloseTo(Math.PI, 6);
  });

  test("grid slots stay on the track and behind the line for 1–200 cars", () => {
    for (let total = 1; total <= 200; total++) {
      for (let i = 0; i < total; i++) {
        const car = gridSlot(i, total);
        expect(car.distance).toBeLessThan(0);
        expect(car.distance).toBeGreaterThan(-LAP);
        expect(car.speed).toBe(0);
        const c = trackCoords(car.x, car.y);
        expect(Math.abs(c.offset)).toBeLessThanOrEqual(WALL_LIMIT + 1e-6);
      }
    }
    // Distinct slots for a small field.
    const keys = new Set(Array.from({ length: 12 }, (_, i) => { const c = gridSlot(i, 12); return `${c.x.toFixed(1)},${c.y.toFixed(1)}`; }));
    expect(keys.size).toBe(12);
  });

  test("car colours are distinct for the first players", () => {
    const colours = new Set(Array.from({ length: 30 }, (_, i) => kartColor(i)));
    expect(colours.size).toBe(30);
  });
});

import { describe, expect, test } from "bun:test";
import {
  RACER_CONFIDENCE,
  RACER_CONFIDENCE_LEVELS,
  RACER_CRASH_BELOW_MPH,
  RACER_GAIN_MPH,
  RACER_REPAIR_MPH,
  RACER_START_MPH,
  RACER_TURN_MINUTES,
  applyRacerTurn,
  newRacerCar,
  racerOutcome,
  racerRepairs,
  type RacerCar,
} from "../src/shared/racer-rules.ts";

const car = (over: Partial<RacerCar> = {}): RacerCar => ({ ...newRacerCar(), ...over });

describe("Racer constants", () => {
  test("the numbers the rules were agreed with", () => {
    expect([RACER_START_MPH, RACER_REPAIR_MPH, RACER_CRASH_BELOW_MPH, RACER_TURN_MINUTES]).toEqual([30, 30, 20, 10]);
    expect(RACER_GAIN_MPH).toEqual({ low: 0, mid: 20, high: 40 });
    expect(RACER_CONFIDENCE_LEVELS).toEqual(["low", "mid", "high"]);
    expect(RACER_CONFIDENCE_LEVELS.map((l) => RACER_CONFIDENCE[l].label)).toEqual(["Not confident", "Confident", "Extremely confident"]);
    for (const l of RACER_CONFIDENCE_LEVELS) {
      expect(RACER_CONFIDENCE[l].gain).toBe(RACER_GAIN_MPH[l]);
      expect(RACER_CONFIDENCE[l].needs.length).toBeGreaterThan(0);
    }
    expect(newRacerCar()).toEqual({ speed: 30, crashed: false, distance: 0, topSpeed: 30, crashes: 0 });
  });
});

describe("racerOutcome", () => {
  test("low: no change with at least a quarter right, else 1 fail", () => {
    expect(racerOutcome("low", 12, 12)).toEqual({ gain: 0, fails: 0 });
    expect(racerOutcome("low", 3, 12)).toEqual({ gain: 0, fails: 0 }); // exactly 1/4
    expect(racerOutcome("low", 2, 12)).toEqual({ gain: 0, fails: 1 });
    expect(racerOutcome("low", 1, 4)).toEqual({ gain: 0, fails: 0 }); // exactly 1/4
    expect(racerOutcome("low", 1, 5)).toEqual({ gain: 0, fails: 1 }); // just under 1/4
    expect(racerOutcome("low", 0, 1)).toEqual({ gain: 0, fails: 1 });
    expect(racerOutcome("low", 1, 1)).toEqual({ gain: 0, fails: 0 });
  });

  test("mid: +20 with at least two thirds right, 1 fail down to a quarter, else 2 fails", () => {
    expect(racerOutcome("mid", 12, 12)).toEqual({ gain: 20, fails: 0 });
    expect(racerOutcome("mid", 8, 12)).toEqual({ gain: 20, fails: 0 }); // exactly 2/3
    expect(racerOutcome("mid", 7, 12)).toEqual({ gain: 0, fails: 1 });
    expect(racerOutcome("mid", 3, 12)).toEqual({ gain: 0, fails: 1 }); // exactly 1/4
    expect(racerOutcome("mid", 2, 12)).toEqual({ gain: 0, fails: 2 });
    expect(racerOutcome("mid", 0, 12)).toEqual({ gain: 0, fails: 2 });
    expect(racerOutcome("mid", 2, 3)).toEqual({ gain: 20, fails: 0 }); // exactly 2/3
    expect(racerOutcome("mid", 1, 3)).toEqual({ gain: 0, fails: 1 });
    expect(racerOutcome("mid", 1, 2)).toEqual({ gain: 0, fails: 1 }); // half is not two thirds
    expect(racerOutcome("mid", 1, 5)).toEqual({ gain: 0, fails: 2 }); // just under 1/4
  });

  test("high: +40 only when everyone is right, then 1, 2 or 3 fails", () => {
    expect(racerOutcome("high", 12, 12)).toEqual({ gain: 40, fails: 0 });
    expect(racerOutcome("high", 1, 1)).toEqual({ gain: 40, fails: 0 });
    expect(racerOutcome("high", 11, 12)).toEqual({ gain: 0, fails: 1 });
    expect(racerOutcome("high", 8, 12)).toEqual({ gain: 0, fails: 1 }); // exactly 2/3
    expect(racerOutcome("high", 7, 12)).toEqual({ gain: 0, fails: 2 });
    expect(racerOutcome("high", 6, 12)).toEqual({ gain: 0, fails: 2 }); // exactly 1/2
    expect(racerOutcome("high", 5, 12)).toEqual({ gain: 0, fails: 3 });
    expect(racerOutcome("high", 0, 12)).toEqual({ gain: 0, fails: 3 });
    expect(racerOutcome("high", 1, 2)).toEqual({ gain: 0, fails: 2 }); // exactly 1/2
    expect(racerOutcome("high", 2, 3)).toEqual({ gain: 0, fails: 1 }); // exactly 2/3
    expect(racerOutcome("high", 1, 3)).toEqual({ gain: 0, fails: 3 });
    expect(racerOutcome("high", 0, 1)).toEqual({ gain: 0, fails: 3 });
  });

  test("nobody to count: nothing happens at any level", () => {
    for (const level of RACER_CONFIDENCE_LEVELS) expect(racerOutcome(level, 0, 0)).toEqual({ gain: 0, fails: 0 });
  });
});

describe("racerRepairs", () => {
  test("at least half right repairs the car", () => {
    expect(racerRepairs(6, 12)).toBe(true); // exactly 1/2
    expect(racerRepairs(5, 12)).toBe(false);
    expect(racerRepairs(12, 12)).toBe(true);
    expect(racerRepairs(1, 2)).toBe(true);
    expect(racerRepairs(1, 3)).toBe(false);
    expect(racerRepairs(2, 3)).toBe(true);
    expect(racerRepairs(0, 1)).toBe(false);
    expect(racerRepairs(0, 0)).toBe(false);
  });
});

describe("applyRacerTurn", () => {
  test("a gain speeds the car up and the turn adds 10 minutes of driving", () => {
    const before = car();
    const { car: after, summary } = applyRacerTurn(before, { confidence: "mid", correct: 2, total: 3 });
    expect(after).toEqual({ speed: 50, crashed: false, distance: 50 / 6, topSpeed: 50, crashes: 0 });
    expect(summary).toEqual({ confidence: "mid", correct: 2, total: 3, gain: 20, fails: 0, speedBefore: 30, speedAfter: 50, crashed: false, repaired: false, distanceAdded: 50 / 6 });
    // The car passed in is left alone.
    expect(before).toEqual(newRacerCar());
    expect(applyRacerTurn(after, { confidence: "high", correct: 3, total: 3 }).car).toMatchObject({ speed: 90, topSpeed: 90 });
  });

  test("low confidence and a good enough class: the car just keeps going", () => {
    const { car: after, summary } = applyRacerTurn(car({ speed: 50, topSpeed: 70, distance: 10 }), { confidence: "low", correct: 1, total: 4 });
    expect(after).toEqual({ speed: 50, crashed: false, distance: 10 + 50 / 6, topSpeed: 70, crashes: 0 });
    expect(summary).toMatchObject({ gain: 0, fails: 0, speedBefore: 50, speedAfter: 50, crashed: false });
  });

  test("each fail halves the speed", () => {
    expect(applyRacerTurn(car({ speed: 50 }), { confidence: "low", correct: 0, total: 4 }).summary).toMatchObject({ fails: 1, speedAfter: 25, crashed: false, distanceAdded: 25 / 6 });
    expect(applyRacerTurn(car({ speed: 90 }), { confidence: "mid", correct: 0, total: 4 }).summary).toMatchObject({ fails: 2, speedAfter: 22.5, crashed: false });
    expect(applyRacerTurn(car({ speed: 170 }), { confidence: "high", correct: 0, total: 4 }).summary).toMatchObject({ fails: 3, speedAfter: 21.25, crashed: false });
    // Top speed remembers the best turn, not the speed before a fail.
    expect(applyRacerTurn(car({ speed: 50, topSpeed: 50 }), { confidence: "low", correct: 0, total: 4 }).car.topSpeed).toBe(50);
  });

  test("ending under 20 mph is a crash; exactly 20 is not", () => {
    const { car: crashed, summary } = applyRacerTurn(car({ distance: 12 }), { confidence: "low", correct: 0, total: 4 });
    expect(crashed).toEqual({ speed: 0, crashed: true, distance: 12, topSpeed: 30, crashes: 1 });
    expect(summary).toMatchObject({ fails: 1, speedBefore: 30, speedAfter: 0, crashed: true, repaired: false, distanceAdded: 0 });

    expect(applyRacerTurn(car({ speed: 40 }), { confidence: "low", correct: 0, total: 4 }).car).toMatchObject({ speed: 20, crashed: false, crashes: 0 });
    expect(applyRacerTurn(car({ speed: 39 }), { confidence: "low", correct: 0, total: 4 }).car).toMatchObject({ speed: 0, crashed: true, crashes: 1 });
    expect(applyRacerTurn(car({ speed: 80 }), { confidence: "mid", correct: 0, total: 4 }).car).toMatchObject({ speed: 20, crashed: false });
    expect(applyRacerTurn(car({ speed: 70 }), { confidence: "mid", correct: 0, total: 4 }).car).toMatchObject({ speed: 0, crashed: true });
    expect(applyRacerTurn(car({ speed: 70, crashes: 2 }), { confidence: "high", correct: 0, total: 4 }).car).toMatchObject({ speed: 0, crashed: true, crashes: 3 });
  });

  test("a crashed car ignores the lever: half the class right repairs it, less leaves it where it is", () => {
    const wreck = car({ speed: 0, crashed: true, distance: 20, topSpeed: 70, crashes: 1 });
    const stuck = applyRacerTurn(wreck, { confidence: "high", correct: 1, total: 4 });
    expect(stuck.car).toEqual(wreck);
    expect(stuck.summary).toEqual({ confidence: null, correct: 1, total: 4, gain: 0, fails: 0, speedBefore: 0, speedAfter: 0, crashed: false, repaired: false, distanceAdded: 0 });

    const fixed = applyRacerTurn(wreck, { confidence: null, correct: 2, total: 4 });
    expect(fixed.car).toEqual({ speed: 30, crashed: false, distance: 25, topSpeed: 70, crashes: 1 });
    expect(fixed.summary).toMatchObject({ confidence: null, gain: 0, fails: 0, speedBefore: 0, speedAfter: 30, crashed: false, repaired: true, distanceAdded: 5 });
  });

  test("nobody to count: no gain, no fails, no repair", () => {
    for (const level of RACER_CONFIDENCE_LEVELS) {
      const { car: after, summary } = applyRacerTurn(car({ speed: 50, topSpeed: 50 }), { confidence: level, correct: 0, total: 0 });
      expect(after).toMatchObject({ speed: 50, crashed: false, crashes: 0 });
      expect(summary).toMatchObject({ gain: 0, fails: 0, crashed: false, repaired: false });
    }
    const wreck = car({ speed: 0, crashed: true, crashes: 1 });
    expect(applyRacerTurn(wreck, { confidence: null, correct: 0, total: 0 }).car).toEqual(wreck);
  });

  test("a running car without a driver keeps its speed", () => {
    const { car: after, summary } = applyRacerTurn(car({ speed: 50 }), { confidence: null, correct: 0, total: 3 });
    expect(after).toMatchObject({ speed: 50, crashed: false, distance: 50 / 6 });
    expect(summary).toMatchObject({ confidence: null, gain: 0, fails: 0, speedAfter: 50 });
  });
});

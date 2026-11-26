import { describe, expect, test } from "bun:test";
import type { RacerCar } from "../src/shared/racer-rules.ts";
import {
  applyRacerTurn,
  newRacerCar,
  RACER_CONFIDENCE,
  RACER_CONFIDENCE_LEVELS,
  RACER_CRASH_BELOW_MPH,
  RACER_GAIN_MPH,
  RACER_REPAIR_MPH,
  RACER_START_MPH,
  RACER_TURN_MINUTES,
  racerOutcome,
  racerRepairs,
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
    expect(newRacerCar()).toEqual({ speedMph: 30, crashed: false, distanceMiles: 0, topSpeedMph: 30, crashes: 0 });
  });
});

describe("racerOutcome", () => {
  test.each([
    ["everyone right", 12, 12, 0],
    ["exactly a quarter of 12", 3, 12, 0],
    ["under a quarter of 12", 2, 12, 1],
    ["exactly a quarter of 4", 1, 4, 0],
    ["just under a quarter", 1, 5, 1],
    ["nobody right of 1", 0, 1, 1],
    ["the only player right", 1, 1, 0],
  ])("low, %s: no change with at least a quarter right, else 1 fail", (_case, correct, total, fails) => {
    expect(racerOutcome("low", correct, total)).toEqual({ gain: 0, fails });
  });

  test.each([
    ["everyone right", 12, 12, 20, 0],
    ["exactly two thirds of 12", 8, 12, 20, 0],
    ["under two thirds of 12", 7, 12, 0, 1],
    ["exactly a quarter of 12", 3, 12, 0, 1],
    ["under a quarter of 12", 2, 12, 0, 2],
    ["nobody right", 0, 12, 0, 2],
    ["exactly two thirds of 3", 2, 3, 20, 0],
    ["one third", 1, 3, 0, 1],
    ["half is not two thirds", 1, 2, 0, 1],
    ["just under a quarter", 1, 5, 0, 2],
  ])("mid, %s: +20 with at least two thirds right, 1 fail down to a quarter, else 2 fails", (_case, correct, total, gain, fails) => {
    expect(racerOutcome("mid", correct, total)).toEqual({ gain, fails });
  });

  test.each([
    ["everyone right of 12", 12, 12, 40, 0],
    ["the only player right", 1, 1, 40, 0],
    ["one wrong", 11, 12, 0, 1],
    ["exactly two thirds of 12", 8, 12, 0, 1],
    ["under two thirds of 12", 7, 12, 0, 2],
    ["exactly half of 12", 6, 12, 0, 2],
    ["under half of 12", 5, 12, 0, 3],
    ["nobody right of 12", 0, 12, 0, 3],
    ["exactly half of 2", 1, 2, 0, 2],
    ["exactly two thirds of 3", 2, 3, 0, 1],
    ["one third", 1, 3, 0, 3],
    ["nobody right of 1", 0, 1, 0, 3],
  ])("high, %s: +40 only when everyone is right, then 1, 2 or 3 fails", (_case, correct, total, gain, fails) => {
    expect(racerOutcome("high", correct, total)).toEqual({ gain, fails });
  });

  test("nobody to count: nothing happens at any level", () => {
    for (const level of RACER_CONFIDENCE_LEVELS) expect(racerOutcome(level, 0, 0)).toEqual({ gain: 0, fails: 0 });
  });
});

describe("racerRepairs", () => {
  test.each([
    ["exactly half of 12", 6, 12, true],
    ["under half of 12", 5, 12, false],
    ["everyone right", 12, 12, true],
    ["exactly half of 2", 1, 2, true],
    ["one third", 1, 3, false],
    ["two thirds", 2, 3, true],
    ["nobody right of 1", 0, 1, false],
    ["nobody to count", 0, 0, false],
  ])("%s: at least half right repairs the car", (_case, correct, total, repairs) => {
    expect(racerRepairs(correct, total)).toBe(repairs);
  });
});

describe("applyRacerTurn", () => {
  test("a gain speeds the car up and the turn adds 10 minutes of driving", () => {
    const before = car();
    const { car: after, summary } = applyRacerTurn(before, { confidence: "mid", correct: 2, total: 3 });
    expect(after).toEqual({ speedMph: 50, crashed: false, distanceMiles: 50 / 6, topSpeedMph: 50, crashes: 0 });
    expect(summary).toEqual({
      confidence: "mid",
      correct: 2,
      total: 3,
      gainMph: 20,
      fails: 0,
      speedBefore: 30,
      speedAfter: 50,
      crashed: false,
      repaired: false,
      distanceAdded: 50 / 6,
    });
    const inputCarUnchanged = before;
    expect(inputCarUnchanged).toEqual(newRacerCar());
    expect(applyRacerTurn(after, { confidence: "high", correct: 3, total: 3 }).car).toMatchObject({ speedMph: 90, topSpeedMph: 90 });
  });

  test("low confidence and a good enough class: the car just keeps going", () => {
    const { car: after, summary } = applyRacerTurn(car({ speedMph: 50, topSpeedMph: 70, distanceMiles: 10 }), { confidence: "low", correct: 1, total: 4 });
    expect(after).toEqual({ speedMph: 50, crashed: false, distanceMiles: 10 + 50 / 6, topSpeedMph: 70, crashes: 0 });
    expect(summary).toMatchObject({ gainMph: 0, fails: 0, speedBefore: 50, speedAfter: 50, crashed: false });
  });

  test("each fail halves the speed", () => {
    expect(applyRacerTurn(car({ speedMph: 50 }), { confidence: "low", correct: 0, total: 4 }).summary).toMatchObject({
      fails: 1,
      speedAfter: 25,
      crashed: false,
      distanceAdded: 25 / 6,
    });
    expect(applyRacerTurn(car({ speedMph: 90 }), { confidence: "mid", correct: 0, total: 4 }).summary).toMatchObject({
      fails: 2,
      speedAfter: 22.5,
      crashed: false,
    });
    expect(applyRacerTurn(car({ speedMph: 170 }), { confidence: "high", correct: 0, total: 4 }).summary).toMatchObject({
      fails: 3,
      speedAfter: 21.25,
      crashed: false,
    });
    expect(applyRacerTurn(car({ speedMph: 50, topSpeedMph: 50 }), { confidence: "low", correct: 0, total: 4 }).car.topSpeedMph).toBe(50);
  });

  test("ending under 20 mph is a crash; exactly 20 is not", () => {
    const { car: crashed, summary } = applyRacerTurn(car({ distanceMiles: 12 }), { confidence: "low", correct: 0, total: 4 });
    expect(crashed).toEqual({ speedMph: 0, crashed: true, distanceMiles: 12, topSpeedMph: 30, crashes: 1 });
    expect(summary).toMatchObject({ fails: 1, speedBefore: 30, speedAfter: 0, crashed: true, repaired: false, distanceAdded: 0 });

    expect(applyRacerTurn(car({ speedMph: 40 }), { confidence: "low", correct: 0, total: 4 }).car).toMatchObject({ speedMph: 20, crashed: false, crashes: 0 });
    expect(applyRacerTurn(car({ speedMph: 39 }), { confidence: "low", correct: 0, total: 4 }).car).toMatchObject({ speedMph: 0, crashed: true, crashes: 1 });
    expect(applyRacerTurn(car({ speedMph: 80 }), { confidence: "mid", correct: 0, total: 4 }).car).toMatchObject({ speedMph: 20, crashed: false });
    expect(applyRacerTurn(car({ speedMph: 70 }), { confidence: "mid", correct: 0, total: 4 }).car).toMatchObject({ speedMph: 0, crashed: true });
    expect(applyRacerTurn(car({ speedMph: 70, crashes: 2 }), { confidence: "high", correct: 0, total: 4 }).car).toMatchObject({
      speedMph: 0,
      crashed: true,
      crashes: 3,
    });
  });

  test("a crashed car ignores the lever: half the class right repairs it, less leaves it where it is", () => {
    const wreck = car({ speedMph: 0, crashed: true, distanceMiles: 20, topSpeedMph: 70, crashes: 1 });
    const stuck = applyRacerTurn(wreck, { confidence: "high", correct: 1, total: 4 });
    expect(stuck.car).toEqual(wreck);
    expect(stuck.summary).toEqual({
      confidence: null,
      correct: 1,
      total: 4,
      gainMph: 0,
      fails: 0,
      speedBefore: 0,
      speedAfter: 0,
      crashed: false,
      repaired: false,
      distanceAdded: 0,
    });

    const fixed = applyRacerTurn(wreck, { confidence: null, correct: 2, total: 4 });
    expect(fixed.car).toEqual({ speedMph: 30, crashed: false, distanceMiles: 25, topSpeedMph: 70, crashes: 1 });
    expect(fixed.summary).toMatchObject({
      confidence: null,
      gainMph: 0,
      fails: 0,
      speedBefore: 0,
      speedAfter: 30,
      crashed: false,
      repaired: true,
      distanceAdded: 5,
    });
  });

  test("nobody to count: no gain, no fails, no repair", () => {
    for (const level of RACER_CONFIDENCE_LEVELS) {
      const { car: after, summary } = applyRacerTurn(car({ speedMph: 50, topSpeedMph: 50 }), { confidence: level, correct: 0, total: 0 });
      expect(after).toMatchObject({ speedMph: 50, crashed: false, crashes: 0 });
      expect(summary).toMatchObject({ gainMph: 0, fails: 0, crashed: false, repaired: false });
    }
    const wreck = car({ speedMph: 0, crashed: true, crashes: 1 });
    expect(applyRacerTurn(wreck, { confidence: null, correct: 0, total: 0 }).car).toEqual(wreck);
  });

  test("a running car without a driver keeps its speed", () => {
    const { car: after, summary } = applyRacerTurn(car({ speedMph: 50 }), { confidence: null, correct: 0, total: 3 });
    expect(after).toMatchObject({ speedMph: 50, crashed: false, distanceMiles: 50 / 6 });
    expect(summary).toMatchObject({ confidence: null, gainMph: 0, fails: 0, speedAfter: 50 });
  });
});

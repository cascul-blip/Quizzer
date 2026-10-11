// Racer: the rules of the shared car as pure functions and constants.
// Used by the server engine and by the screens (to explain the lever and replay a turn).
// No imports on purpose: this file must stay usable from both sides.

/** How sure the driver is that the class will answer this question correctly. */
export type RacerConfidence = "low" | "mid" | "high";
/** Lever positions from bottom to top; the lever starts on the first one. */
export const RACER_CONFIDENCE_LEVELS: readonly RacerConfidence[] = ["low", "mid", "high"];

/** Speed at the start of the game. */
export const RACER_START_MPH = 30;
/** Speed right after a repair. */
export const RACER_REPAIR_MPH = 30;
/** A car that ends a turn slower than this has crashed (speed drops to 0). */
export const RACER_CRASH_BELOW_MPH = 20;
/** Speed gained when the class does as well as the lever promised. */
export const RACER_GAIN_MPH: Record<RacerConfidence, number> = { low: 0, mid: 20, high: 40 };
/** Each turn is this many minutes of driving at the speed the turn ended on. */
export const RACER_TURN_MINUTES = 10;

/** What the screens show for each lever position. `needs` is a one-line summary of what earns the gain. */
export const RACER_CONFIDENCE: Record<RacerConfidence, { label: string; gain: number; needs: string }> = {
  low: { label: "Not confident", gain: RACER_GAIN_MPH.low, needs: "No speed gain. Safe if at least 1 in 4 answers right." },
  mid: { label: "Confident", gain: RACER_GAIN_MPH.mid, needs: "+20 mph if at least 2 in 3 answer right." },
  high: { label: "Extremely confident", gain: RACER_GAIN_MPH.high, needs: "+40 mph if everyone answers right." },
};

/** The class's shared car. */
export interface RacerCar {
  /** Miles per hour; may be fractional (each fail halves it). 0 while crashed. */
  speed: number;
  /** A crashed car has no driver; it stays put until the class repairs it. */
  crashed: boolean;
  /** Miles driven so far. */
  distance: number;
  /** Highest speed a turn ended on. */
  topSpeed: number;
  /** How many times the car has crashed. */
  crashes: number;
}

export function newRacerCar(): RacerCar {
  return { speed: RACER_START_MPH, crashed: false, distance: 0, topSpeed: RACER_START_MPH, crashes: 0 };
}

/**
 * What a driven turn earns: `gain` mph (0, 20 or 40) or `fails` (0 to 3), never both.
 * `correct` of the `total` players who count answered right; no answer counts as wrong.
 * With nobody to count (total 0) nothing happens.
 */
export function racerOutcome(confidence: RacerConfidence, correct: number, total: number): { gain: number; fails: number } {
  const c = correct;
  const n = total;
  if (n <= 0) return { gain: 0, fails: 0 };
  switch (confidence) {
    case "low":
      return { gain: 0, fails: 4 * c >= n ? 0 : 1 };
    case "mid":
      if (3 * c >= 2 * n) return { gain: RACER_GAIN_MPH.mid, fails: 0 };
      return { gain: 0, fails: 4 * c >= n ? 1 : 2 };
    case "high":
      if (c === n) return { gain: RACER_GAIN_MPH.high, fails: 0 };
      return { gain: 0, fails: 3 * c >= 2 * n ? 1 : 2 * c >= n ? 2 : 3 };
  }
}

/** A crashed car is repaired when at least half of the players who count answer right. */
export function racerRepairs(correct: number, total: number): boolean {
  return total > 0 && 2 * correct >= total;
}

export interface RacerTurnInput {
  /** The driver's locked lever; null when the turn had no driver (car crashed, or nobody connected). */
  confidence: RacerConfidence | null;
  /** Correct answers. */
  correct: number;
  /** Players who count: connected when the question closed, plus disconnected ones who answered. */
  total: number;
}

/** What one turn did to the car. */
export interface RacerTurnResult {
  /** The lever that was played; null on a turn without a driver. */
  confidence: RacerConfidence | null;
  correct: number;
  total: number;
  /** Mph gained: 0, 20 or 40. */
  gain: number;
  /** Fail points, 0 to 3; each one halved the speed. */
  fails: number;
  speedBefore: number;
  speedAfter: number;
  /** This turn crashed the car. */
  crashed: boolean;
  /** This turn repaired a crashed car. */
  repaired: boolean;
  /** Miles driven this turn (speedAfter for RACER_TURN_MINUTES). */
  distanceAdded: number;
}

/**
 * Play one turn: returns the car afterwards and a summary of what happened (the input car is left untouched).
 * A crashed car ignores the lever and can only be repaired; a car without a driver keeps its speed.
 */
export function applyRacerTurn(car: RacerCar, turn: RacerTurnInput): { car: RacerCar; summary: RacerTurnResult } {
  const speedBefore = car.speed;
  let speed = car.speed;
  let confidence: RacerConfidence | null = null;
  let gain = 0;
  let fails = 0;
  let crashed = false;
  let repaired = false;
  if (car.crashed) {
    if (racerRepairs(turn.correct, turn.total)) {
      repaired = true;
      speed = RACER_REPAIR_MPH;
    }
  } else if (turn.confidence) {
    confidence = turn.confidence;
    ({ gain, fails } = racerOutcome(confidence, turn.correct, turn.total));
    speed += gain;
    for (let i = 0; i < fails; i++) speed /= 2;
    if (speed < RACER_CRASH_BELOW_MPH) {
      speed = 0;
      crashed = true;
    }
  }
  const distanceAdded = (speed * RACER_TURN_MINUTES) / 60;
  return {
    car: {
      speed,
      crashed: crashed || (car.crashed && !repaired),
      distance: car.distance + distanceAdded,
      topSpeed: Math.max(car.topSpeed, speed),
      crashes: car.crashes + (crashed ? 1 : 0),
    },
    summary: { confidence, correct: turn.correct, total: turn.total, gain, fails, speedBefore, speedAfter: speed, crashed, repaired, distanceAdded },
  };
}

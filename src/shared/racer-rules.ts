export type RacerConfidence = "low" | "mid" | "high";
/** why: ordered bottom to top; the lever starts on the first one. */
export const RACER_CONFIDENCE_LEVELS: readonly RacerConfidence[] = ["low", "mid", "high"];

export const RACER_START_MPH = 30;
export const RACER_REPAIR_MPH = 30;
export const RACER_CRASH_BELOW_MPH = 20;
export const RACER_GAIN_MPH: Record<RacerConfidence, number> = { low: 0, mid: 20, high: 40 };
export const RACER_TURN_MINUTES = 10;

export const RACER_CONFIDENCE: Record<RacerConfidence, { label: string; gain: number; needs: string }> = {
  low: { label: "Not confident", gain: RACER_GAIN_MPH.low, needs: "No speed gain. Safe if at least 1 in 4 answers right." },
  mid: { label: "Confident", gain: RACER_GAIN_MPH.mid, needs: "+20 mph if at least 2 in 3 answer right." },
  high: { label: "Extremely confident", gain: RACER_GAIN_MPH.high, needs: "+40 mph if everyone answers right." },
};

export interface RacerCar {
  speedMph: number;
  crashed: boolean;
  distanceMiles: number;
  topSpeedMph: number;
  crashes: number;
}

export function newRacerCar(): RacerCar {
  return { speedMph: RACER_START_MPH, crashed: false, distanceMiles: 0, topSpeedMph: RACER_START_MPH, crashes: 0 };
}

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

export function racerRepairs(correct: number, total: number): boolean {
  return total > 0 && 2 * correct >= total;
}

interface RacerTurnInput {
  /** why: null when the turn had no driver (car crashed, or nobody connected). */
  confidence: RacerConfidence | null;
  correct: number;
  /** why: connected when the question closed, plus disconnected players who answered. */
  total: number;
}

export interface RacerTurnResult {
  confidence: RacerConfidence | null;
  correct: number;
  total: number;
  gainMph: number;
  fails: number;
  speedBefore: number;
  speedAfter: number;
  crashed: boolean;
  repaired: boolean;
  distanceAdded: number;
}

export function applyRacerTurn(car: RacerCar, turn: RacerTurnInput): { car: RacerCar; summary: RacerTurnResult } {
  const speedBefore = car.speedMph;
  let speed = car.speedMph;
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
      speedMph: speed,
      crashed: crashed || (car.crashed && !repaired),
      distanceMiles: car.distanceMiles + distanceAdded,
      topSpeedMph: Math.max(car.topSpeedMph, speed),
      crashes: car.crashes + (crashed ? 1 : 0),
    },
    summary: { confidence, correct: turn.correct, total: turn.total, gainMph: gain, fails, speedBefore, speedAfter: speed, crashed, repaired, distanceAdded },
  };
}

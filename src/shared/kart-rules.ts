/**
 * Kart Rally: the oval, the cars and how they drive.
 *
 * Pure and deterministic so the server (which moves every car) and the projector
 * (which draws the track and smooths the cars between ticks) always agree.
 * Field units with y pointing down (screen coordinates). The track is TRACK_W
 * wide and a car CAR_W wide, the projector scales the whole field to fit.
 *
 * The oval is a stadium: two straights joined by two half circles. Cars race
 * counter-clockwise as seen on screen (left turns, like an Indy oval), starting
 * from the middle of the bottom straight.
 */

export const FIELD_W = 1600;
export const FIELD_H = 900;
export const TRACK_W = 100;
export const CAR_W = 30;
export const CAR_L = 50;
/** Centre of the field and of the oval. */
export const CX = FIELD_W / 2;
export const CY = FIELD_H / 2;
/** Radius of the turns, measured to the centre line. */
export const TURN_R = 290;
/** Length of each straight. */
export const STRAIGHT = 720;
/** One lap along the centre line. */
export const LAP = 2 * STRAIGHT + 2 * Math.PI * TURN_R;
/** How far a car's centre can stray from the centre line before it touches a wall. */
export const WALL_LIMIT = TRACK_W / 2 - CAR_W / 2;

/** Top speed, field units per second (a lap takes about 9 s). */
export const KART_SPEED = 380;
/** Turning rate at full lock, radians per second (a turn radius of about 150 at top speed). */
export const MAX_TURN_RATE = 2.5;
/** The phone's wheel turns this far each way. */
export const WHEEL_MAX_DEG = 135;
/** Fraction of its speed a car keeps when it hits a wall. */
export const WALL_SPEED_KEEP = 0.5;
/** How much of the push into the wall bounces back off it. */
const WALL_BOUNCE = 0.3;
/** Speed regained per second after a wall hit (as a fraction of top speed). */
const RECOVER_PER_S = 1;
/** Speed lost per second once a car runs out of driving time (coasting to a stop). */
const COAST_PER_S = 2;

export const KART_QUIZ_MS = 15_000;
export const KART_INTRO_MS = 3000;
export const KART_COUNTDOWN_MS = 3000;
export const KART_DRIVE_CAP_MS = 20_000;
/** After the last car stops, the drive phase holds this long before the next round. */
export const KART_DRIVE_HOLD_MS = 1500;
export const KART_TICK_MS = 50;
/** Each correct answer buys this much driving. */
export const KART_MS_PER_POINT = 1000;
export const KART_ROUND_CHOICES = [3, 4, 5, 6, 7, 8, 10] as const;
export const KART_DEFAULT_ROUNDS = 5;

/** Distinct car paint for the first players; later ones step round the colour wheel. */
const PAINT = ["#e63946", "#1d6fe0", "#f4a100", "#2a9d3f", "#8e44ad", "#00a6b4", "#ff6b9d", "#f2f2f2", "#ff7a1a", "#1f2a44", "#9acd32", "#8b5a2b"];

export function kartColor(i: number): string {
  if (i < PAINT.length) return PAINT[i]!;
  const hue = Math.round((i * 137.508) % 360);
  return `hsl(${hue} 75% 52%)`;
}

export interface CarPose {
  x: number;
  y: number;
  /** Direction of travel in radians; 0 = +x (right), positive turns clockwise on screen. */
  heading: number;
}

export interface Car extends CarPose {
  /** Fraction of top speed, 0…1. */
  speed: number;
  /** Distance driven along the track since the start line (negative while behind it on the grid). */
  distance: number;
  /** Touching a wall since the last tick (a new hit counts only when contact starts). */
  scraping: boolean;
}

/** Where (x, y) is relative to the centre line: s = distance along it from the start line (0…LAP), offset = signed distance from it (positive = towards the outside wall). */
export function trackCoords(x: number, y: number): { s: number; offset: number } {
  const half = STRAIGHT / 2;
  if (x > CX + half) {
    const dx = x - (CX + half);
    const dy = y - CY;
    const theta = Math.atan2(dy, dx); // π/2 at the bottom, −π/2 at the top
    return { s: half + (Math.PI / 2 - theta) * TURN_R, offset: Math.hypot(dx, dy) - TURN_R };
  }
  if (x < CX - half) {
    const dx = x - (CX - half);
    const dy = y - CY;
    let phi = Math.atan2(dy, dx);
    if (phi < Math.PI / 2) phi += 2 * Math.PI; // π/2…5π/2 → the left half is π/2…3π/2
    return { s: half + Math.PI * TURN_R + STRAIGHT + ((3 * Math.PI) / 2 - phi) * TURN_R, offset: Math.hypot(dx, dy) - TURN_R };
  }
  if (y >= CY) {
    const s = x >= CX ? x - CX : LAP - (CX - x);
    return { s, offset: y - (CY + TURN_R) };
  }
  return { s: half + Math.PI * TURN_R + (CX + half - x), offset: CY - TURN_R - y };
}

/** The point `offset` from the centre line at distance s along it, with the direction of travel there. */
export function trackPoint(s: number, offset = 0): CarPose {
  const half = STRAIGHT / 2;
  const turn = Math.PI * TURN_R;
  let d = ((s % LAP) + LAP) % LAP;
  if (d < half) return { x: CX + d, y: CY + TURN_R + offset, heading: 0 };
  d -= half;
  if (d < turn) {
    const theta = Math.PI / 2 - d / TURN_R;
    const r = TURN_R + offset;
    return { x: CX + half + r * Math.cos(theta), y: CY + r * Math.sin(theta), heading: theta - Math.PI / 2 };
  }
  d -= turn;
  if (d < STRAIGHT) return { x: CX + half - d, y: CY - TURN_R - offset, heading: Math.PI };
  d -= STRAIGHT;
  if (d < turn) {
    const phi = (3 * Math.PI) / 2 - d / TURN_R;
    const r = TURN_R + offset;
    return { x: CX - half + r * Math.cos(phi), y: CY + r * Math.sin(phi), heading: phi - Math.PI / 2 };
  }
  d -= turn;
  return { x: CX - half + d, y: CY + TURN_R + offset, heading: 0 };
}

/** Unit vector pointing from the centre line towards the outside wall at (x, y). */
function outward(x: number, y: number): [number, number] {
  const half = STRAIGHT / 2;
  if (x > CX + half || x < CX - half) {
    const cx = x > CX + half ? CX + half : CX - half;
    const len = Math.hypot(x - cx, y - CY) || 1;
    return [(x - cx) / len, (y - CY) / len];
  }
  return y >= CY ? [0, 1] : [0, -1];
}

/** Grid slot `i`: rows of three behind the start line, packed closer when the field is big so nobody starts past it. */
export function gridSlot(i: number, total: number): Car {
  const rows = Math.max(1, Math.ceil(total / 3));
  const gap = Math.min(70, (LAP * 0.8) / rows);
  const row = Math.floor(i / 3);
  const lane = i % 3;
  const s = -40 - row * gap;
  const offset = (lane - 1) * 30;
  const p = trackPoint(s, offset);
  return { ...p, speed: 0, distance: s, scraping: false };
}

/** A fresh car at the start of its drive: full speed straight away (the gas is always on). */
export function launch(car: Car): Car {
  return { ...car, speed: 1 };
}

/**
 * Move one car `dtMs` along. `wheel` is −1 (full left) … 1 (full right); `fuel` is whether
 * it still has driving time (without it the car coasts to a stop). The walls keep it on
 * the track: a car that touches one loses speed, slides along it and bounces off a little.
 */
export function stepCar(car: Car, wheel: number, fuel: boolean, dtMs: number): { car: Car; hit: boolean } {
  const dt = dtMs / 1000;
  const w = Math.max(-1, Math.min(1, Number.isFinite(wheel) ? wheel : 0));
  let speed = fuel ? Math.min(1, car.speed + RECOVER_PER_S * dt) : Math.max(0, car.speed - COAST_PER_S * dt);
  if (speed <= 0 && car.speed <= 0) return { car: { ...car, speed: 0, scraping: false }, hit: false };
  // A stopped car can't turn on the spot: steering scales with speed.
  let heading = car.heading + w * MAX_TURN_RATE * dt * Math.min(1, speed * 1.5);
  const v = KART_SPEED * speed * dt;
  let x = car.x + Math.cos(heading) * v;
  let y = car.y + Math.sin(heading) * v;
  let scraping = false;
  let hit = false;
  const before = trackCoords(car.x, car.y);
  let { s, offset } = trackCoords(x, y);
  if (Math.abs(offset) > WALL_LIMIT) {
    const [nx, ny] = outward(x, y);
    const side = Math.sign(offset); // +1 = outside wall, −1 = inside wall
    const back = Math.abs(offset) - WALL_LIMIT;
    x -= nx * side * back;
    y -= ny * side * back;
    // The wall's normal, pointing out of the track.
    const wx = nx * side;
    const wy = ny * side;
    let vx = Math.cos(heading);
    let vy = Math.sin(heading);
    const into = vx * wx + vy * wy;
    if (into > 0) {
      vx -= (1 + WALL_BOUNCE) * into * wx;
      vy -= (1 + WALL_BOUNCE) * into * wy;
      heading = Math.atan2(vy, vx);
    }
    scraping = true;
    if (!car.scraping) {
      hit = true;
      speed *= WALL_SPEED_KEEP;
    }
    ({ s, offset } = trackCoords(x, y));
  }
  let ds = s - before.s;
  if (ds < -LAP / 2) ds += LAP;
  else if (ds > LAP / 2) ds -= LAP;
  return { car: { x, y, heading: normAngle(heading), speed, distance: car.distance + ds, scraping }, hit };
}

/** Full laps completed (crossing the start line forwards; reversing over it takes one back). */
export function lapsOf(distance: number): number {
  return Math.max(0, Math.floor(distance / LAP));
}

/** −π…π */
export function normAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Field units to metres for showing distances (a 50-unit Indy car is about 5 m long). */
export const METRES_PER_UNIT = 0.1;

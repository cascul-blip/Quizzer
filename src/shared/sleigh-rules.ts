/**
 * Santa's Sleigh Run: the snowy city, the houses and how the sleighs fly.
 *
 * Pure and deterministic so the server (which moves every sleigh and decides every
 * delivery) and the projector (which draws the city and smooths the sleighs between
 * ticks) always agree. Field units with y pointing down (screen coordinates); the
 * projector scales the whole field to fit.
 *
 * The city is one painted town (sleigh-town.ts) filling the field; inside CITY_MARGIN its
 * edge is a wall. Each game picks some of its houses to wait for presents. Sleighs fly over
 * the rooftops, so houses never block them: flying over a roof that still needs its
 * present delivers it (the first sleigh there claims it).
 */

import { TOWN_SPOTS, type TownSpot } from "./sleigh-town.ts";

export const FIELD_W = 1600;
export const FIELD_H = 900;
/** The city's edge, this far in from the field's edge, is a wall. */
export const CITY_MARGIN = 30;
export const CITY = { x0: CITY_MARGIN, y0: CITY_MARGIN, x1: FIELD_W - CITY_MARGIN, y1: FIELD_H - CITY_MARGIN };
/** Centre of the field: the North Pole launch pad, kept clear of houses. */
export const CX = FIELD_W / 2;
export const CY = FIELD_H / 2;
export const PAD_R = 85;

/** The sleigh with its reindeer team, nose to tail along +x (the sleigh's centre is the pose). */
export const SLEIGH_L = 120;
export const SLEIGH_W = 45;
/** How far the sleigh's centre stays from the city wall. */
const EDGE_PAD = SLEIGH_W / 2;

/** Top speed, field units per second (crossing the city takes about 4 s). */
export const SLEIGH_SPEED = 380;
/** Fastest a sleigh turns toward the stick's direction, radians per second (a turn radius of 190 at top speed). */
export const MAX_TURN_RATE = 2;
/** A push on the phone's stick shorter than this (a fraction of its reach) counts as let go. */
export const STICK_DEAD_ZONE = 0.15;
/** How fast the speed follows the stick, as a fraction of top speed per second (a stopped sleigh reaches full speed in 0.4 s). */
const SPEED_FOLLOW_PER_S = 2.5;
/** Fraction of its speed a sleigh keeps when it bumps the city wall. */
export const WALL_SPEED_KEEP = 0.5;
/** How much of the push into the wall bounces back off it. */
const WALL_BOUNCE = 0.3;

export const SLEIGH_QUIZ_MS = 15_000;
export const SLEIGH_INTRO_MS = 3000;
export const SLEIGH_COUNTDOWN_MS = 3000;
export const SLEIGH_DRIVE_CAP_MS = 60_000;
/** After the last sleigh stops, the flight holds this long before the next round. */
export const SLEIGH_DRIVE_HOLD_MS = 1500;
/** After the last present is delivered, the celebration lasts this long before the podium. */
export const SLEIGH_FINALE_MS = 3000;
export const SLEIGH_TICK_MS = 50;
/** Each correct answer buys this much flying. */
export const SLEIGH_MS_PER_POINT = 2000;
/** Houses waiting for presents: the host picks any number in this range. */
export const SLEIGH_MIN_HOUSES = 15;
export const SLEIGH_MAX_HOUSES = 30;
export const SLEIGH_HOUSE_CHOICES: readonly number[] = Array.from({ length: SLEIGH_MAX_HOUSES - SLEIGH_MIN_HOUSES + 1 }, (_, i) => SLEIGH_MIN_HOUSES + i);
export const SLEIGH_DEFAULT_HOUSES = 20;

/** Field units to metres for showing distances (a 120-unit sleigh team is about 12 m long). */
export const METRES_PER_UNIT = 0.1;

/** Distinct sleigh paint for the first players; later ones step round the colour wheel. */
const PAINT = ["#e63946", "#1d6fe0", "#f4a100", "#2a9d3f", "#8e44ad", "#00a6b4", "#ff6b9d", "#f2f2f2", "#ff7a1a", "#1f2a44", "#9acd32", "#8b5a2b"];

export function sleighColor(i: number): string {
  if (i < PAINT.length) return PAINT[i]!;
  const hue = Math.round((i * 137.508) % 360);
  return `hsl(${hue} 75% 52%)`;
}

export interface SleighPose {
  x: number;
  y: number;
  /** Direction of flight in radians; 0 = +x (right), positive turns clockwise on screen. */
  heading: number;
}

export interface Sleigh extends SleighPose {
  /** Fraction of top speed, 0…1. */
  speed: number;
  /** Total distance flown. */
  distance: number;
  /** Touching the city wall since the last tick (a new bump counts only when contact starts). */
  scraping: boolean;
}

// ---------- houses ----------

export interface HouseSpot {
  id: number;
  /** Which house of the painted town (TownSpot id in sleigh-town.ts). */
  spot: number;
  /** Bounding box of the roof: top-left corner and size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Roof outline (convex), field units. */
  poly: [number, number][];
  /** Chimney centre, relative to the bounding box's top-left corner (where the present drops). */
  chimney: { x: number; y: number };
}

/** How far inside the city wall a house's whole roof must be to wait for a present. */
const HOUSE_WALL_GAP = 10;
/** How far (beyond the roof) the sleigh's centre may be and still deliver. */
export const DELIVER_MARGIN = 6;

/** A seeded random number generator (mulberry32), so a seed always gives the same city. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from a point to the segment a–b. */
function segmentDistance(px: number, py: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a[0] + t * dx - px, a[1] + t * dy - py);
}

function insidePolygon(px: number, py: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How far a point is from a polygon's outline (0 inside). */
export function polygonDistance(px: number, py: number, poly: readonly (readonly [number, number])[]): number {
  if (insidePolygon(px, py, poly)) return 0;
  return Math.min(...poly.map((p, i) => segmentDistance(px, py, p, poly[(i + 1) % poly.length]!)));
}

/** The painted town's houses that can wait for a present: whole roof inside the wall, clear of the launch pad. */
export const HOUSE_SPOTS: readonly TownSpot[] = TOWN_SPOTS.filter(
  (s) =>
    s.poly.every(([x, y]) => x >= CITY.x0 + HOUSE_WALL_GAP && x <= CITY.x1 - HOUSE_WALL_GAP && y >= CITY.y0 + HOUSE_WALL_GAP && y <= CITY.y1 - HOUSE_WALL_GAP) &&
    polygonDistance(CX, CY, s.poly) > PAD_R + HOUSE_WALL_GAP,
);

/**
 * Pick `n` of the town's houses to wait for presents (ids 0…n−1, in reading order: top to
 * bottom, left to right). Same rng sequence → same houses.
 */
export function pickHouses(n: number, rng: () => number): HouseSpot[] {
  const pool = [...HOUSE_SPOTS];
  // Fisher–Yates, then keep the first n.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, Math.min(n, pool.length));
  const box = (s: TownSpot) => {
    const xs = s.poly.map((p) => p[0]);
    const ys = s.poly.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  return picked
    .map((s) => ({ s, b: box(s) }))
    .sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x)
    .map(({ s, b }, id) => ({
      id,
      spot: s.id,
      ...b,
      poly: s.poly.map(([x, y]) => [x, y] as [number, number]),
      chimney: { x: Math.round((s.chimney[0] - b.x) * 10) / 10, y: Math.round((s.chimney[1] - b.y) * 10) / 10 },
    }));
}

/** Whether a sleigh at this pose is over the house (its centre on the roof, or within DELIVER_MARGIN of it). */
export function hitsHouse(pose: { x: number; y: number }, house: { poly: readonly (readonly [number, number])[] }): boolean {
  return polygonDistance(pose.x, pose.y, house.poly) <= DELIVER_MARGIN;
}

/** How far the sleigh's centre is from the house's centre (to settle two sleighs arriving in the same tick). */
export function houseDistance(pose: { x: number; y: number }, house: { x: number; y: number; w: number; h: number }): number {
  return Math.hypot(pose.x - (house.x + house.w / 2), pose.y - (house.y + house.h / 2));
}

// ---------- sleighs ----------

/**
 * Launch slot `i` of `total`: sleighs spread evenly over the launch pad (a sunflower spiral,
 * packed tighter the more there are, so even 200 stay on the pad), each pointing outwards.
 */
export function launchSlot(i: number, total: number): Sleigh {
  const n = Math.max(1, total);
  const r = (PAD_R - 25) * Math.sqrt((i + 0.5) / n);
  const a = i * 2.39996323 - Math.PI / 2;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, heading: normAngle(a), speed: 0, distance: 0, scraping: false };
}

/** The phone's stick: where the thumb is from its centre, field directions (+x right, +y down), length 0…1. */
export interface Stick {
  x: number;
  y: number;
}

/** How hard the stick is pushed, 0 (inside the dead zone) … 1 (at its rim); non-finite counts as let go. */
export function stickPush(stick: Stick): number {
  const m = Number.isFinite(stick.x) && Number.isFinite(stick.y) ? Math.min(1, Math.hypot(stick.x, stick.y)) : 0;
  return m <= STICK_DEAD_ZONE ? 0 : (m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
}

/**
 * Move one sleigh `dtMs` along. The sleigh turns toward the `stick`'s direction (at most
 * MAX_TURN_RATE) and its speed follows how hard the stick is pushed, so a let-go stick brings it
 * to a stop. `fuel` is whether it still has flying time (without it the sleigh glides to a stop
 * and can't steer). The city wall keeps it in: a sleigh that touches it loses speed, slides
 * along it and bounces off a little. `turn` is how hard it turned, −1 (full left) … 1 (full right).
 */
export function stepSleigh(s: Sleigh, stick: Stick, fuel: boolean, dtMs: number): { sleigh: Sleigh; bump: boolean; turn: number } {
  const dt = dtMs / 1000;
  const push = fuel ? stickPush(stick) : 0;
  const follow = SPEED_FOLLOW_PER_S * dt;
  let speed = s.speed < push ? Math.min(push, s.speed + follow) : Math.max(push, s.speed - follow);
  if (speed <= 0 && s.speed <= 0) return { sleigh: { ...s, speed: 0, scraping: false }, bump: false, turn: 0 };
  let heading = s.heading;
  let turn = 0;
  if (push > 0 && dt > 0) {
    const most = MAX_TURN_RATE * dt;
    const step = Math.max(-most, Math.min(most, normAngle(Math.atan2(stick.y, stick.x) - heading)));
    heading += step;
    turn = step / most;
  }
  const v = SLEIGH_SPEED * speed * dt;
  let x = s.x + Math.cos(heading) * v;
  let y = s.y + Math.sin(heading) * v;
  let vx = Math.cos(heading);
  let vy = Math.sin(heading);
  let touching = false;
  const lo = { x: CITY.x0 + EDGE_PAD, y: CITY.y0 + EDGE_PAD };
  const hi = { x: CITY.x1 - EDGE_PAD, y: CITY.y1 - EDGE_PAD };
  // Each wall: clamp, then take the push into it out of the direction (plus a little bounce).
  if (x < lo.x || x > hi.x) {
    if ((x < lo.x && vx < 0) || (x > hi.x && vx > 0)) vx = -vx * WALL_BOUNCE;
    x = Math.max(lo.x, Math.min(hi.x, x));
    touching = true;
  }
  if (y < lo.y || y > hi.y) {
    if ((y < lo.y && vy < 0) || (y > hi.y && vy > 0)) vy = -vy * WALL_BOUNCE;
    y = Math.max(lo.y, Math.min(hi.y, y));
    touching = true;
  }
  let bump = false;
  if (touching) {
    heading = Math.atan2(vy, vx);
    if (!s.scraping) {
      bump = true;
      speed *= WALL_SPEED_KEEP;
    }
  }
  const moved = Math.hypot(x - s.x, y - s.y);
  return { sleigh: { x, y, heading: normAngle(heading), speed, distance: s.distance + moved, scraping: touching }, bump, turn };
}

/** −π…π */
export function normAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

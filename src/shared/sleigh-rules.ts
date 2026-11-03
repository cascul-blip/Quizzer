/**
 * Santa's Sleigh Run: the snowy city, the houses and how the sleighs fly.
 *
 * Pure and deterministic so the server (which moves every sleigh and decides every
 * delivery) and the projector (which draws the city and smooths the sleighs between
 * ticks) always agree. Field units with y pointing down (screen coordinates); the
 * projector scales the whole field to fit.
 *
 * The city fills the field inside CITY_MARGIN; its edge is a wall. Sleighs fly over
 * the rooftops, so houses never block them: flying into a house that still needs
 * its present delivers it (the first sleigh there claims it).
 */

export const FIELD_W = 1600;
export const FIELD_H = 900;
/** The city's edge, this far in from the field's edge, is a wall. */
export const CITY_MARGIN = 30;
export const CITY = { x0: CITY_MARGIN, y0: CITY_MARGIN, x1: FIELD_W - CITY_MARGIN, y1: FIELD_H - CITY_MARGIN };
/** Centre of the field: the North Pole launch pad, kept clear of houses. */
export const CX = FIELD_W / 2;
export const CY = FIELD_H / 2;
export const PAD_R = 120;

/** The sleigh with its reindeer team, nose to tail along +x (the sleigh's centre is the pose). */
export const SLEIGH_L = 80;
export const SLEIGH_W = 30;
/** How far the sleigh's centre stays from the city wall. */
const EDGE_PAD = SLEIGH_W / 2;

/** Top speed, field units per second (crossing the city takes about 4 s). */
export const SLEIGH_SPEED = 380;
/** Turning rate at full lock, radians per second (a turn radius of about 150 at top speed). */
export const MAX_TURN_RATE = 2.5;
/** The phone's wheel turns this far each way. */
export const WHEEL_MAX_DEG = 135;
/** Fraction of its speed a sleigh keeps when it bumps the city wall. */
export const WALL_SPEED_KEEP = 0.5;
/** How much of the push into the wall bounces back off it. */
const WALL_BOUNCE = 0.3;
/** Speed regained per second after a bump (as a fraction of top speed). */
const RECOVER_PER_S = 1;
/** Speed lost per second once a sleigh runs out of flying time (gliding to a stop). */
const COAST_PER_S = 2;

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
export const SLEIGH_MS_PER_POINT = 3000;
/** Houses waiting for presents: the host picks any number in this range. */
export const SLEIGH_MIN_HOUSES = 15;
export const SLEIGH_MAX_HOUSES = 30;
export const SLEIGH_HOUSE_CHOICES: readonly number[] = Array.from({ length: SLEIGH_MAX_HOUSES - SLEIGH_MIN_HOUSES + 1 }, (_, i) => SLEIGH_MIN_HOUSES + i);
export const SLEIGH_DEFAULT_HOUSES = 20;

/** Field units to metres for showing distances (an 80-unit sleigh team is about 8 m long). */
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
  /** Top-left corner and size of the footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Roof colour. */
  roof: string;
  /** Chimney centre, relative to the footprint's top-left corner (where the present drops). */
  chimney: { x: number; y: number };
}

const ROOFS = ["#8c2f39", "#3d5a80", "#5b3a29", "#6b705c", "#7b2d26", "#2f4858", "#9c6644", "#4a4e69"];
/** Gap kept between houses (the streets), and between houses and the city wall. */
const HOUSE_GAP = 40;
const HOUSE_MIN = 60;
const HOUSE_MAX = 100;
/** How close (beyond the footprint) the sleigh's centre must come to deliver. */
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

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Whether a footprint keeps clear of the launch pad circle. */
function clearOfPad(r: { x: number; y: number; w: number; h: number }): boolean {
  const nx = Math.max(r.x, Math.min(CX, r.x + r.w));
  const ny = Math.max(r.y, Math.min(CY, r.y + r.h));
  return Math.hypot(nx - CX, ny - CY) > PAD_R + HOUSE_GAP / 2;
}

/**
 * Scatter `n` houses over the city: inside the walls, never overlapping (a street's width
 * apart), clear of the launch pad. Same rng sequence → same city. Houses shrink if the
 * city is too crowded to fit them all at full size.
 */
export function placeHouses(n: number, rng: () => number): HouseSpot[] {
  const out: HouseSpot[] = [];
  let maxSize = HOUSE_MAX;
  let tries = 0;
  while (out.length < n) {
    if (++tries > 4000) {
      // Too crowded: start again with smaller houses.
      maxSize = Math.max(HOUSE_MIN, maxSize - 10);
      out.length = 0;
      tries = 0;
    }
    const w = Math.round(HOUSE_MIN + rng() * (maxSize - HOUSE_MIN));
    const h = Math.round(HOUSE_MIN + rng() * (maxSize - HOUSE_MIN));
    const x = Math.round(CITY.x0 + HOUSE_GAP + rng() * (CITY.x1 - CITY.x0 - 2 * HOUSE_GAP - w));
    const y = Math.round(CITY.y0 + HOUSE_GAP + rng() * (CITY.y1 - CITY.y0 - 2 * HOUSE_GAP - h));
    const r = { x, y, w, h };
    if (!clearOfPad(r) || out.some((o) => overlaps(o, r, HOUSE_GAP))) continue;
    const roof = ROOFS[Math.floor(rng() * ROOFS.length)]!;
    const chimney = { x: Math.round(w * (0.25 + rng() * 0.5)), y: Math.round(h * (0.25 + rng() * 0.5)) };
    out.push({ id: out.length, x, y, w, h, roof, chimney });
  }
  return out;
}

/** Whether a sleigh at this pose is over the house (its centre within the footprint plus DELIVER_MARGIN). */
export function hitsHouse(pose: { x: number; y: number }, house: { x: number; y: number; w: number; h: number }): boolean {
  return pose.x >= house.x - DELIVER_MARGIN && pose.x <= house.x + house.w + DELIVER_MARGIN && pose.y >= house.y - DELIVER_MARGIN && pose.y <= house.y + house.h + DELIVER_MARGIN;
}

/** How far the sleigh's centre is from the house's centre (to settle two sleighs arriving in the same tick). */
export function houseDistance(pose: { x: number; y: number }, house: { x: number; y: number; w: number; h: number }): number {
  return Math.hypot(pose.x - (house.x + house.w / 2), pose.y - (house.y + house.h / 2));
}

// ---------- sleighs ----------

/** Launch slot `i`: sleighs fan out round the launch pad, pointing outwards, in rings of 8. */
export function launchSlot(i: number, total: number): Sleigh {
  const ring = Math.floor(i / 8);
  const inRing = Math.min(8, total - ring * 8);
  const k = i % 8;
  const a = (k / Math.max(1, inRing)) * Math.PI * 2 + ring * 0.4 - Math.PI / 2;
  const r = 30 + ring * 30;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, heading: normAngle(a), speed: 0, distance: 0, scraping: false };
}

/** A sleigh at the start of its flight: full speed straight away (the reindeer are always running). */
export function launch(s: Sleigh): Sleigh {
  return { ...s, speed: 1 };
}

/**
 * Move one sleigh `dtMs` along. `wheel` is −1 (full left) … 1 (full right); `fuel` is whether
 * it still has flying time (without it the sleigh glides to a stop). The city wall keeps it
 * in: a sleigh that touches it loses speed, slides along it and bounces off a little.
 */
export function stepSleigh(s: Sleigh, wheel: number, fuel: boolean, dtMs: number): { sleigh: Sleigh; bump: boolean } {
  const dt = dtMs / 1000;
  const w = Math.max(-1, Math.min(1, Number.isFinite(wheel) ? wheel : 0));
  let speed = fuel ? Math.min(1, s.speed + RECOVER_PER_S * dt) : Math.max(0, s.speed - COAST_PER_S * dt);
  if (speed <= 0 && s.speed <= 0) return { sleigh: { ...s, speed: 0, scraping: false }, bump: false };
  // A stopped sleigh can't turn on the spot: steering scales with speed.
  let heading = s.heading + w * MAX_TURN_RATE * dt * Math.min(1, speed * 1.5);
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
  return { sleigh: { x, y, heading: normAngle(heading), speed, distance: s.distance + moved, scraping: touching }, bump };
}

/** −π…π */
export function normAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

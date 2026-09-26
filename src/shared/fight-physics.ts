/**
 * Tower Fight battlefield: terrain, slingshot launches and flight paths.
 *
 * Pure and deterministic so the server (which decides every hit) and the
 * screens (which animate the same arcs and preview the aim) always agree.
 * Coordinates are field units with y pointing up; ground level is GROUND.
 */

export const FIELD_W = 1000;
export const FIELD_H = 600;
/** Height of the flat ground the towers stand on. */
export const GROUND = 60;
/** Terrain is sampled at x = i * COL_W for i = 0 … COLS. */
export const COLS = 200;
export const COL_W = FIELD_W / COLS;

export const TOWER_W = 80;
export const TOWER_H = 190;
/** Tower centers: Red (team 0) on the left, Blue (team 1) on the right. */
export const TOWER_X = [90, 910] as const;
/** Where each team's catapult throws from. */
export const CATAPULT_X = [190, 810] as const;
export const LAUNCH_Y = GROUND + 34;

export const GRAVITY = 600;
export const MAX_SPEED = 860;
/** Pull-back distance (field units) for full power; shorter pulls are weaker. */
export const MAX_PULL = 180;
/** Pulls shorter than this are treated as a cancelled aim. */
export const MIN_PULL = 12;
/** Radius of the flying avatar. */
export const SHOT_R = 14;
const MAX_FLIGHT_S = 8;
const STEP_S = 1 / 240;

export const HILL_HEIGHTS = { low: 150, medium: 230, high: 310 } as const;
export type HillHeight = keyof typeof HILL_HEIGHTS;

export const CRATER_R = 30;
export const CRATER_DEPTH = 26;
/** Craters can dig the hill away completely, but not below this. */
export const MIN_GROUND = 24;

export type ShotImpact =
  | { kind: "tower"; team: number; x: number; y: number }
  | { kind: "ground"; x: number; y: number }
  | { kind: "offscreen"; x: number; y: number };

export interface Flight {
  durationMs: number;
  impact: ShotImpact;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** A flat field with a bumpy hill in the middle; the towers and catapults stay on flat ground. */
export function makeTerrain(hill: HillHeight, rng: () => number = Math.random): number[] {
  const peak = HILL_HEIGHTS[hill] * (0.9 + rng() * 0.2);
  const cx = FIELD_W / 2 + (rng() - 0.5) * 60;
  const sigma = 85 + rng() * 40;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  return Array.from({ length: COLS + 1 }, (_, i) => {
    const x = i * COL_W;
    const edge = Math.min(x, FIELD_W - x);
    const window = smoothstep((edge - 230) / 120);
    const bump = peak * Math.exp(-(((x - cx) / sigma) ** 2)) + 10 * Math.sin(x / 37 + p1) + 6 * Math.sin(x / 13 + p2);
    return round1(Math.max(MIN_GROUND, GROUND + bump * window));
  });
}

/** Ground height at x (linear between samples; flat beyond the edges). */
export function groundAt(terrain: number[], x: number): number {
  const f = Math.min(COLS, Math.max(0, x / COL_W));
  const i = Math.floor(f);
  const a = terrain[i]!;
  const b = terrain[Math.min(COLS, i + 1)]!;
  return a + (b - a) * (f - i);
}

/**
 * Slingshot: the shot flies opposite to the pull. The pull is in field units
 * (y up); its length sets the power, capped at MAX_PULL. Null if too short.
 */
export function launchVector(dx: number, dy: number): { vx: number; vy: number } | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const len = Math.hypot(dx, dy);
  if (len < MIN_PULL) return null;
  const k = ((Math.min(len, MAX_PULL) / MAX_PULL) * MAX_SPEED) / len;
  return { vx: -dx * k, vy: -dy * k };
}

/** Where a shot from `team`'s catapult is `t` seconds after launch. */
export function shotPos(team: number, vx: number, vy: number, t: number): { x: number; y: number } {
  return { x: CATAPULT_X[team]! + vx * t, y: LAUNCH_Y + vy * t - (GRAVITY * t * t) / 2 };
}

/** The tower whose (slightly padded) outline contains the point, if any. */
function towerAt(x: number, y: number): number | null {
  const pad = SHOT_R * 0.6;
  for (let team = 0; team < TOWER_X.length; team++) {
    if (Math.abs(x - TOWER_X[team]!) <= TOWER_W / 2 + pad && y <= GROUND + TOWER_H + pad) return team;
  }
  return null;
}

/** Fly a shot until it hits a tower (either one: friendly fire counts), the ground, or leaves the field. */
export function simulate(terrain: number[], team: number, vx: number, vy: number): Flight {
  for (let t = STEP_S; t <= MAX_FLIGHT_S; t += STEP_S) {
    const { x, y } = shotPos(team, vx, vy, t);
    const durationMs = Math.round(t * 1000);
    if (x < -SHOT_R || x > FIELD_W + SHOT_R) return { durationMs, impact: { kind: "offscreen", x: round1(x), y: round1(y) } };
    const tower = towerAt(x, y);
    if (tower !== null) return { durationMs, impact: { kind: "tower", team: tower, x: round1(x), y: round1(y) } };
    if (y - SHOT_R * 0.5 <= groundAt(terrain, x)) return { durationMs, impact: { kind: "ground", x: round1(x), y: round1(groundAt(terrain, x)) } };
  }
  const end = shotPos(team, vx, vy, MAX_FLIGHT_S);
  return { durationMs: MAX_FLIGHT_S * 1000, impact: { kind: "offscreen", x: round1(end.x), y: round1(end.y) } };
}

/** Knock a round crater into the ground at x (not under the towers). Returns a new terrain. */
export function carve(terrain: number[], x: number, radius = CRATER_R, depth = CRATER_DEPTH): number[] {
  return terrain.map((h, i) => {
    const cx = i * COL_W;
    const d = Math.abs(cx - x);
    if (d >= radius || TOWER_X.some((tx) => Math.abs(cx - tx) <= TOWER_W / 2 + COL_W)) return h;
    return round1(Math.max(MIN_GROUND, h - depth * Math.sqrt(1 - (d / radius) ** 2)));
  });
}

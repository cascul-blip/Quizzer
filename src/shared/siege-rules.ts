/** why: lanes are 0-based in code but shown 1-based on screen. */
export const SIEGE_LANES = 5;
/** why: square 1 is next to the castle wall; the last square is where monsters come on. */
export const SIEGE_SQUARES = 8;
export const SIEGE_BUILD_SQUARES = 7;
/** why: the wall never heals, so this is the whole game's supply. */
export const SIEGE_HEARTS = 10;
/** why: the cracked wall layer shows at this many hearts or fewer. */
export const SIEGE_CRACKED_HEARTS = 5;

/** why: purses are per player; a late joiner also starts with this. */
export const SIEGE_START_GOLD = 50;
export const SIEGE_GOLD_PER_CORRECT = 25;

export const SIEGE_TICK_MS = 100;
export const SIEGE_COUNTDOWN_MS = 3000;
export const SIEGE_OPENING_MS = 15_000;
export const SIEGE_BREAK_MS = 10_000;
export const SIEGE_WARNING_MS = 2000;
/** why: the wait gives the horn and lane flash time to warn the class. */
export const SIEGE_GIANT_WAIT_MS = 3000;
export const SIEGE_ENDING_MS = 5000;
export const SIEGE_DANGER_SQUARES = 2;
/** why: counts monsters on a lane's last two squares; one more is allowed from SIEGE_CROWD_FROM_WAVE on. */
const SIEGE_MAX_ENTERING = 2;
const SIEGE_CROWD_FROM_WAVE = 5;
export const SIEGE_GROUP_GAP_MS = 2500;
export const SIEGE_MAP_DOTS_MS = 1000;
export const SIEGE_EVENTS_SHOWN = 4;
/** why: kept only so the projector can finish its animations. */
export const SIEGE_SHOTS_SHOWN = 16;
export const SIEGE_FALLEN_SHOWN = 12;
export const SIEGE_MAP_IDLE_MS = 8000;

export type SiegeWaves = 5 | 10 | "endless";
export const SIEGE_WAVE_CHOICES: readonly SiegeWaves[] = [5, 10, "endless"];

export type SiegeDefenderType = "archer" | "knight" | "wall";
export const SIEGE_DEFENDER_TYPES: readonly SiegeDefenderType[] = ["archer", "knight", "wall"];
const SIEGE_MAX_LEVEL = 3;

interface SiegeDefenderStats {
  /** why: indexed place, Lv 2, Lv 3. */
  cost: readonly [number, number, number];
  health: readonly [number, number, number];
  /** why: for archers this is per arrow. */
  damage: readonly [number, number, number];
  arrows: readonly [number, number, number];
  /** why: 0 means it never attacks. */
  attackMs: readonly [number, number, number];
  /** why: dealt back to a monster each time it hits this defender. */
  thorns: readonly [number, number, number];
}

export const SIEGE_DEFENDERS: Record<SiegeDefenderType, SiegeDefenderStats> = {
  archer: { cost: [50, 75, 125], health: [4, 4, 4], damage: [1, 1, 1], arrows: [1, 1, 2], attackMs: [1500, 1000, 1000], thorns: [0, 0, 0] },
  knight: { cost: [75, 100, 150], health: [10, 16, 16], damage: [2, 2, 3], arrows: [1, 1, 1], attackMs: [1000, 1000, 1000], thorns: [0, 0, 0] },
  wall: { cost: [50, 50, 100], health: [15, 25, 25], damage: [0, 0, 0], arrows: [1, 1, 1], attackMs: [0, 0, 0], thorns: [0, 0, 1] },
};

/** why: the Build button lights up once a purse reaches this. */
export const SIEGE_CHEAPEST = Math.min(...SIEGE_DEFENDER_TYPES.map((t) => SIEGE_DEFENDERS[t].cost[0]));

export function siegeUpgradeCost(type: SiegeDefenderType, level: number): number | null {
  return level >= 1 && level < SIEGE_MAX_LEVEL ? SIEGE_DEFENDERS[type].cost[level]! : null;
}

export type SiegeMonsterType = "goblin" | "wolf" | "troll" | "giant";

interface SiegeMonsterStats {
  health: number;
  healthPerPlayer: number;
  squareMs: number;
  hitDamage: number;
  hitIntervalMs: number;
  wallFactor: number;
  /** why: armor; the share of an arrow's damage it takes. */
  arrowFactor: number;
  hearts: number;
  /** why: the giant comes on top of the budget, so its cost is unused. */
  cost: number;
  fromWave: number;
}

export const SIEGE_MONSTERS: Record<SiegeMonsterType, SiegeMonsterStats> = {
  goblin: { health: 3, healthPerPlayer: 0, squareMs: 2000, hitDamage: 1, hitIntervalMs: 1000, wallFactor: 1, arrowFactor: 1, hearts: 1, cost: 1, fromWave: 1 },
  wolf: { health: 3, healthPerPlayer: 0, squareMs: 1000, hitDamage: 1, hitIntervalMs: 1000, wallFactor: 1, arrowFactor: 1, hearts: 1, cost: 2, fromWave: 2 },
  troll: {
    health: 12,
    healthPerPlayer: 0,
    squareMs: 3500,
    hitDamage: 2,
    hitIntervalMs: 1000,
    wallFactor: 3,
    arrowFactor: 0.5,
    hearts: 2,
    cost: 4,
    fromWave: 3,
  },
  giant: { health: 40, healthPerPlayer: 5, squareMs: 4000, hitDamage: 6, hitIntervalMs: 3000, wallFactor: 1, arrowFactor: 1, hearts: 5, cost: 12, fromWave: 5 },
};

const SIEGE_HEALTH_PER_WAVE = 0.1;

export function siegeMonsterHealth(type: SiegeMonsterType, wave: number, players: number): number {
  const stats = SIEGE_MONSTERS[type];
  const base = stats.health + stats.healthPerPlayer * Math.max(0, players);
  return Math.max(1, Math.round(base * (1 + SIEGE_HEALTH_PER_WAVE * (Math.max(1, wave) - 1))));
}

export function siegeMaxEntering(wave: number): number {
  return wave >= SIEGE_CROWD_FROM_WAVE ? SIEGE_MAX_ENTERING + 1 : SIEGE_MAX_ENTERING;
}

/** why: the stomp hits the same square in the lanes above and below. */
export const SIEGE_STOMP_SPLASH = 2;
export const SIEGE_LEAP_MS = 700;
/** why: relative weights, not probabilities. */
export const SIEGE_MONSTER_ODDS: Record<Exclude<SiegeMonsterType, "giant">, number> = { goblin: 5, wolf: 3, troll: 2 };

export function siegeBaseBudget(wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  return w <= 10 ? 6 + 3 * (w - 1) : 6 + 3 * 9 + 4 * (w - 10);
}

export function siegeClassSizeFactor(players: number): number {
  return Math.min(1.4, Math.max(0.7, Math.round((0.6 + 0.1 * Math.max(0, players)) * 100) / 100));
}

export function siegeWaveBudget(wave: number, players: number, scalePct: number): number {
  return Math.max(1, Math.round((siegeBaseBudget(wave) * siegeClassSizeFactor(players) * scalePct) / 100));
}

/** why: an ordinary class's board is worth about this much gold per budget point. */
const SIEGE_PAR_GOLD_PER_POINT = 60;
/** why: squared because a big board is stronger than its gold says. */
const SIEGE_STRENGTH_EXPONENT = 2;
/** why: the boost climbs only after an untouched wave, but can drop any amount. */
const SIEGE_STRENGTH_STEP = 0.35;
const SIEGE_MAX_BOOST = 4;
/** why: mostly health, since lanes cap monsters entering and extra monsters just trickle in. */
const SIEGE_STRENGTH_COUNT_SHARE = 0.3;

export function siegeDefenderGold(type: SiegeDefenderType, level: number, health: number, maxHealth: number): number {
  let paid = 0;
  for (let l = 0; l < Math.min(level, SIEGE_MAX_LEVEL); l++) paid += SIEGE_DEFENDERS[type].cost[l]!;
  return maxHealth > 0 ? (paid * Math.max(0, health)) / maxHealth : 0;
}

/** why: the giant keeps its health under boost and gets faster instead. */
const SIEGE_GIANT_MAX_PACE = 2;

export function siegeGiantPace(boost: number): number {
  const share = Math.min(1, Math.max(0, (boost - 1) / (SIEGE_MAX_BOOST - 1)));
  return Math.round((1 + (SIEGE_GIANT_MAX_PACE - 1) * share) * 100) / 100;
}

/** why: when the class builds faster than the waves grow, the waves catch up; `grow` is false after a wave that cost hearts. */
export function siegeWaveStrength(budget: number, defenseGold: number, lastBoost = 1, grow = true): { boost: number; budget: number; toughness: number } {
  const r = Math.max(1, Math.max(0, defenseGold) / (SIEGE_PAR_GOLD_PER_POINT * Math.max(1, budget)));
  const ceiling = Math.min(SIEGE_MAX_BOOST, Math.max(1, lastBoost) + (grow ? SIEGE_STRENGTH_STEP : 0));
  const boost = Math.round(Math.min(r ** SIEGE_STRENGTH_EXPONENT, ceiling) * 100) / 100;
  return {
    boost,
    budget: Math.round(budget * boost ** SIEGE_STRENGTH_COUNT_SHARE),
    toughness: Math.round(boost ** (1 - SIEGE_STRENGTH_COUNT_SHARE) * 100) / 100,
  };
}

export function siegeGiants(wave: number, endless: boolean): number {
  if (wave <= 0 || wave % 5 !== 0) return 0;
  return endless && wave >= 15 ? 2 : 1;
}

/** why: the window shrinks each wave so later waves come packed. */
export function siegeSpawnWindowMs(wave: number): number {
  return Math.max(20_000, 30_000 - 1000 * (Math.max(1, wave) - 1));
}

const SIEGE_SCALE_MIN = 70;
const SIEGE_SCALE_MAX = 130;
const SIEGE_SCALE_STEP = 20;

export function siegeTargetScale(accuracy: number): number {
  const a = Math.min(0.9, Math.max(0.4, accuracy));
  return Math.round(SIEGE_SCALE_MIN + ((a - 0.4) / 0.5) * (SIEGE_SCALE_MAX - SIEGE_SCALE_MIN));
}

/** why: a wave with no answers says nothing about accuracy, so it keeps the scale. */
export function siegeNextScale(current: number, correct: number, answered: number): number {
  if (answered <= 0) return current;
  const target = siegeTargetScale(correct / answered);
  return Math.max(current - SIEGE_SCALE_STEP, Math.min(current + SIEGE_SCALE_STEP, target));
}

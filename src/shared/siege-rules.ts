// Kingdom Siege: the numbers of the lane battle as constants and pure functions.
// Used by the server engine, the phone (prices) and the tests.
// No imports on purpose: this file must stay usable from both sides.

/** Lanes on the board, top to bottom (0-based in code, 1-based on screen). */
export const SIEGE_LANES = 5;
/** Squares per lane: 1 is next to the castle wall, 8 is where monsters come on. */
export const SIEGE_SQUARES = 8;
/** Defenders go on squares 1 to this. */
export const SIEGE_BUILD_SQUARES = 7;
/** The castle wall's hearts. It never heals. */
export const SIEGE_HEARTS = 10;
/** The castle wall layer switches to the cracked one at this many hearts or fewer. */
export const SIEGE_CRACKED_HEARTS = 5;

/** Every player has their own purse: this much to start (a late joiner too), plus their own right answers. */
export const SIEGE_START_GOLD = 50;
export const SIEGE_GOLD_PER_CORRECT = 25;

/** The battle runs in fixed steps of this many ms. */
export const SIEGE_TICK_MS = 100;
export const SIEGE_COUNTDOWN_MS = 3000;
/** The opening build break, after the countdown. */
export const SIEGE_OPENING_MS = 15_000;
/** The "Wave N incoming" break between waves. */
export const SIEGE_BREAK_MS = 10_000;
/** A warning arrow shows this long before a monster comes onto its lane. */
export const SIEGE_WARNING_MS = 2000;
/** The giant waits on the entry square this long (horn, lane flash) before it walks. */
export const SIEGE_GIANT_WAIT_MS = 3000;
/** The victory or crumble cinematic, before the podium. */
export const SIEGE_ENDING_MS = 5000;
/** A lane is in danger while a monster is within this many squares of the wall. */
export const SIEGE_DANGER_SQUARES = 2;
/** At most this many monsters on a lane's last two squares (7 and 8) at once, and one more from SIEGE_CROWD_FROM_WAVE on. */
const SIEGE_MAX_ENTERING = 2;
const SIEGE_CROWD_FROM_WAVE = 5;
/** Goblins in one group come onto the lane this far apart. */
export const SIEGE_GROUP_GAP_MS = 2500;
/** How often an open phone lane map gets new monster dots. */
export const SIEGE_MAP_DOTS_MS = 1000;
/** Projector pop-ups ("Ana placed an archer") kept. */
export const SIEGE_EVENTS_SHOWN = 4;
/** Arrows and fallen monsters kept for the projector's animations. */
export const SIEGE_SHOTS_SHOWN = 16;
export const SIEGE_FALLEN_SHOWN = 12;
/** The phone's lane map closes after this long without a tap. */
export const SIEGE_MAP_IDLE_MS = 8000;

export type SiegeWaves = 5 | 10 | "endless";
export const SIEGE_WAVE_CHOICES: readonly SiegeWaves[] = [5, 10, "endless"];

// ---------- defenders ----------

export type SiegeDefenderType = "archer" | "knight" | "wall";
export const SIEGE_DEFENDER_TYPES: readonly SiegeDefenderType[] = ["archer", "knight", "wall"];
const SIEGE_MAX_LEVEL = 3;

interface SiegeDefenderStats {
  label: string;
  /** Place, Lv 2, Lv 3. */
  cost: readonly [number, number, number];
  /** Max health at Lv 1, 2, 3. */
  health: readonly [number, number, number];
  /** Damage per hit (archer: per arrow) at each level. */
  damage: readonly [number, number, number];
  /** Arrows per shot at each level (archer only). */
  arrows: readonly [number, number, number];
  /** Ms between hits at each level; 0 = doesn't attack. */
  attackMs: readonly [number, number, number];
  /** Damage dealt back to a monster each time it hits this defender, at each level. */
  thorns: readonly [number, number, number];
}

export const SIEGE_DEFENDERS: Record<SiegeDefenderType, SiegeDefenderStats> = {
  archer: { label: "Archer", cost: [50, 75, 125], health: [4, 4, 4], damage: [1, 1, 1], arrows: [1, 1, 2], attackMs: [1500, 1000, 1000], thorns: [0, 0, 0] },
  knight: { label: "Knight", cost: [75, 100, 150], health: [10, 16, 16], damage: [2, 2, 3], arrows: [1, 1, 1], attackMs: [1000, 1000, 1000], thorns: [0, 0, 0] },
  wall: { label: "Stone wall", cost: [50, 50, 100], health: [15, 25, 25], damage: [0, 0, 0], arrows: [1, 1, 1], attackMs: [0, 0, 0], thorns: [0, 0, 1] },
};

/** The cheapest defender: the Build button lights up once the player's purse has this much. */
export const SIEGE_CHEAPEST = Math.min(...SIEGE_DEFENDER_TYPES.map((t) => SIEGE_DEFENDERS[t].cost[0]));

/** The cost to go from `level` to the next level, or null at max level. */
export function siegeUpgradeCost(type: SiegeDefenderType, level: number): number | null {
  return level >= 1 && level < SIEGE_MAX_LEVEL ? SIEGE_DEFENDERS[type].cost[level]! : null;
}

// ---------- monsters ----------

export type SiegeMonsterType = "goblin" | "wolf" | "troll" | "giant";

interface SiegeMonsterStats {
  label: string;
  health: number;
  /** Extra health per connected player (the giant). */
  healthPerPlayer: number;
  /** Ms to walk one square. */
  squareMs: number;
  /** Damage per hit and ms between hits. */
  damage: number;
  attackMs: number;
  /** Damage multiplier against stone walls. */
  wallFactor: number;
  /** Share of an arrow's damage it takes (armor). */
  arrowFactor: number;
  /** Hearts taken when it reaches the castle wall. */
  hearts: number;
  /** What it costs from a wave's monster budget (the giant comes on top of the budget). */
  cost: number;
  /** First wave it can appear in (budget monsters). */
  fromWave: number;
}

export const SIEGE_MONSTERS: Record<SiegeMonsterType, SiegeMonsterStats> = {
  goblin: { label: "Goblin", health: 3, healthPerPlayer: 0, squareMs: 2000, damage: 1, attackMs: 1000, wallFactor: 1, arrowFactor: 1, hearts: 1, cost: 1, fromWave: 1 },
  wolf: { label: "Wolf", health: 3, healthPerPlayer: 0, squareMs: 1000, damage: 1, attackMs: 1000, wallFactor: 1, arrowFactor: 1, hearts: 1, cost: 2, fromWave: 2 },
  troll: { label: "Troll", health: 12, healthPerPlayer: 0, squareMs: 3500, damage: 2, attackMs: 1000, wallFactor: 3, arrowFactor: 0.5, hearts: 2, cost: 4, fromWave: 3 },
  giant: { label: "Giant", health: 40, healthPerPlayer: 5, squareMs: 4000, damage: 6, attackMs: 3000, wallFactor: 1, arrowFactor: 1, hearts: 5, cost: 12, fromWave: 5 },
};

/** Monsters get this much tougher every wave after the first (+10% health per wave). */
const SIEGE_HEALTH_PER_WAVE = 0.1;

/** A monster's health in a wave: its base (plus the giant's per-player share), +10% per wave after the first, rounded. */
export function siegeMonsterHealth(type: SiegeMonsterType, wave: number, players: number): number {
  const stats = SIEGE_MONSTERS[type];
  const base = stats.health + stats.healthPerPlayer * Math.max(0, players);
  return Math.max(1, Math.round(base * (1 + SIEGE_HEALTH_PER_WAVE * (Math.max(1, wave) - 1))));
}

/** How many monsters may be on a lane's last two squares at once in a wave. */
export function siegeMaxEntering(wave: number): number {
  return wave >= SIEGE_CROWD_FROM_WAVE ? SIEGE_MAX_ENTERING + 1 : SIEGE_MAX_ENTERING;
}

/** The giant's stomp also hits the defenders on the same square in the lanes above and below for this much. */
export const SIEGE_STOMP_SPLASH = 2;
/** How long a wolf's leap over a stone wall takes. */
export const SIEGE_LEAP_MS = 700;
/** Budget monsters' relative odds when a wave buys its monsters. */
export const SIEGE_MONSTER_ODDS: Record<Exclude<SiegeMonsterType, "giant">, number> = { goblin: 5, wolf: 3, troll: 2 };

// ---------- waves ----------

/** The fixed part of a wave's monster budget: 6 + 3 per wave, and +4 per wave after wave 10. */
export function siegeBaseBudget(wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  return w <= 10 ? 6 + 3 * (w - 1) : 6 + 3 * 9 + 4 * (w - 10);
}

/** 0.6 + 0.1 per connected player, between 0.7 and 1.4. */
export function siegeClassSizeFactor(players: number): number {
  return Math.min(1.4, Math.max(0.7, Math.round((0.6 + 0.1 * Math.max(0, players)) * 100) / 100));
}

/** Budget = base × class size factor × difficulty scale (in %), rounded, and at least 1. */
export function siegeWaveBudget(wave: number, players: number, scalePct: number): number {
  return Math.max(1, Math.round((siegeBaseBudget(wave) * siegeClassSizeFactor(players) * scalePct) / 100));
}

// A board stronger than the waves: when the class builds faster than the waves grow, the waves catch up.
/** Par: an ordinary class's board is worth about this much gold per point of the wave's usual budget. */
const SIEGE_PAR_GOLD_PER_POINT = 60;
/** A board r times par calls for waves r^this times stronger: a big board is stronger than its gold says. */
const SIEGE_STRENGTH_EXPONENT = 2;
/** The boost climbs at most this much per wave, and only after a wave the wall came through untouched; it can drop any amount. */
const SIEGE_STRENGTH_STEP = 0.35;
const SIEGE_MAX_BOOST = 4;
/**
 * The share of the boost that comes as more monsters; the rest is extra health. Mostly health, because a lane
 * only lets so many monsters on at once, so extra monsters just trickle in.
 */
const SIEGE_STRENGTH_COUNT_SHARE = 0.3;

/** The gold a defender is worth: what it cost to place and upgrade, times the share of its health left. */
export function siegeDefenderGold(type: SiegeDefenderType, level: number, health: number, maxHealth: number): number {
  let paid = 0;
  for (let l = 0; l < Math.min(level, SIEGE_MAX_LEVEL); l++) paid += SIEGE_DEFENDERS[type].cost[l]!;
  return maxHealth > 0 ? (paid * Math.max(0, health)) / maxHealth : 0;
}

/** At the top boost the giant walks and swings this many times faster; with no boost it keeps its normal pace. */
const SIEGE_GIANT_MAX_PACE = 2;

/** The giant's pace for a wave's boost: 1× at no boost up to SIEGE_GIANT_MAX_PACE at SIEGE_MAX_BOOST, in proportion between. */
export function siegeGiantPace(boost: number): number {
  const share = Math.min(1, Math.max(0, (boost - 1) / (SIEGE_MAX_BOOST - 1)));
  return Math.round((1 + (SIEGE_GIANT_MAX_PACE - 1) * share) * 100) / 100;
}

/**
 * A wave sized to the board. A board worth r times par for the wave's usual budget calls for a boost of r^SIEGE_STRENGTH_EXPONENT,
 * reached at most SIEGE_STRENGTH_STEP per wave (none after a wave that cost hearts) and capped at SIEGE_MAX_BOOST.
 * The boost multiplies the budget by boost^SIEGE_STRENGTH_COUNT_SHARE and monster health by the rest; the giant
 * keeps its health and gets faster instead (siegeGiantPace).
 * A board at or below par gets no boost.
 */
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

/** Giants at the end of a wave: one every 5th wave, two from wave 15 on in Endless. */
export function siegeGiants(wave: number, endless: boolean): number {
  if (wave <= 0 || wave % 5 !== 0) return 0;
  return endless && wave >= 15 ? 2 : 1;
}

/** How long a wave's monsters take to come in: 30 s, 1 s shorter every wave after the first, at least 20 s, so later waves come packed. */
export function siegeSpawnWindowMs(wave: number): number {
  return Math.max(20_000, 30_000 - 1000 * (Math.max(1, wave) - 1));
}

const SIEGE_SCALE_MIN = 70;
const SIEGE_SCALE_MAX = 130;
/** The difficulty scale moves at most this many points per wave. */
const SIEGE_SCALE_STEP = 20;

/** The scale a wave's accuracy asks for: 70% at 40% accuracy or below, 130% at 90% or above, a straight line in between. */
export function siegeTargetScale(accuracy: number): number {
  const a = Math.min(0.9, Math.max(0.4, accuracy));
  return Math.round(SIEGE_SCALE_MIN + ((a - 0.4) / 0.5) * (SIEGE_SCALE_MAX - SIEGE_SCALE_MIN));
}

/** The next wave's scale (in %): toward the target by at most SIEGE_SCALE_STEP. A wave with no answers keeps the scale. */
export function siegeNextScale(current: number, correct: number, answered: number): number {
  if (answered <= 0) return current;
  const target = siegeTargetScale(correct / answered);
  return Math.max(current - SIEGE_SCALE_STEP, Math.min(current + SIEGE_SCALE_STEP, target));
}

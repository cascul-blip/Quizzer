import type { HostSiegeState, SiegeFallen, SiegeMapView, SiegeShot } from "../../shared/modes/siege.ts";
import type { SiegeDefenderType, SiegeMonsterType } from "../../shared/siege-rules.ts";
import {
  SIEGE_BUILD_SQUARES,
  SIEGE_DANGER_SQUARES,
  SIEGE_DEFENDER_TYPES,
  SIEGE_DEFENDERS,
  SIEGE_FALLEN_SHOWN,
  SIEGE_GIANT_WAIT_MS,
  SIEGE_GROUP_GAP_MS,
  SIEGE_HEARTS,
  SIEGE_LANES,
  SIEGE_LEAP_MS,
  SIEGE_MAP_DOTS_MS,
  SIEGE_MONSTER_ODDS,
  SIEGE_MONSTERS,
  SIEGE_SHOTS_SHOWN,
  SIEGE_SQUARES,
  SIEGE_STOMP_SPLASH,
  SIEGE_TICK_MS,
  SIEGE_WARNING_MS,
  siegeDefenderGold,
  siegeGiants,
  siegeMaxEntering,
  siegeMonsterHealth,
  siegeSpawnWindowMs,
  siegeUpgradeCost,
} from "../../shared/siege-rules.ts";
import type { Clock } from "./common.ts";

/** Where a monster that reaches this position has hit the castle wall (the wall face, in squares). */
const WALL_X = 0.5;
/** A monster is coming onto its lane while it is on squares 7–8. */
const ENTERING_X = SIEGE_SQUARES - 1.5;
const EPS = 1e-6;

export interface SiegeDefender<O> {
  id: number;
  type: SiegeDefenderType;
  lane: number;
  square: number;
  level: number;
  health: number;
  maxHealth: number;
  /** The player who placed it (kept after a kick, for the results). */
  owner: O;
  /** Ms until it can attack again. */
  cooldown: number;
  hitSeq: number;
  attackSeq: number;
}

export interface SiegeMonster {
  id: number;
  type: SiegeMonsterType;
  lane: number;
  /** Square k's centre is k; the wall face is 0.5. */
  x: number;
  state: "wait" | "walk" | "attack" | "leap";
  health: number;
  maxHealth: number;
  /** Ms until its next hit, while attacking. */
  cooldown: number;
  /** The giant waits on the entry square until then. */
  waitUntil: number;
  /** Walk and attack speed multiplier (the giant's goes up with the wave's boost). */
  pace: number;
  /** Wolves leap only the first stone wall in their way. */
  leapt: boolean;
  leapFrom: number;
  leapTo: number;
  leapEndsAt: number;
  hitSeq: number;
  attackSeq: number;
}

/** A monster still to come in the current wave. */
export interface SiegeSpawn {
  at: number;
  type: SiegeMonsterType;
  /** Goblins that come in together share a group (and a lane). */
  group: number;
  /** Chosen when its warning arrow shows; -1 until then. */
  lane: number;
}

/** What one battle tick changed, for deciding who needs a new view. */
export interface SiegeTickResult {
  changed: boolean;
  /** Something phones show changed: hearts, danger lanes or an alert. */
  phones: boolean;
  /** Something the phone's lane map shows changed: the monster dots or the defenders. */
  map: boolean;
}

/** How hard the wave being fought hits. */
export interface SiegeWaveConditions {
  wave: number;
  /** The usual budget, raised by any boost. */
  budget: number;
  /** Monster health multiplier for a strong board (not for giants). */
  toughness: number;
  /** The giant's walk and attack speed multiplier. */
  giantPace: number;
}

interface BattlefieldOptions<O> {
  clock: Clock;
  rng: () => number;
  endless: boolean;
  /** The game's wave: the one being fought, or the next one during a build break. Monster health and lane room follow it. */
  wave: () => number;
  /** Players connected now: monster health scales with the class. */
  classSize: () => number;
  /** A defender the owner placed defeated a monster. */
  onDefeat: (owner: O, by: SiegeDefenderType) => void;
}

/**
 * The Kingdom Siege battlefield: 5 lanes of squares, the defenders on them, the monsters marching
 * down them, and the castle's hearts. It owns combat (who hits whom, when), occupancy (what may stand
 * where), and the board as the projector and the phone map show it. It knows nothing of purses,
 * questions or phases: the game decides when the battle ticks and who pays.
 */
export class SiegeBattlefield<O> {
  hearts = SIEGE_HEARTS;
  toughness = 1;
  giantPace = 1;
  defenders: SiegeDefender<O>[] = [];
  monsters: SiegeMonster[] = [];
  /** The current wave's monsters still to come, soonest first. */
  pending: SiegeSpawn[] = [];
  shots: SiegeShot[] = [];
  fallen: SiegeFallen[] = [];
  danger: number[] = [];
  giantSeq = 0;
  wallHitSeq = 0;
  alert: { seq: number; kind: "giant" | "wall" } | null = null;
  /** Monsters sent and hearts lost since the wave began. */
  sent = 0;
  heartsLost = 0;

  private inWave = false;
  /** The lane each goblin group came in on. */
  private readonly groupLanes = new Map<number, number>();
  private mapDots: SiegeMapView["monsters"] = [];
  private mapDotsAt = -Infinity;
  private ids = 0;
  private seq = 0;
  private alertSeq = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly endless: boolean;
  private readonly wave: () => number;
  private readonly classSize: () => number;
  private readonly onDefeat: (owner: O, by: SiegeDefenderType) => void;

  constructor(opts: BattlefieldOptions<O>) {
    this.clock = opts.clock;
    this.rng = opts.rng;
    this.endless = opts.endless;
    this.wave = opts.wave;
    this.classSize = opts.classSize;
    this.onDefeat = opts.onDefeat;
  }

  /** Start a wave: plan its monsters and set how hard they hit. */
  beginWave(c: SiegeWaveConditions): void {
    this.toughness = c.toughness;
    this.giantPace = c.giantPace;
    this.sent = 0;
    this.heartsLost = 0;
    this.inWave = true;
    this.pending = this.planWave(c.wave, c.budget);
  }

  /** The wave has no monsters left to come or on the board. */
  get waveCleared(): boolean {
    return this.inWave && this.pending.length === 0 && this.monsters.length === 0;
  }

  endWave(): void {
    this.inWave = false;
  }

  stop(): void {
    this.inWave = false;
    this.pending = [];
  }

  /** What the defenders are worth in gold, by health left. */
  boardGold(): number {
    return this.defenders.reduce((sum, d) => sum + siegeDefenderGold(d.type, d.level, d.health, d.maxHealth), 0);
  }

  /**
   * Buy the wave's monsters from its budget (goblins in groups of 2–3), spread them over the
   * spawn window, and put the giant(s) at the end, on top of the budget.
   */
  planWave(wave: number, budget: number): SiegeSpawn[] {
    const allowed = (["goblin", "wolf", "troll"] as const).filter((t) => SIEGE_MONSTERS[t].fromWave <= wave);
    const groups: SiegeMonsterType[][] = [];
    let left = budget;
    while (left >= 1) {
      const options = allowed.filter((t) => SIEGE_MONSTERS[t].cost <= left);
      const total = options.reduce((n, t) => n + SIEGE_MONSTER_ODDS[t], 0);
      let r = this.rng() * total;
      let type = options[options.length - 1]!;
      for (const t of options) {
        r -= SIEGE_MONSTER_ODDS[t];
        if (r < 0) {
          type = t;
          break;
        }
      }
      if (type === "goblin") {
        const size = Math.min(left, 2 + Math.floor(this.rng() * 2));
        groups.push(Array(size).fill("goblin"));
        left -= size;
      } else {
        groups.push([type]);
        left -= SIEGE_MONSTERS[type].cost;
      }
    }
    const now = this.clock.now();
    const window = siegeSpawnWindowMs(wave);
    const spread = window - SIEGE_WARNING_MS;
    const out: SiegeSpawn[] = [];
    groups.forEach((members, i) => {
      const at = now + SIEGE_WARNING_MS + Math.round((spread * (i + this.rng() * 0.6)) / Math.max(1, groups.length));
      const group = ++this.ids;
      members.forEach((type, k) => out.push({ at: at + k * SIEGE_GROUP_GAP_MS, type, group, lane: -1 }));
    });
    for (let g = 0; g < siegeGiants(wave, this.endless); g++) out.push({ at: now + window + g * 100, type: "giant", group: ++this.ids, lane: -1 });
    return out.sort((a, b) => a.at - b.at);
  }

  /** One fixed battle step: spawns, monsters, then defenders. */
  tick(now: number): SiegeTickResult {
    const before = { hearts: this.hearts, alert: this.alert?.seq, defenders: this.defenders.length };
    let changed = this.spawnStep(now);
    changed = this.monsterStep(now) || changed;
    changed = this.defenderStep() || changed;
    let phones = this.hearts !== before.hearts || this.alert?.seq !== before.alert;
    const danger = this.dangerLanes();
    if (danger.join() !== this.danger.join()) {
      this.danger = danger;
      phones = true;
    }
    let map = this.defenders.length !== before.defenders;
    if (now - this.mapDotsAt >= SIEGE_MAP_DOTS_MS) {
      this.mapDotsAt = now;
      const dots = this.monsters.map((m) => ({ lane: m.lane, square: Math.max(1, Math.min(SIEGE_SQUARES, Math.round(m.x))) }));
      if (JSON.stringify(dots) !== JSON.stringify(this.mapDots)) {
        this.mapDots = dots;
        map = true;
      }
    }
    return { changed, phones, map };
  }

  /** Show warning arrows (choosing the lane) and bring on the monsters whose time has come. */
  private spawnStep(now: number): boolean {
    let changed = false;
    for (const s of this.pending) {
      if (s.lane >= 0 || s.at - SIEGE_WARNING_MS > now) continue;
      const lane = this.pickLane(s);
      if (lane < 0) {
        s.at += 1000;
        continue;
      }
      s.lane = lane;
      this.groupLanes.set(s.group, lane);
      changed = true;
    }
    const due = this.pending.filter((s) => s.lane >= 0 && s.at <= now);
    if (due.length) {
      this.pending = this.pending.filter((s) => !due.includes(s));
      for (const s of due) this.spawn(s.type, s.lane);
      changed = true;
    }
    this.pending.sort((a, b) => a.at - b.at);
    return changed;
  }

  /** A lane with room on its last two squares; a goblin group keeps its lane, giants take different lanes. */
  private pickLane(s: SiegeSpawn): number {
    const busy = (lane: number) =>
      this.monsters.filter((m) => m.lane === lane && m.x > ENTERING_X).length + this.pending.filter((p) => p !== s && p.lane === lane).length;
    const mate = this.groupLanes.get(s.group);
    const cap = siegeMaxEntering(this.wave());
    if (mate !== undefined) return busy(mate) < cap ? mate : -1;
    const giantLanes =
      s.type === "giant" ? new Set([...this.monsters, ...this.pending].filter((m) => m.type === "giant" && m.lane >= 0).map((m) => m.lane)) : new Set<number>();
    const open = Array.from({ length: SIEGE_LANES }, (_, i) => i).filter((l) => busy(l) < cap && !giantLanes.has(l));
    if (open.length === 0) return -1;
    const least = Math.min(...open.map(busy));
    const best = open.filter((l) => busy(l) === least);
    return best[Math.min(best.length - 1, Math.floor(this.rng() * best.length))]!;
  }

  /** Put a monster on the entry square of a lane (also used by tests). */
  spawn(type: SiegeMonsterType, lane: number, x: number = SIEGE_SQUARES): SiegeMonster {
    const stats = SIEGE_MONSTERS[type];
    const health = Math.max(1, Math.round(siegeMonsterHealth(type, this.wave(), this.classSize()) * (type === "giant" ? 1 : this.toughness)));
    const pace = type === "giant" ? this.giantPace : 1;
    const now = this.clock.now();
    const m: SiegeMonster = {
      id: ++this.ids,
      type,
      lane,
      x,
      state: type === "giant" ? "wait" : "walk",
      health,
      maxHealth: health,
      cooldown: stats.attackMs / pace,
      waitUntil: type === "giant" ? now + SIEGE_GIANT_WAIT_MS : 0,
      pace,
      leapt: false,
      leapFrom: x,
      leapTo: x,
      leapEndsAt: 0,
      hitSeq: 0,
      attackSeq: 0,
    };
    this.monsters.push(m);
    if (this.inWave) this.sent++;
    if (type === "giant") {
      this.giantSeq++;
      this.setAlert("giant");
    }
    return m;
  }

  private setAlert(kind: "giant" | "wall"): void {
    this.alert = { seq: ++this.alertSeq, kind };
  }

  /** The defender on a square, if any. */
  defenderAt(lane: number, square: number): SiegeDefender<O> | undefined {
    return this.defenders.find((d) => d.lane === lane && d.square === square);
  }

  /** The nearest defender to the left of the monster's square, the one it walks into next. */
  private blocker(m: SiegeMonster): SiegeDefender<O> | undefined {
    let best: SiegeDefender<O> | undefined;
    for (const d of this.defenders) if (d.lane === m.lane && d.square < m.x - 0.5 + EPS && (!best || d.square > best.square)) best = d;
    return best;
  }

  private monsterStep(now: number): boolean {
    let changed = false;
    for (const m of [...this.monsters]) {
      if (!this.monsters.includes(m)) continue;
      const stats = SIEGE_MONSTERS[m.type];
      if (m.state === "wait") {
        if (now < m.waitUntil) continue;
        m.state = "walk";
        changed = true;
      }
      if (m.state === "leap") {
        if (now < m.leapEndsAt) continue;
        m.x = m.leapTo;
        m.state = "walk";
        changed = true;
        if (m.x <= WALL_X + EPS) {
          this.reachWall(m);
          continue;
        }
      }
      const target = this.blocker(m);
      if (m.state === "attack") {
        if (!target || target.square + 1 < m.x - 0.5 - EPS) {
          m.state = "walk";
          changed = true;
        } else {
          m.cooldown -= SIEGE_TICK_MS;
          if (m.cooldown <= EPS) {
            m.cooldown += stats.attackMs / m.pace;
            this.strike(m, target);
            changed = true;
          }
          continue;
        }
      }
      // Walking.
      const stopAt = target ? Math.min(m.x, target.square + 1) : WALL_X;
      const next = m.x - (SIEGE_TICK_MS * m.pace) / stats.squareMs;
      if (next > stopAt + EPS) {
        m.x = next;
        continue;
      }
      m.x = stopAt;
      changed = true;
      if (!target) {
        this.reachWall(m);
      } else if (m.type === "wolf" && !m.leapt && target.type === "wall") {
        m.leapt = true;
        const landing = target.square - 1;
        if (landing >= 1 && this.defenderAt(m.lane, landing)) {
          // Nowhere to land: it attacks the wall instead.
          this.startAttack(m);
        } else {
          m.state = "leap";
          m.leapFrom = m.x;
          m.leapTo = Math.max(WALL_X, landing);
          m.leapEndsAt = now + SIEGE_LEAP_MS;
        }
      } else {
        this.startAttack(m);
      }
    }
    return changed;
  }

  private startAttack(m: SiegeMonster): void {
    m.state = "attack";
    m.cooldown = SIEGE_MONSTERS[m.type].attackMs / m.pace;
  }

  /** One hit from a monster: the giant's stomp also hits the squares just above and below. */
  private strike(m: SiegeMonster, target: SiegeDefender<O>): void {
    const stats = SIEGE_MONSTERS[m.type];
    m.attackSeq++;
    this.damageDefender(target, stats.damage * (target.type === "wall" ? stats.wallFactor : 1), m);
    if (m.type === "giant") {
      for (const lane of [target.lane - 1, target.lane + 1]) {
        const d = this.defenderAt(lane, target.square);
        if (d) this.damageDefender(d, SIEGE_STOMP_SPLASH, m);
      }
    }
  }

  private damageDefender(d: SiegeDefender<O>, amount: number, by: SiegeMonster): void {
    if (!this.defenders.includes(d)) return;
    d.health -= amount;
    d.hitSeq++;
    // Spikes hurt whatever hits the wall.
    const thorns = SIEGE_DEFENDERS[d.type].thorns[d.level - 1]!;
    if (thorns > 0 && this.monsters.includes(by)) this.damageMonster(by, thorns, d);
    if (d.health <= 0) this.defenders = this.defenders.filter((x) => x !== d);
  }

  private damageMonster(m: SiegeMonster, amount: number, by: SiegeDefender<O>): void {
    m.health -= amount;
    m.hitSeq++;
    if (m.health > 0) return;
    this.removeMonster(m, false);
    this.onDefeat(by.owner, by.type);
  }

  private removeMonster(m: SiegeMonster, reachedWall: boolean): void {
    this.monsters = this.monsters.filter((x) => x !== m);
    this.fallen.push({ seq: ++this.seq, id: m.id, type: m.type, lane: m.lane, x: m.x, reachedWall });
    if (this.fallen.length > SIEGE_FALLEN_SHOWN) this.fallen.splice(0, this.fallen.length - SIEGE_FALLEN_SHOWN);
  }

  private reachWall(m: SiegeMonster): void {
    const lost = Math.min(this.hearts, SIEGE_MONSTERS[m.type].hearts);
    this.hearts -= lost;
    this.heartsLost += lost;
    this.wallHitSeq++;
    this.setAlert("wall");
    this.removeMonster(m, true);
  }

  private defenderStep(): boolean {
    let changed = false;
    for (const d of [...this.defenders]) {
      if (!this.defenders.includes(d)) continue;
      const stats = SIEGE_DEFENDERS[d.type];
      const attackMs = stats.attackMs[d.level - 1]!;
      if (attackMs <= 0) continue;
      d.cooldown = Math.max(0, d.cooldown - SIEGE_TICK_MS);
      if (d.cooldown > EPS) continue;
      if (d.type === "archer") {
        if (!this.archerTarget(d)) continue;
        for (let i = 0; i < stats.arrows[d.level - 1]!; i++) {
          const t = this.archerTarget(d);
          if (!t) break;
          this.shots.push({ seq: ++this.seq, lane: d.lane, square: d.square, toX: t.x });
          // Armored monsters (trolls) take only part of each arrow.
          this.damageMonster(t, stats.damage[d.level - 1]! * SIEGE_MONSTERS[t.type].arrowFactor, d);
        }
        if (this.shots.length > SIEGE_SHOTS_SHOWN) this.shots.splice(0, this.shots.length - SIEGE_SHOTS_SHOWN);
      } else {
        // The knight strikes the monster on the square in front of it.
        const t = this.monsters
          .filter((m) => m.lane === d.lane && m.state !== "leap" && m.x > d.square + EPS && m.x < d.square + 1.5 + EPS)
          .sort((a, b) => a.x - b.x)[0];
        if (!t) continue;
        this.damageMonster(t, stats.damage[d.level - 1]!, d);
      }
      d.attackSeq++;
      d.cooldown = attackMs;
      changed = true;
    }
    return changed;
  }

  /** The nearest monster ahead of an archer in its lane, the entry square included. */
  private archerTarget(d: SiegeDefender<O>): SiegeMonster | undefined {
    let best: SiegeMonster | undefined;
    for (const m of this.monsters) if (m.lane === d.lane && this.monsterX(m) > d.square + EPS && (!best || this.monsterX(m) < this.monsterX(best))) best = m;
    return best;
  }

  /** A monster's position now (a leaping wolf is partway through the air). */
  private monsterX(m: SiegeMonster): number {
    if (m.state !== "leap") return m.x;
    const left = Math.max(0, m.leapEndsAt - this.clock.now());
    return m.leapTo + (m.leapFrom - m.leapTo) * (left / SIEGE_LEAP_MS);
  }

  private dangerLanes(): number[] {
    const lanes = new Set(this.monsters.filter((m) => this.monsterX(m) <= SIEGE_DANGER_SQUARES + 0.5 + EPS).map((m) => m.lane));
    return [...lanes].sort((a, b) => a - b);
  }

  // ---------- occupancy ----------

  /** Why a defender can't go on a square, or null when it can. */
  placementError(type: unknown, lane: unknown, square: unknown): string | null {
    if (typeof type !== "string" || !(SIEGE_DEFENDER_TYPES as readonly string[]).includes(type)) return "Unknown defender.";
    const l = Number(lane);
    const s = Number(square);
    if (!Number.isInteger(l) || l < 0 || l >= SIEGE_LANES || !Number.isInteger(s) || s < 1 || s > SIEGE_BUILD_SQUARES) return "You can't build on that square.";
    if (this.defenderAt(l, s)) return "That square is taken.";
    if (this.monsters.some((m) => m.lane === l && Math.round(this.monsterX(m)) === s)) return "A monster is standing there.";
    return null;
  }

  /** Put a level 1 defender on a square that placementError allowed. */
  place(type: SiegeDefenderType, lane: number, square: number, owner: O): SiegeDefender<O> {
    const health = SIEGE_DEFENDERS[type].health[0];
    const d: SiegeDefender<O> = { id: ++this.ids, type, lane, square, level: 1, health, maxHealth: health, owner, cooldown: 0, hitSeq: 0, attackSeq: 0 };
    this.defenders.push(d);
    return d;
  }

  /** Raise a defender one level; the extra health is added to what it has left. */
  upgrade(d: SiegeDefender<O>): void {
    if (siegeUpgradeCost(d.type, d.level) === null) return;
    const stats = SIEGE_DEFENDERS[d.type];
    d.level++;
    const maxHealth = stats.health[d.level - 1]!;
    d.health += maxHealth - d.maxHealth;
    d.maxHealth = maxHealth;
  }

  // ---------- observations ----------

  /** The board as the projector shows it. Monsters only glide toward their target while the battle runs. */
  hostBoard(
    playing: boolean,
    ending: boolean,
  ): Pick<HostSiegeState, "defenders" | "monsters" | "shots" | "fallen" | "warnings" | "danger" | "giant" | "giantSeq" | "wallHitSeq" | "monsterCount"> {
    const now = this.clock.now();
    const giant = this.monsters.find((m) => m.type === "giant" && m.state === "wait");
    return {
      defenders: this.defenders.map((d) => ({
        id: d.id,
        type: d.type,
        lane: d.lane,
        square: d.square,
        level: d.level,
        health: d.health,
        maxHealth: d.maxHealth,
        hitSeq: d.hitSeq,
        attackSeq: d.attackSeq,
      })),
      monsters: this.monsters.map((m) => {
        const x = this.monsterX(m);
        let toX = x;
        let moveRemainingMs = 0;
        if (playing && m.state === "walk") {
          const target = this.blocker(m);
          toX = target ? Math.min(x, target.square + 1) : WALL_X;
          moveRemainingMs = Math.round(((x - toX) * SIEGE_MONSTERS[m.type].squareMs) / m.pace);
        } else if (playing && m.state === "leap") {
          toX = m.leapTo;
          moveRemainingMs = Math.max(0, m.leapEndsAt - now);
        }
        return {
          id: m.id,
          type: m.type,
          lane: m.lane,
          x,
          toX,
          moveRemainingMs,
          state: m.state,
          health: m.health,
          maxHealth: m.maxHealth,
          hitSeq: m.hitSeq,
          attackSeq: m.attackSeq,
        };
      }),
      shots: this.shots,
      fallen: this.fallen,
      warnings: ending ? [] : this.pending.filter((s) => s.lane >= 0).map((s) => ({ lane: s.lane, ms: Math.max(0, s.at - now) })),
      danger: ending ? [] : this.danger,
      giant: giant && playing ? { lane: giant.lane, ms: Math.max(0, giant.waitUntil - now) } : null,
      giantSeq: this.giantSeq,
      wallHitSeq: this.wallHitSeq,
      monsterCount: this.monsters.length,
    };
  }

  /** The board as a phone's lane map shows it. */
  mapView(): SiegeMapView {
    return {
      defenders: this.defenders.map((d) => ({ lane: d.lane, square: d.square, type: d.type, level: d.level })),
      monsters: this.mapDots,
    };
  }
}

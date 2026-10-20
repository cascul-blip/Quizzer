import type { AnswerValue } from "../../shared/answer-match.ts";
import {
  type HostSiegeState,
  type PlayerSiegeView,
  type SiegeAwards,
  type SiegeEvent,
  type SiegeFallen,
  type SiegeMapView,
  type SiegePhase,
  type SiegeRecord,
  type SiegeResult,
  type SiegeSettings,
  type SiegeShot,
} from "../../shared/protocol.ts";
import {
  SIEGE_BREAK_MS,
  SIEGE_BUILD_SQUARES,
  SIEGE_COUNTDOWN_MS,
  SIEGE_DANGER_SQUARES,
  SIEGE_DEFENDERS,
  SIEGE_DEFENDER_TYPES,
  SIEGE_ENDING_MS,
  SIEGE_EVENTS_SHOWN,
  SIEGE_FALLEN_SHOWN,
  SIEGE_GIANT_WAIT_MS,
  SIEGE_GOLD_PER_CORRECT,
  SIEGE_GROUP_GAP_MS,
  SIEGE_HEARTS,
  SIEGE_LANES,
  SIEGE_LEAP_MS,
  SIEGE_MAP_DOTS_MS,
  SIEGE_MAX_LEVEL,
  SIEGE_MONSTERS,
  SIEGE_MONSTER_ODDS,
  SIEGE_OPENING_MS,
  SIEGE_SHOTS_SHOWN,
  SIEGE_SQUARES,
  SIEGE_START_GOLD,
  SIEGE_STOMP_SPLASH,
  SIEGE_TICK_MS,
  SIEGE_WARNING_MS,
  siegeClassSizeFactor,
  siegeGiants,
  siegeNextScale,
  siegeMaxEntering,
  siegeMonsterHealth,
  siegeSpawnWindowMs,
  siegeUpgradeCost,
  siegeWaveBudget,
  type SiegeDefenderType,
  type SiegeMonsterType,
} from "../../shared/siege-rules.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

/** The message a phone shows when the treasury can't pay (usually because someone else just spent it). */
export const SIEGE_NO_GOLD = "Not enough gold. Someone just spent it.";

/** Where a monster that reaches this position has hit the castle wall (the wall face, in squares). */
const WALL_X = 0.5;
/** A monster is coming onto its lane while it is on squares 7–8. */
const ENTERING_X = SIEGE_SQUARES - 1.5;
const EPS = 1e-6;

export interface SiegePlayer extends BasePlayer, StreamPlayer {
  goldEarned: number;
  goldSpent: number;
  placed: Record<SiegeDefenderType, number>;
  upgrades: number;
  archerUpgrades: number;
  wallUpgrades: number;
  /** Monsters defeated by the defenders this player placed. */
  defeated: number;
  archerKills: number;
  lastPlaced: SiegeDefenderType | null;
  mapOpen: boolean;
}

export interface SiegeDefender {
  id: number;
  type: SiegeDefenderType;
  lane: number;
  square: number;
  level: number;
  health: number;
  maxHealth: number;
  /** The player who placed it (kept after a kick, for the results). */
  owner: SiegePlayer;
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

export interface SiegeWaveLog {
  wave: number;
  /** Difficulty scale in %. */
  scale: number;
  budget: number;
  sent: number;
  /** Answers given from the wave's start to the next wave's start (or the end of the game). */
  correct: number;
  answered: number;
  heartsLost: number;
}

export interface SiegeOptions {
  clock?: Clock;
  rng?: () => number;
  /** The class's best Endless run on this quiz so far. */
  record?: SiegeRecord | null;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: SiegeGame) => void;
}

export interface SiegeGameSettings extends SiegeSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

const DEFENDER_NAMES: Record<SiegeDefenderType, string> = { archer: "an archer", knight: "a knight", wall: "a stone wall" };

/**
 * Kingdom Siege: the whole class defends one castle wall against waves of monsters marching
 * down 5 lanes. Correct answers fill a shared treasury that anyone spends on defenders.
 * The battle runs in fixed SIEGE_TICK_MS steps on the game clock.
 */
export class SiegeGame {
  readonly kind = "siege";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly settings: SiegeGameSettings;
  readonly roster = new Roster<SiegePlayer>();
  /** Kicked players: their stats stay in the results. */
  readonly kicked: SiegePlayer[] = [];
  readonly startedAt = new Date();
  phase: SiegePhase = "countdown";
  phaseEndsAt = 0;
  phaseDurationMs = SIEGE_COUNTDOWN_MS;

  gold = SIEGE_START_GOLD;
  hearts = SIEGE_HEARTS;
  /** The wave being fought, or the next one during a build break. */
  wave = 0;
  /** Difficulty scale for the current wave, in %. */
  scale = 100;
  outcome: SiegeResult["outcome"] | null = null;
  readonly waveLog: SiegeWaveLog[] = [];
  defenders: SiegeDefender[] = [];
  monsters: SiegeMonster[] = [];
  /** The current wave's monsters still to come, soonest first. */
  pending: SiegeSpawn[] = [];
  shots: SiegeShot[] = [];
  fallen: SiegeFallen[] = [];
  events: SiegeEvent[] = [];
  danger: number[] = [];
  giantSeq = 0;
  wallHitSeq = 0;
  alert: { seq: number; kind: "giant" | "wall" } | null = null;
  readonly previousRecord: SiegeRecord | null;

  /** The lane each goblin group came in on. */
  private readonly groupLanes = new Map<number, number>();
  private mapDots: SiegeMapView["monsters"] = [];
  private mapDotsAt = -Infinity;
  private periodCorrect = 0;
  private periodAnswered = 0;
  private ids = 0;
  private seq = 0;
  private alertSeq = 0;
  private finishedResult: SiegeResult | null = null;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private tickTimer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: SiegeGame) => void;

  constructor(quiz: Quiz, settings: SiegeGameSettings, opts: SiegeOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.previousRecord = opts.record ?? null;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens). */
  static fromLobby(lobby: Game, opts: SiegeOptions = {}): SiegeGame {
    const game = new SiegeGame(lobby.quiz, { ...lobby.siege, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, SiegePlayer> {
    return this.roster.players;
  }

  /** Everyone who played, kicked players included. */
  get everyone(): SiegePlayer[] {
    return [...this.players.values(), ...this.kicked];
  }

  get endless(): boolean {
    return this.settings.waves === "endless";
  }

  private newPlayer(base: BasePlayer): SiegePlayer {
    return {
      ...base,
      ...newStreamPlayer(),
      goldEarned: 0,
      goldSpent: 0,
      placed: { archer: 0, knight: 0, wall: 0 },
      upgrades: 0,
      archerUpgrades: 0,
      wallUpgrades: 0,
      defeated: 0,
      archerKills: 0,
      lastPlaced: null,
      mapOpen: false,
    };
  }

  private get playing(): boolean {
    return this.phase === "build" || this.phase === "wave";
  }

  private connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.setPhase("countdown", SIEGE_COUNTDOWN_MS, () => this.beginOpening());
    this.onChange();
  }

  private setPhase(phase: SiegePhase, ms: number, then: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  /** The opening build break: questions start and the class places its first defenders. */
  private beginOpening(): void {
    this.wave = 1;
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    this.setPhase("build", SIEGE_OPENING_MS, () => this.beginWave(1));
    this.scheduleTick();
    this.onChange();
  }

  private beginWave(wave: number): void {
    // The wave just gone (and the break after it) sets this wave's difficulty.
    const prev = this.waveLog[this.waveLog.length - 1];
    if (prev) {
      prev.correct = this.periodCorrect;
      prev.answered = this.periodAnswered;
      this.scale = siegeNextScale(this.scale, this.periodCorrect, this.periodAnswered);
    }
    this.periodCorrect = 0;
    this.periodAnswered = 0;
    this.wave = wave;
    const budget = siegeWaveBudget(wave, this.connectedCount(), this.scale);
    this.pending = this.planWave(wave, budget);
    this.waveLog.push({ wave, scale: this.scale, budget, sent: 0, correct: 0, answered: 0, heartsLost: 0 });
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.phase = "wave";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.onChange();
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

  private scheduleTick(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, SIEGE_TICK_MS);
  }

  // ---------- the battle ----------

  private tick(): void {
    if (!this.playing) return;
    const now = this.clock.now();
    let changed = this.spawnStep(now);
    changed = this.monsterStep(now) || changed;
    changed = this.defenderStep() || changed;
    if (this.hearts <= 0) return this.fall();
    const danger = this.dangerLanes();
    if (danger.join() !== this.danger.join()) {
      this.danger = danger;
      changed = true;
    }
    if (now - this.mapDotsAt >= SIEGE_MAP_DOTS_MS) {
      this.mapDotsAt = now;
      const dots = this.monsters.map((m) => ({ lane: m.lane, square: Math.max(1, Math.min(SIEGE_SQUARES, Math.round(m.x))) }));
      if (JSON.stringify(dots) !== JSON.stringify(this.mapDots)) {
        this.mapDots = dots;
        if ([...this.players.values()].some((p) => p.mapOpen)) changed = true;
      }
    }
    if (this.phase === "wave" && this.pending.length === 0 && this.monsters.length === 0) return this.endWave();
    this.scheduleTick();
    if (changed) this.onChange();
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
    const cap = siegeMaxEntering(this.wave);
    if (mate !== undefined) return busy(mate) < cap ? mate : -1;
    const giantLanes = s.type === "giant" ? new Set([...this.monsters, ...this.pending].filter((m) => m.type === "giant" && m.lane >= 0).map((m) => m.lane)) : new Set<number>();
    const open = Array.from({ length: SIEGE_LANES }, (_, i) => i).filter((l) => busy(l) < cap && !giantLanes.has(l));
    if (open.length === 0) return -1;
    const least = Math.min(...open.map(busy));
    const best = open.filter((l) => busy(l) === least);
    return best[Math.min(best.length - 1, Math.floor(this.rng() * best.length))]!;
  }

  /** Put a monster on the entry square of a lane (also used by tests). */
  spawn(type: SiegeMonsterType, lane: number, x: number = SIEGE_SQUARES): SiegeMonster {
    const stats = SIEGE_MONSTERS[type];
    const health = siegeMonsterHealth(type, this.wave, this.connectedCount());
    const now = this.clock.now();
    const m: SiegeMonster = {
      id: ++this.ids,
      type,
      lane,
      x,
      state: type === "giant" ? "wait" : "walk",
      health,
      maxHealth: health,
      cooldown: stats.attackMs,
      waitUntil: type === "giant" ? now + SIEGE_GIANT_WAIT_MS : 0,
      leapt: false,
      leapFrom: x,
      leapTo: x,
      leapEndsAt: 0,
      hitSeq: 0,
      attackSeq: 0,
    };
    this.monsters.push(m);
    const log = this.waveLog[this.waveLog.length - 1];
    if (log && this.phase === "wave") log.sent++;
    if (type === "giant") {
      this.giantSeq++;
      this.setAlert("giant");
    }
    return m;
  }

  private setAlert(kind: "giant" | "wall"): void {
    this.alert = { seq: ++this.alertSeq, kind };
  }

  defenderAt(lane: number, square: number): SiegeDefender | undefined {
    return this.defenders.find((d) => d.lane === lane && d.square === square);
  }

  /** The nearest defender to the left of the monster's square, the one it walks into next. */
  private blocker(m: SiegeMonster): SiegeDefender | undefined {
    let best: SiegeDefender | undefined;
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
            m.cooldown += stats.attackMs;
            this.strike(m, target);
            changed = true;
          }
          continue;
        }
      }
      // Walking.
      const stopAt = target ? Math.min(m.x, target.square + 1) : WALL_X;
      const next = m.x - SIEGE_TICK_MS / stats.squareMs;
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
    m.cooldown = SIEGE_MONSTERS[m.type].attackMs;
  }

  /** One hit from a monster: the giant's stomp also hits the squares just above and below. */
  private strike(m: SiegeMonster, target: SiegeDefender): void {
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

  private damageDefender(d: SiegeDefender, amount: number, by: SiegeMonster): void {
    if (!this.defenders.includes(d)) return;
    d.health -= amount;
    d.hitSeq++;
    // Spikes hurt whatever hits the wall.
    const thorns = SIEGE_DEFENDERS[d.type].thorns[d.level - 1]!;
    if (thorns > 0 && this.monsters.includes(by)) this.damageMonster(by, thorns, d);
    if (d.health <= 0) this.defenders = this.defenders.filter((x) => x !== d);
  }

  private damageMonster(m: SiegeMonster, amount: number, by: SiegeDefender): void {
    m.health -= amount;
    m.hitSeq++;
    if (m.health > 0) return;
    this.removeMonster(m, false);
    by.owner.defeated++;
    if (by.type === "archer") by.owner.archerKills++;
  }

  private removeMonster(m: SiegeMonster, reachedWall: boolean): void {
    this.monsters = this.monsters.filter((x) => x !== m);
    this.fallen.push({ seq: ++this.seq, id: m.id, type: m.type, lane: m.lane, x: m.x, reachedWall });
    if (this.fallen.length > SIEGE_FALLEN_SHOWN) this.fallen.splice(0, this.fallen.length - SIEGE_FALLEN_SHOWN);
  }

  private reachWall(m: SiegeMonster): void {
    const lost = Math.min(this.hearts, SIEGE_MONSTERS[m.type].hearts);
    this.hearts -= lost;
    const log = this.waveLog[this.waveLog.length - 1];
    if (log) log.heartsLost += lost;
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
  private archerTarget(d: SiegeDefender): SiegeMonster | undefined {
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

  private endWave(): void {
    if (this.settings.waves !== "endless" && this.wave >= this.settings.waves) return this.stand();
    const next = this.wave + 1;
    this.wave = next;
    this.setPhase("build", SIEGE_BREAK_MS, () => this.beginWave(next));
    this.scheduleTick();
    this.onChange();
  }

  // ---------- building ----------

  /** Place a defender. Returns null, or why it couldn't be placed. One request at a time, so the first one wins the gold. */
  place(playerId: string, type: unknown, lane: unknown, square: unknown): string | null {
    const p = this.players.get(playerId);
    if (!p) return "You're not in this game.";
    if (!this.playing) return "You can't build right now.";
    if (typeof type !== "string" || !(SIEGE_DEFENDER_TYPES as readonly string[]).includes(type)) return "Unknown defender.";
    const t = type as SiegeDefenderType;
    const l = Number(lane);
    const s = Number(square);
    if (!Number.isInteger(l) || l < 0 || l >= SIEGE_LANES || !Number.isInteger(s) || s < 1 || s > SIEGE_BUILD_SQUARES) return "You can't build on that square.";
    if (this.defenderAt(l, s)) return "That square is taken.";
    if (this.monsters.some((m) => m.lane === l && Math.round(this.monsterX(m)) === s)) return "A monster is standing there.";
    const cost = SIEGE_DEFENDERS[t].cost[0];
    if (this.gold < cost) return SIEGE_NO_GOLD;
    this.gold -= cost;
    p.goldSpent += cost;
    p.placed[t]++;
    p.lastPlaced = t;
    const health = SIEGE_DEFENDERS[t].health[0];
    this.defenders.push({ id: ++this.ids, type: t, lane: l, square: s, level: 1, health, maxHealth: health, owner: p, cooldown: 0, hitSeq: 0, attackSeq: 0 });
    this.addEvent(p, `placed ${DEFENDER_NAMES[t]}`);
    this.onChange();
    return null;
  }

  /** Upgrade the defender on a square one level. The extra health is added to what it has left. */
  upgrade(playerId: string, lane: unknown, square: unknown): string | null {
    const p = this.players.get(playerId);
    if (!p) return "You're not in this game.";
    if (!this.playing) return "You can't build right now.";
    const d = this.defenderAt(Number(lane), Number(square));
    if (!d) return "That defender is gone.";
    const cost = siegeUpgradeCost(d.type, d.level);
    if (cost === null) return "Already at max level.";
    if (this.gold < cost) return SIEGE_NO_GOLD;
    this.gold -= cost;
    p.goldSpent += cost;
    p.upgrades++;
    if (d.type === "archer") p.archerUpgrades++;
    if (d.type === "wall") p.wallUpgrades++;
    const stats = SIEGE_DEFENDERS[d.type];
    d.level++;
    const maxHealth = stats.health[d.level - 1]!;
    d.health += maxHealth - d.maxHealth;
    d.maxHealth = maxHealth;
    this.addEvent(p, `upgraded ${DEFENDER_NAMES[d.type]} to Lv ${d.level}`);
    this.onChange();
    return null;
  }

  /** The phone's lane map opened or closed. */
  setMap(playerId: string, open: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.mapOpen === open) return;
    p.mapOpen = open && this.playing;
    this.onActivity(p.id);
  }

  private addEvent(p: SiegePlayer, text: string): void {
    this.events.push({ seq: ++this.seq, nickname: p.nickname, text });
    if (this.events.length > SIEGE_EVENTS_SHOWN) this.events.splice(0, this.events.length - SIEGE_EVENTS_SHOWN);
  }

  // ---------- the end ----------

  private stand(): void {
    this.closePeriod();
    this.outcome = "stands";
    this.stopBattle();
    this.setPhase("stands", SIEGE_ENDING_MS, () => this.finish());
    this.onChange();
  }

  private fall(): void {
    this.closePeriod();
    this.outcome = "fallen";
    this.stopBattle();
    this.setPhase("fallen", SIEGE_ENDING_MS, () => this.finish());
    this.onChange();
  }

  /** Host ends the game now: straight to the podium, without a cinematic. */
  end(): void {
    if (this.phase === "podium") return;
    if (!this.outcome) {
      this.closePeriod();
      this.outcome = "ended";
    }
    this.finish();
  }

  private closePeriod(): void {
    const log = this.waveLog[this.waveLog.length - 1];
    if (log && this.outcome === null) {
      log.correct = this.periodCorrect;
      log.answered = this.periodAnswered;
    }
  }

  private stopBattle(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.pending = [];
    for (const p of this.players.values()) p.mapOpen = false;
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.stopBattle();
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.finishedResult = this.computeResult();
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.stopBattle();
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SiegePlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.playing) this.stream.deal(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): SiegePlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    if (!connected) p.mapOpen = false;
    this.onChange();
  }

  /** The player's gold stays in the treasury and their defenders stay on the board. */
  kick(playerId: string): SiegePlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    p.connected = false;
    p.mapOpen = false;
    this.kicked.push(p);
    this.onChange();
    return p;
  }

  // ---------- answers ----------

  answer(playerId: string, seq: number, answer: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || !this.playing) return false;
    const correct = this.stream.answer(p, seq, answer);
    if (correct === null) return false;
    this.periodAnswered++;
    if (correct) {
      this.periodCorrect++;
      this.gold += SIEGE_GOLD_PER_CORRECT;
      p.goldEarned += SIEGE_GOLD_PER_CORRECT;
    }
    // Everyone's treasury changes on a correct answer; only the answerer's screen otherwise.
    if (correct) this.onChange();
    else this.onActivity(p.id);
    return true;
  }

  // ---------- results ----------

  awards(): SiegeAwards {
    const players = this.everyone;
    const best = (value: (p: SiegePlayer) => number, tie?: (p: SiegePlayer) => number) => {
      const top = Math.max(0, ...players.map(value));
      if (top <= 0) return null;
      let winners = players.filter((p) => value(p) === top);
      if (tie) {
        const t = Math.max(...winners.map(tie));
        winners = winners.filter((p) => tie(p) === t);
      }
      return { value: top, nicknames: winners.map((p) => p.nickname) };
    };
    return {
      topArcher: best((p) => p.archerKills, (p) => p.archerUpgrades),
      masterMason: best((p) => p.placed.wall + p.wallUpgrades),
      mostCorrect: best((p) => p.correct),
    };
  }

  /** Waves fully beaten. */
  wavesSurvived(): number {
    if (this.outcome === "stands") return this.wave;
    return Math.max(0, this.wave - 1);
  }

  /** Average difficulty scale over the waves played, in %. */
  avgScale(): number {
    if (this.waveLog.length === 0) return 100;
    return Math.round(this.waveLog.reduce((n, w) => n + w.scale, 0) / this.waveLog.length);
  }

  result(): SiegeResult {
    return this.finishedResult ?? this.computeResult();
  }

  private computeResult(): SiegeResult {
    const outcome = this.outcome ?? "ended";
    const survived = this.wavesSurvived();
    const waves = this.settings.waves;
    const avg = this.avgScale();
    let headline: string;
    if (outcome === "ended") headline = `Ended on wave ${Math.max(1, this.wave)} with ${this.hearts} ${this.hearts === 1 ? "heart" : "hearts"} left.`;
    else if (outcome === "stands") headline = `The kingdom stands with ${this.hearts} of ${SIEGE_HEARTS} hearts!`;
    else if (waves === "endless") headline = `Survived ${survived} ${survived === 1 ? "wave" : "waves"}`;
    else headline = `The castle fell on wave ${this.wave} of ${waves}.`;
    let record: SiegeRecord | null = null;
    let newRecord = false;
    if (waves === "endless") {
      const prev = this.previousRecord;
      newRecord = survived > 0 && (!prev || survived > prev.waves || (survived === prev.waves && avg > prev.avgScale));
      record = newRecord ? { waves: survived, avgScale: avg, date: new Date(this.clock.now()).toISOString() } : prev;
    }
    return { outcome, wave: Math.max(1, this.wave), waves, wavesSurvived: survived, hearts: this.hearts, headline, avgScale: waves === "endless" ? avg : null, record, newRecord };
  }

  // ---------- views ----------

  private remaining(at: number): number {
    return at ? Math.max(0, at - this.clock.now()) : 0;
  }

  hostView(): HostSiegeState {
    const now = this.clock.now();
    const podium = this.phase === "podium";
    const players = [...this.players.values()];
    const ending = this.phase === "stands" || this.phase === "fallen" || podium;
    const giant = this.monsters.find((m) => m.type === "giant" && m.state === "wait");
    return {
      kind: "siege",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      settings: { waves: this.settings.waves },
      wave: this.wave,
      gold: this.gold,
      hearts: this.hearts,
      maxHearts: SIEGE_HEARTS,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.remaining(this.phaseEndsAt),
      phaseDurationMs: this.phaseDurationMs,
      defenders: this.defenders.map((d) => ({ id: d.id, type: d.type, lane: d.lane, square: d.square, level: d.level, health: d.health, maxHealth: d.maxHealth, hitSeq: d.hitSeq, attackSeq: d.attackSeq })),
      monsters: this.monsters.map((m) => {
        const x = this.monsterX(m);
        let toX = x;
        let moveMs = 0;
        if (this.playing && m.state === "walk") {
          const target = this.blocker(m);
          toX = target ? Math.min(x, target.square + 1) : WALL_X;
          moveMs = Math.round((x - toX) * SIEGE_MONSTERS[m.type].squareMs);
        } else if (this.playing && m.state === "leap") {
          toX = m.leapTo;
          moveMs = Math.max(0, m.leapEndsAt - now);
        }
        return { id: m.id, type: m.type, lane: m.lane, x, toX, moveMs, state: m.state, health: m.health, maxHealth: m.maxHealth, hitSeq: m.hitSeq, attackSeq: m.attackSeq };
      }),
      shots: this.shots,
      fallen: this.fallen,
      events: this.events,
      warnings: ending ? [] : this.pending.filter((s) => s.lane >= 0).map((s) => ({ lane: s.lane, ms: Math.max(0, s.at - now) })),
      danger: ending ? [] : this.danger,
      giant: giant && this.playing ? { lane: giant.lane, ms: Math.max(0, giant.waitUntil - now) } : null,
      giantSeq: this.giantSeq,
      wallHitSeq: this.wallHitSeq,
      monsterCount: this.monsters.length,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected })),
      playerCount: players.length,
      connectedCount: players.filter((p) => p.connected).length,
      result: ending && this.outcome ? this.result() : null,
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
      hasResults: podium,
    };
  }

  private mapView(): SiegeMapView {
    return {
      defenders: this.defenders.map((d) => ({ lane: d.lane, square: d.square, type: d.type, level: d.level })),
      monsters: this.mapDots,
    };
  }

  playerView(playerId: string): PlayerSiegeView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const podium = this.phase === "podium";
    let result: PlayerSiegeView["result"] = null;
    if ((podium || this.phase === "stands" || this.phase === "fallen") && this.outcome) {
      const r = this.result();
      const a = this.awards();
      const won = (x: { nicknames: string[] } | null) => !!x?.nicknames.includes(p.nickname);
      result = {
        outcome: r.outcome,
        headline: r.headline,
        goldEarned: p.goldEarned,
        goldSpent: p.goldSpent,
        placed: { ...p.placed },
        upgrades: p.upgrades,
        defeated: p.defeated,
        awards: podium ? [...(won(a.topArcher) ? ["Top Archer Captain"] : []), ...(won(a.masterMason) ? ["Master Mason"] : []), ...(won(a.mostCorrect) ? ["Most correct answers"] : [])] : [],
      };
    }
    return {
      kind: "siege",
      phase: this.phase,
      title: this.title,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.remaining(this.phaseEndsAt),
      phaseDurationMs: this.phaseDurationMs,
      wave: this.wave,
      waves: this.settings.waves,
      hearts: this.hearts,
      gold: Math.round(this.gold / 5) * 5,
      danger: this.playing ? this.danger : [],
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, goldEarned: p.goldEarned },
      question: this.playing ? this.stream.questionView(p) : null,
      feedback: this.playing ? this.stream.feedbackView(p) : null,
      lastPlaced: p.lastPlaced,
      alert: this.playing ? this.alert : null,
      map: p.mapOpen && this.playing ? this.mapView() : null,
      result,
    };
  }
}

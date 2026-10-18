import { MAX_TYPED_ANSWER, checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import {
  DRAGON_CHARM_CHESTS,
  DRAGON_CHESTS,
  DRAGON_CHEST_MS,
  DRAGON_EVENTS_SHOWN,
  DRAGON_FIRE_HEAL,
  DRAGON_FIRE_WARN_MS,
  DRAGON_GRAB_COOLDOWN_MS,
  DRAGON_GRAB_MS,
  DRAGON_GRAB_SHARE,
  DRAGON_HITS_PER_PLAYER,
  DRAGON_HITS_SHOWN,
  DRAGON_JACKPOT_LOCK_MS,
  DRAGON_JACKPOT_PER_PLAYER,
  DRAGON_JACKPOT_START,
  DRAGON_LOOT_MS,
  DRAGON_LOOT_TABLE,
  DRAGON_MIN_HEALTH,
  DRAGON_RUNE_MAX_MS,
  DRAGON_RUNE_MIN_MS,
  DRAGON_RUNE_REVEAL_MS,
  DRAGON_SHIELD_BONUS,
  DRAGON_SHIELD_SHARE,
  DRAGON_TRANSITION_MS,
  DRAGON_TRAP_SHARE,
  dragonCoinValue,
  dragonFireSec,
  dragonStage,
  type DragonAwards,
  type DragonEvent,
  type DragonFireStep,
  type DragonHit,
  type DragonLoot,
  type DragonLootView,
  type DragonPhase,
  type DragonPlayerState,
  type DragonResult,
  type DragonRuneQuestion,
  type DragonSettings,
  type HostDragonFire,
  type HostDragonState,
  type PlayerDragonView,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, shuffleOptions, teamInfo, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const COUNTDOWN_MS = 3000;
/** Rune answers sent just before the deadline may arrive slightly after it. */
export const RUNE_GRACE_MS = 500;
/** No new fire breath starts with less battle time than this left. */
export const FIRE_MIN_BATTLE_LEFT_MS = 10_000;
/** When a new wounded stage brings the fire forward, it still comes no sooner than this. */
const FIRE_SOONEST_MS = 3000;

export interface DragonPlayer extends BasePlayer, StreamPlayer {
  /** The Act 2 team, fixed from the start (late joiners go to the smallest team). */
  team: number;
  /** Act 2 only; Act 1 is always answering. */
  state: Exclude<DragonPlayerState, "waiting">;
  hits: number;
  runeRight: number;
  runeWrong: number;
  /** Correct self-paced answers in Act 2 (the team tie-break). */
  scrambleCorrect: number;
  chestsOpened: number;
  goldFound: number;
  goldGrabbed: number;
  lostToTraps: number;
  jackpots: number;
  /** Coin chests left that a Lucky charm doubles. */
  charm: number;
  chestSeq: number;
  chestEndsAt: number;
  grab: { seq: number; kind: DragonLoot; endsAt: number } | null;
  loot: Omit<DragonLootView, "remainingMs"> | null;
  lootEndsAt: number;
  /** The player's chest, grab or loot timer. */
  timer: unknown;
}

export interface DragonTeam {
  index: number;
  name: string;
  color: string;
  gold: number;
  scales: number;
  /** Can't be grabbed from until then. */
  protectedUntil: number;
  lostToGrabs: number;
}

interface RuneAnswer {
  option: number;
  text?: string;
  correct: boolean;
}

interface Fire {
  seq: number;
  step: DragonFireStep;
  qIndex: number;
  options: string[];
  correct: number[];
  /** Everyone in the game when the fire started; later joiners wait it out. */
  participants: Set<string>;
  answers: Map<string, RuneAnswer>;
  right: number;
  needed: number;
  held: boolean;
  amount: number;
}

export interface DragonOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: DragonGame) => void;
}

export interface DragonGameSettings extends DragonSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}

/**
 * Dragon's Hoard: the whole class fights one dragon with correct answers (Act 1, with
 * fire-breath rune rounds), then teams race to grab its spilled hoard from chests (Act 2).
 */
export class DragonGame {
  readonly kind = "dragon";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly settings: DragonGameSettings;
  teams: DragonTeam[];
  readonly roster = new Roster<DragonPlayer>();
  readonly startedAt = new Date();
  phase: DragonPhase = "countdown";
  phaseEndsAt = 0;
  phaseDurationMs = COUNTDOWN_MS;

  health = 0;
  maxHealth = 0;
  maxStage = 0;
  slain = false;
  escaped = false;
  slainMs: number | null = null;
  runeHeld = 0;
  runeFailed = 0;
  fire: Fire | null = null;
  jackpot = 0;
  hits: DragonHit[] = [];
  events: DragonEvent[] = [];

  /** Players who have taken part in the battle; each adds their hits to the dragon's health. */
  private fighters = 0;
  private battleStartedAt = 0;
  private battleEndsAt = 0;
  private fireAt = 0;
  private scrambleStartedAt = 0;
  private lastRune = -1;
  private fireSeq = 0;
  private hitSeq = 0;
  private eventSeq = 0;
  private lootSeq = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private battleTimer: unknown = null;
  private fireTimer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: DragonGame) => void;

  constructor(quiz: Quiz, settings: DragonGameSettings, opts: DragonOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.teams = Array.from({ length: Math.max(1, settings.teams) }, (_, i) => ({ ...teamInfo(i), gold: 0, scales: 0, protectedUntil: 0, lostToGrabs: 0 }));
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), on the teams shown in the lobby. */
  static fromLobby(lobby: Game, opts: DragonOptions = {}): DragonGame {
    const settings = { ...lobby.dragon, teams: lobby.teamCount() ?? 1, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect };
    const game = new DragonGame(lobby.quiz, settings, opts);
    const teams = lobby.teamAssignment();
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }, teams.get(p.id) ?? 0));
    }
    return game;
  }

  get players(): Map<string, DragonPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer, team: number): DragonPlayer {
    return {
      ...base,
      ...newStreamPlayer(),
      team,
      state: "question",
      hits: 0,
      runeRight: 0,
      runeWrong: 0,
      scrambleCorrect: 0,
      chestsOpened: 0,
      goldFound: 0,
      goldGrabbed: 0,
      lostToTraps: 0,
      jackpots: 0,
      charm: 0,
      chestSeq: 0,
      chestEndsAt: 0,
      grab: null,
      loot: null,
      lootEndsAt: 0,
      timer: null,
    };
  }

  private get act1(): boolean {
    return this.phase === "countdown" || this.phase === "battle" || this.phase === "fire";
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    // Never more teams than players: a team of one is fine, an empty team isn't.
    const count = Math.max(1, Math.min(this.teams.length, this.players.size));
    if (count < this.teams.length) {
      this.teams = this.teams.slice(0, count);
      for (const p of this.players.values()) if (p.team >= count) p.team = this.smallestTeam();
    }
    this.fighters = this.players.size;
    this.maxHealth = this.healthFor(this.fighters);
    this.health = this.maxHealth;
    this.setPhase("countdown", COUNTDOWN_MS, () => this.beginBattle());
    this.onChange();
  }

  private healthFor(fighters: number): number {
    return Math.max(DRAGON_MIN_HEALTH, fighters * DRAGON_HITS_PER_PLAYER[this.settings.toughness]);
  }

  private setPhase(phase: DragonPhase, ms: number, then: () => void, graceMs = 0): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms + graceMs);
  }

  private beginBattle(): void {
    const now = this.clock.now();
    const ms = this.settings.battleMinutes * 60_000;
    this.phase = "battle";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.battleStartedAt = now;
    this.battleEndsAt = now + ms;
    this.battleTimer = this.clock.setTimeout(() => {
      this.battleTimer = null;
      // A rune round in progress plays out first (see afterRune).
      if (this.phase === "battle") this.endBattle(false);
    }, ms);
    for (const p of this.players.values()) if (!p.current) this.stream.deal(p);
    this.scheduleFire(this.fireIntervalMs());
    this.onChange();
  }

  private fireIntervalMs(): number {
    return dragonFireSec(this.settings.fireSec, this.maxStage) * 1000;
  }

  private scheduleFire(ms: number): void {
    if (this.fireTimer !== null) this.clock.clearTimeout(this.fireTimer);
    this.fireAt = this.clock.now() + ms;
    this.fireTimer = this.clock.setTimeout(() => {
      this.fireTimer = null;
      this.startFire();
    }, ms);
  }

  // ---------- fire breath (the rune round) ----------

  private startFire(): void {
    if (this.phase !== "battle") return;
    const now = this.clock.now();
    if (this.battleEndsAt - now < FIRE_MIN_BATTLE_LEFT_MS) return;
    // Nobody to raise the shield: try again later.
    if (![...this.players.values()].some((p) => p.connected)) return this.scheduleFire(this.fireIntervalMs());
    const qIndex = this.pickRune();
    const q = this.questions[qIndex]!;
    const shown = this.settings.shuffleAnswers ? shuffleOptions(q, this.rng) : q;
    this.lastRune = qIndex;
    this.fire = {
      seq: ++this.fireSeq,
      step: "warning",
      qIndex,
      options: [...shown.options],
      correct: [...shown.correct],
      participants: new Set(this.players.keys()),
      answers: new Map(),
      right: 0,
      needed: 0,
      held: false,
      amount: 0,
    };
    this.setPhase("fire", DRAGON_FIRE_WARN_MS, () => this.openRune());
    this.onChange();
  }

  /** The question the class has gotten wrong most so far (not the last one used); a random one if nothing has been missed yet. */
  private pickRune(): number {
    const n = this.questions.length;
    const allowed = (i: number) => n === 1 || i !== this.lastRune;
    const wrong = this.stream.wrongCounts;
    let best = -1;
    for (let i = 0; i < n; i++) if (allowed(i) && wrong[i]! > 0 && (best < 0 || wrong[i]! > wrong[best]!)) best = i;
    if (best >= 0) return best;
    const pool = this.questions.map((_, i) => i).filter(allowed);
    return pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))]!;
  }

  private runeMs(): number {
    const q = this.questions[this.fire!.qIndex]!;
    return Math.max(DRAGON_RUNE_MIN_MS, Math.min(DRAGON_RUNE_MAX_MS, q.timeLimitSec * 1000));
  }

  private openRune(): void {
    const f = this.fire;
    if (this.phase !== "fire" || !f || f.step !== "warning") return;
    f.step = "question";
    this.setPhase("fire", this.runeMs(), () => this.closeRune(), RUNE_GRACE_MS);
    this.onChange();
  }

  private runeAnswer(p: DragonPlayer, seq: number, answer: AnswerValue): boolean {
    const f = this.fire;
    if (this.phase !== "fire" || !f || f.step !== "question" || seq !== f.seq) return false;
    if (!f.participants.has(p.id) || f.answers.has(p.id)) return false;
    const q = this.questions[f.qIndex]!;
    const correct = checkAnswer({ type: q.type, options: f.options, correct: f.correct }, answer);
    if (correct === null) return false;
    f.answers.set(p.id, typeof answer === "string" ? { option: -1, text: answer.slice(0, MAX_TYPED_ANSWER), correct } : { option: answer, correct });
    if (correct) {
      p.correct++;
      p.runeRight++;
    } else {
      p.wrong++;
      p.runeWrong++;
      this.stream.wrongCounts[f.qIndex]!++;
    }
    this.onActivity(p.id);
    this.maybeCloseRune();
    return true;
  }

  /** Everyone still connected has answered. */
  private maybeCloseRune(): void {
    const f = this.fire;
    if (this.phase !== "fire" || !f || f.step !== "question") return;
    const waiting = [...f.participants].some((id) => {
      const p = this.players.get(id);
      return p && p.connected && !f.answers.has(id);
    });
    if (!waiting) this.closeRune();
  }

  private closeRune(): void {
    const f = this.fire;
    if (this.phase !== "fire" || !f || f.step !== "question") return;
    f.step = "reveal";
    // Disconnected players who didn't answer don't count toward the 2/3.
    const counted = [...f.participants].filter((id) => {
      const p = this.players.get(id);
      return p && (p.connected || f.answers.has(id));
    }).length;
    f.right = [...f.answers.values()].filter((a) => a.correct).length;
    f.needed = Math.ceil(counted * DRAGON_SHIELD_SHARE - 1e-9);
    f.held = counted > 0 && f.right >= f.needed;
    if (f.held) {
      f.amount = Math.min(this.health, Math.max(1, Math.round(this.maxHealth * DRAGON_SHIELD_BONUS)));
      this.health -= f.amount;
      this.runeHeld++;
      if (this.health <= 0) this.slainMs = this.clock.now() - this.battleStartedAt;
    } else {
      f.amount = Math.min(this.maxHealth - this.health, Math.max(1, Math.round(this.maxHealth * DRAGON_FIRE_HEAL)));
      this.health += f.amount;
      this.runeFailed++;
    }
    this.updateStage();
    this.setPhase("fire", DRAGON_RUNE_REVEAL_MS, () => this.afterRune());
    this.onChange();
  }

  private afterRune(): void {
    this.fire = null;
    if (this.health <= 0) return this.endBattle(true);
    if (this.clock.now() >= this.battleEndsAt) return this.endBattle(false);
    this.phase = "battle";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.scheduleFire(this.fireIntervalMs());
    this.onChange();
  }

  // ---------- the battle ----------

  private hit(p: DragonPlayer): void {
    if (this.health <= 0) return;
    this.health--;
    p.hits++;
    this.hits.push({ seq: ++this.hitSeq, nickname: p.nickname, avatar: p.avatar });
    if (this.hits.length > DRAGON_HITS_SHOWN) this.hits.splice(0, this.hits.length - DRAGON_HITS_SHOWN);
    if (this.health <= 0) {
      this.slainMs = this.clock.now() - this.battleStartedAt;
      this.endBattle(true);
      return;
    }
    this.updateStage();
  }

  /** A new wounded stage: the dragon roars and the fire breath comes sooner. */
  private updateStage(): void {
    const stage = dragonStage(this.health, this.maxHealth);
    if (stage <= this.maxStage) return;
    const before = this.fireIntervalMs();
    this.maxStage = stage;
    const sooner = before - this.fireIntervalMs();
    if (this.phase === "battle" && this.fireTimer !== null && sooner > 0) {
      const now = this.clock.now();
      const at = Math.max(now + FIRE_SOONEST_MS, this.fireAt - sooner);
      if (at < this.fireAt) this.scheduleFire(at - now);
    }
  }

  /** Slain, or the battle clock ran out and the dragon escapes with half its hoard. Either way, on to the teams. */
  private endBattle(slain: boolean): void {
    if (!this.act1) return;
    this.clearBattleTimers();
    this.fire = null;
    this.slain = slain;
    this.escaped = !slain;
    if (!slain) this.slainMs = null;
    this.setPhase("transition", DRAGON_TRANSITION_MS, () => this.beginScramble());
    this.onChange();
  }

  // ---------- the scramble ----------

  private beginScramble(): void {
    this.scrambleStartedAt = this.clock.now();
    this.jackpot = DRAGON_JACKPOT_START + DRAGON_JACKPOT_PER_PLAYER * this.players.size;
    for (const p of this.players.values()) {
      p.state = "question";
      if (!p.current) this.stream.deal(p);
    }
    this.setPhase("scramble", this.settings.scrambleMinutes * 60_000, () => this.finish());
    this.onChange();
  }

  private offerChest(p: DragonPlayer): void {
    this.clearPlayerTimer(p);
    p.state = "chest";
    p.chestSeq++;
    // The 10 seconds start once the ✓ has been seen.
    p.chestEndsAt = Math.max(this.clock.now(), p.readyAt) + DRAGON_CHEST_MS;
    p.timer = this.clock.setTimeout(() => this.openChest(p.id), p.chestEndsAt - this.clock.now());
  }

  /** Open one of the chests on offer (all the same odds, so which one doesn't matter to the server). */
  chest(playerId: string, chest: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "scramble" || p.state !== "chest") return false;
    if (!Number.isInteger(chest) || chest < 0 || chest >= DRAGON_CHESTS) return false;
    this.openChest(p.id);
    return true;
  }

  private openChest(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "scramble" || p.state !== "chest") return;
    this.clearPlayerTimer(p);
    p.chestsOpened++;
    const kind = this.rollLoot();
    const team = this.teams[p.team]!;
    switch (kind) {
      case "coins":
      case "bigPile":
        this.payCoins(p, kind, false);
        break;
      case "charm":
        p.charm += DRAGON_CHARM_CHESTS;
        this.showLoot(p, { kind, gold: 0 });
        break;
      case "grab10":
      case "grab25":
        if (!this.teams.some((t) => t.index !== p.team && t.gold > 0)) {
          // Nobody to grab from (or a single team): it pays as Coins.
          this.payCoins(p, "coins", true, kind);
        } else {
          p.state = "grab";
          p.grab = { seq: p.chestSeq, kind, endsAt: this.clock.now() + DRAGON_GRAB_MS };
          p.timer = this.clock.setTimeout(() => this.autoGrab(p.id), DRAGON_GRAB_MS);
        }
        break;
      case "trap": {
        const lost = Math.round(team.gold * DRAGON_TRAP_SHARE);
        team.gold -= lost;
        this.jackpot += lost;
        p.lostToTraps += lost;
        this.addEvent({ kind: "trap", nickname: p.nickname, team: p.team, target: null, gold: lost });
        this.showLoot(p, { kind, gold: lost });
        break;
      }
      case "scale":
        team.scales++;
        this.showLoot(p, { kind, gold: 0 });
        break;
      case "bats":
        this.showLoot(p, { kind, gold: 0 });
        break;
      case "jackpot": {
        const gold = this.jackpot;
        this.jackpot = 0;
        team.gold += gold;
        p.goldFound += gold;
        p.jackpots++;
        this.addEvent({ kind: "jackpot", nickname: p.nickname, team: p.team, target: null, gold });
        this.showLoot(p, { kind, gold });
        break;
      }
    }
    this.onChange();
  }

  /** Every chest has the same odds. The Jackpot can't come up early in the scramble, or while it is empty. */
  rollLoot(): DragonLoot {
    const jackpotOk = this.clock.now() - this.scrambleStartedAt >= DRAGON_JACKPOT_LOCK_MS && this.jackpot > 0;
    const table = DRAGON_LOOT_TABLE.filter((l) => l.kind !== "jackpot" || jackpotOk);
    const total = table.reduce((n, l) => n + l.chance, 0);
    let r = this.rng() * total;
    for (const l of table) {
      r -= l.chance;
      if (r < 0) return l.kind;
    }
    return table[table.length - 1]!.kind;
  }

  private payCoins(p: DragonPlayer, kind: "coins" | "bigPile", asCoins: boolean, shownAs: DragonLoot = kind): void {
    let gold = dragonCoinValue(kind, this.escaped);
    const doubled = p.charm > 0;
    if (doubled) {
      gold *= 2;
      p.charm--;
    }
    this.teams[p.team]!.gold += gold;
    p.goldFound += gold;
    this.showLoot(p, { kind: shownAs, gold, doubled, asCoins });
  }

  private showLoot(p: DragonPlayer, loot: Partial<Omit<DragonLootView, "remainingMs" | "seq">> & { kind: DragonLoot; gold: number }): void {
    this.clearPlayerTimer(p);
    p.state = "loot";
    p.grab = null;
    p.loot = { doubled: false, asCoins: false, target: null, blocked: false, ...loot, seq: ++this.lootSeq };
    p.lootEndsAt = this.clock.now() + DRAGON_LOOT_MS;
    p.timer = this.clock.setTimeout(() => {
      p.timer = null;
      if (this.phase !== "scramble" || p.state !== "loot") return;
      p.state = "question";
      p.readyAt = Math.max(p.readyAt, this.clock.now());
      this.onActivity(p.id);
    }, DRAGON_LOOT_MS);
  }

  /** Steal from a team: not your own, not one with no gold, and not one grabbed from in the last few seconds. */
  grab(playerId: string, teamIndex: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "scramble" || p.state !== "grab" || !p.grab) return false;
    const target = this.teams[teamIndex];
    if (!Number.isInteger(teamIndex) || !target || !this.canGrab(p, target)) return false;
    this.resolveGrab(p, target);
    this.onChange();
    return true;
  }

  private canGrab(p: DragonPlayer, t: DragonTeam): boolean {
    return t.index !== p.team && t.gold > 0 && this.clock.now() >= t.protectedUntil;
  }

  /** Time's up: the richest team that can be picked. If none can, the chest pays as Coins. */
  private autoGrab(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "scramble" || p.state !== "grab" || !p.grab) return;
    p.timer = null;
    const target = this.teams.filter((t) => this.canGrab(p, t)).sort((a, b) => b.gold - a.gold || a.index - b.index)[0];
    if (target) this.resolveGrab(p, target);
    else this.payCoins(p, "coins", true, p.grab.kind);
    this.onChange();
  }

  private resolveGrab(p: DragonPlayer, target: DragonTeam): void {
    const kind = p.grab!.kind;
    const info = teamInfo(target.index);
    if (target.scales > 0) {
      target.scales--;
      this.addEvent({ kind: "blocked", nickname: p.nickname, team: p.team, target: target.index, gold: 0 });
      this.showLoot(p, { kind, gold: 0, target: info, blocked: true });
      return;
    }
    const gold = Math.min(target.gold, Math.max(1, Math.round(target.gold * (DRAGON_GRAB_SHARE[kind] ?? 0))));
    target.gold -= gold;
    target.lostToGrabs += gold;
    target.protectedUntil = this.clock.now() + DRAGON_GRAB_COOLDOWN_MS;
    this.teams[p.team]!.gold += gold;
    p.goldGrabbed += gold;
    this.addEvent({ kind: "grab", nickname: p.nickname, team: p.team, target: target.index, gold });
    this.showLoot(p, { kind, gold, target: info });
  }

  private addEvent(e: Omit<DragonEvent, "seq">): void {
    this.events.push({ ...e, seq: ++this.eventSeq });
    if (this.events.length > DRAGON_EVENTS_SHOWN) this.events.splice(0, this.events.length - DRAGON_EVENTS_SHOWN);
  }

  // ---------- the end ----------

  /** Host ends the game now. Ending during Act 1 counts as the dragon escaping. */
  end(): void {
    this.finish();
  }

  private finish(): void {
    if (this.phase === "podium") return;
    if (this.act1 && !this.slain) this.escaped = true;
    this.clearTimers();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.fire = null;
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimers();
  }

  private clearBattleTimers(): void {
    if (this.battleTimer !== null) this.clock.clearTimeout(this.battleTimer);
    if (this.fireTimer !== null) this.clock.clearTimeout(this.fireTimer);
    this.battleTimer = null;
    this.fireTimer = null;
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.clearBattleTimers();
    for (const p of this.players.values()) this.clearPlayerTimer(p);
  }

  private clearPlayerTimer(p: DragonPlayer): void {
    if (p.timer !== null) this.clock.clearTimeout(p.timer);
    p.timer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): DragonPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, this.smallestTeam()));
    if (this.act1) {
      // A late fighter adds their hits; the bar keeps its percentage.
      const before = this.maxHealth;
      this.fighters++;
      this.maxHealth = this.healthFor(this.fighters);
      if (before > 0 && this.maxHealth !== before) this.health = Math.max(1, Math.round((this.health * this.maxHealth) / before));
    }
    if (this.phase !== "countdown") this.stream.deal(player);
    this.onChange();
    return player;
  }

  private smallestTeam(): number {
    const sizes = this.teams.map(() => 0);
    for (const p of this.players.values()) if (p.team < sizes.length) sizes[p.team]!++;
    return sizes.indexOf(Math.min(...sizes));
  }

  byToken(token: unknown): DragonPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.maybeCloseRune();
  }

  kick(playerId: string): DragonPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.clearPlayerTimer(p);
    this.fire?.participants.delete(p.id);
    this.onChange();
    this.maybeCloseRune();
    return p;
  }

  // ---------- answers ----------

  /** A self-paced answer, or (rune) the answer to the class-wide rune question. */
  answer(playerId: string, seq: number, answer: AnswerValue, rune = false): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
    if (rune) return this.runeAnswer(p, seq, answer);
    if (!p.current) return false;
    if (this.phase !== "battle" && !(this.phase === "scramble" && p.state === "question")) return false;
    const correct = this.stream.answer(p, seq, answer);
    if (correct === null) return false;
    if (correct && this.phase === "battle") {
      this.hit(p);
    } else if (correct) {
      p.scrambleCorrect++;
      this.offerChest(p);
    }
    this.onActivity(p.id);
    return true;
  }

  // ---------- results ----------

  /** Teams by gold, then correct answers in Act 2; equal teams share a rank. */
  rankedTeams(): (DragonTeam & { rank: number; correct: number })[] {
    const correct = this.teams.map(() => 0);
    for (const p of this.players.values()) if (p.team < correct.length) correct[p.team]! += p.scrambleCorrect;
    const sorted = this.teams.map((t) => ({ ...t, correct: correct[t.index]!, rank: 0 })).sort((a, b) => b.gold - a.gold || b.correct - a.correct || a.index - b.index);
    sorted.forEach((t, i) => {
      const prev = sorted[i - 1];
      t.rank = prev && prev.gold === t.gold && prev.correct === t.correct ? prev.rank : i + 1;
    });
    return sorted;
  }

  awards(): DragonAwards {
    const players = [...this.players.values()];
    const best = (value: (p: DragonPlayer) => number) => {
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return {
      dragonSlayer: best((p) => p.hits),
      runeMaster: best((p) => p.runeRight),
      masterThief: best((p) => p.goldGrabbed),
      mostCorrect: best((p) => p.correct),
    };
  }

  result(): DragonResult {
    return { slain: this.slain, slainMs: this.slainMs, runeHeld: this.runeHeld, runeFailed: this.runeFailed };
  }

  // ---------- views ----------

  private remaining(at: number): number {
    return at ? Math.max(0, at - this.clock.now()) : 0;
  }

  /** The act's clock. */
  private clockMs(): number {
    if (this.phase === "battle" || this.phase === "fire") return this.remaining(this.battleEndsAt);
    if (this.phase === "podium") return 0;
    return this.remaining(this.phaseEndsAt);
  }

  private runeQuestion(f: Fire): DragonRuneQuestion | null {
    if (f.step === "warning") return null;
    const q = this.questions[f.qIndex]!;
    return {
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      // A typed question's accepted answers stay hidden until the reveal.
      options: q.type === "text" && f.step !== "reveal" ? [] : f.options,
      ...(q.spots ? { spots: q.spots } : {}),
    };
  }

  private fireView(): HostDragonFire | null {
    const f = this.fire;
    if (!f || this.phase !== "fire") return null;
    const reveal = f.step === "reveal";
    const answers = [...f.answers.values()];
    return {
      seq: f.seq,
      step: f.step,
      question: this.runeQuestion(f),
      answered: f.answers.size,
      total: f.participants.size,
      correct: reveal ? f.correct : null,
      answerCounts: reveal ? f.options.map((_, i) => answers.filter((a) => a.option === i).length) : null,
      right: reveal ? f.right : null,
      needed: reveal ? f.needed : null,
      held: reveal ? f.held : null,
      amount: reveal ? f.amount : null,
    };
  }

  hostView(): HostDragonState {
    const podium = this.phase === "podium";
    const ranked = new Map(this.rankedTeams().map((t) => [t.index, t]));
    const players = [...this.players.values()];
    const scramble = this.phase === "scramble";
    return {
      kind: "dragon",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      settings: { teams: this.settings.teams, toughness: this.settings.toughness, battleMinutes: this.settings.battleMinutes, fireSec: this.settings.fireSec, scrambleMinutes: this.settings.scrambleMinutes },
      remainingMs: this.clockMs(),
      phaseRemainingMs: this.phase === "battle" || scramble ? 0 : this.remaining(this.phaseEndsAt),
      phaseDurationMs: this.phaseDurationMs,
      health: this.health,
      maxHealth: this.maxHealth,
      stage: dragonStage(this.health, this.maxHealth),
      maxStage: this.maxStage,
      slain: this.slain,
      escaped: this.escaped,
      nextFireMs: this.phase === "battle" && this.fireTimer !== null ? this.remaining(this.fireAt) : null,
      hits: this.act1 ? this.hits : [],
      fire: this.fireView(),
      teams: this.teams.map((t) => ({
        ...teamInfo(t.index),
        gold: t.gold,
        rank: ranked.get(t.index)!.rank,
        correct: ranked.get(t.index)!.correct,
        scales: t.scales,
        protectedMs: scramble ? this.remaining(t.protectedUntil) : 0,
        members: players.filter((p) => p.team === t.index).map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected })),
      })),
      jackpot: this.jackpot,
      jackpotLocked: !scramble || this.clock.now() - this.scrambleStartedAt < DRAGON_JACKPOT_LOCK_MS,
      events: scramble || podium ? this.events : [],
      playerCount: players.length,
      connectedCount: players.filter((p) => p.connected).length,
      result: this.act1 ? null : this.result(),
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerDragonView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.clock.now();
    const act2 = !this.act1;
    const f = this.phase === "fire" ? this.fire : null;
    const inFire = !!f && f.participants.has(p.id);
    const state: DragonPlayerState = f && !inFire ? "waiting" : this.phase === "scramble" ? p.state : "question";
    const answering = this.phase === "battle" || (this.phase === "scramble" && state === "question");
    let fire: PlayerDragonView["fire"] = null;
    if (f && inFire) {
      const mine = f.answers.get(p.id);
      const reveal = f.step === "reveal";
      fire = {
        seq: f.seq,
        step: f.step,
        question: this.runeQuestion(f),
        myChoice: mine && mine.option >= 0 ? mine.option : null,
        myText: mine?.text ?? null,
        result: reveal ? { correct: f.correct, answers: f.correct.map((i) => f.options[i]!), wasCorrect: !!mine?.correct, right: f.right, needed: f.needed, held: f.held } : null,
      };
    }
    let result: PlayerDragonView["result"] = null;
    if (this.phase === "podium") {
      const mine = this.rankedTeams().find((t) => t.index === p.team)!;
      const a = this.awards();
      const won = (x: { nicknames: string[] } | null) => !!x?.nicknames.includes(p.nickname);
      result = {
        teamRank: mine.rank,
        teamCount: this.teams.length,
        teamGold: mine.gold,
        won: mine.rank === 1,
        slain: this.slain,
        slainMs: this.slainMs,
        awards: [
          ...(won(a.dragonSlayer) ? ["Dragon slayer"] : []),
          ...(won(a.runeMaster) ? ["Rune master"] : []),
          ...(won(a.masterThief) ? ["Master thief"] : []),
          ...(won(a.mostCorrect) ? ["Most correct answers"] : []),
        ],
      };
    }
    const scramble = this.phase === "scramble";
    return {
      kind: "dragon",
      phase: this.phase,
      title: this.title,
      remainingMs: this.clockMs(),
      phaseRemainingMs: this.phase === "battle" || scramble ? 0 : this.remaining(this.phaseEndsAt),
      phaseDurationMs: this.phaseDurationMs,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, hits: p.hits, runeRight: p.runeRight, charm: p.charm },
      healthPct: this.maxHealth > 0 ? Math.ceil((this.health / this.maxHealth) * 100) : 0,
      stage: dragonStage(this.health, this.maxHealth),
      slain: this.slain,
      escaped: this.escaped,
      team: act2 ? teamInfo(p.team) : null,
      teamGold: act2 ? (this.teams[p.team]?.gold ?? 0) : null,
      state,
      question: answering ? this.stream.questionView(p) : null,
      feedback: answering ? this.stream.feedbackView(p) : null,
      fire,
      chest: scramble && state === "chest" ? { seq: p.chestSeq, remainingMs: Math.max(0, p.chestEndsAt - now) } : null,
      grab:
        scramble && state === "grab" && p.grab
          ? {
              seq: p.grab.seq,
              share: DRAGON_GRAB_SHARE[p.grab.kind] ?? 0,
              remainingMs: Math.max(0, p.grab.endsAt - now),
              teams: this.teams
                .filter((t) => t.index !== p.team)
                .map((t) => ({ index: t.index, name: t.name, color: t.color, gold: t.gold, protectedMs: this.remaining(t.protectedUntil) })),
            }
          : null,
      loot: scramble && state === "loot" && p.loot ? { ...p.loot, remainingMs: Math.max(0, p.lootEndsAt - now) } : null,
      result,
    };
  }
}

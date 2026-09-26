import {
  CORRECT_PER_BOOST,
  type HostSubState,
  type PlayerSubView,
  type SubAward,
  type SubAwards,
  type SubPhase,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import { ALL_SYMBOLS, SEA_COLORS, SEA_SHAPES, parseSymbol, symbolId } from "../../shared/sea-symbols.ts";
import { GameError, realClock, shuffle, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { FEEDBACK_MS, QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

// ---------- tuning (all in one place) ----------
export const COUNTDOWN_MS = 3000;
export const ESCAPED_MS = 3500;
export const CAUGHT_MS = 4000;
/** Distance to the fish, in seconds of fish travel. */
export const GAP_START = 30;
export const GAP_MAX = 45;
/** The fish closes 1 gap-second per second on level 1, +25% per level. */
export const SPEED_STEP = 0.25;
/** A full squad's boosts are worth this many gap-seconds per player-boost-cycle; divided by players. */
export const BOOST_POWER = 35;
/** Boosts to clear a level = BOOSTS_BASE + players. */
export const BOOSTS_BASE = 3;
/** The boost can't fire sooner than this after it became available (the phone needs ~2 s of holding). */
export const BOOST_MIN_HOLD_MS = 1500;
export const DIVE_SYMBOLS = 5;
export const DIVE_ADVANCE_FRACTION = 0.7;
export const DIVE_SYMBOL_TIMEOUT_MS = 20_000;
export const DIVE_MAX_MS = 100_000;
export const DIVE_WRONG_LOCK_MS = 1000;
export const DIVE_METERS_PER_HIT = 2;
export const LEVEL_METERS = 100;
export const GRID_SIZE = 6;
export const PLAYERS_PER_INSTRUCTOR = 6;
export const MAX_INSTRUCTORS = 4;

export const speedFor = (level: number) => 1 + SPEED_STEP * (level - 1);

export interface SubPlayer extends BasePlayer, StreamPlayer {
  state: "question" | "boost" | "waiting";
  towardBoost: number;
  boostReadyAt: number;
  boosts: number;
  diveHits: number;
  instructorRounds: number;
  /** Diving-mode grid and wrong-tap lockout. */
  grid: string[];
  lockedUntil: number;
}

interface Instructor {
  playerId: string;
  symbols: string[];
  index: number;
  /** Players describing to (the instructor themselves when playing solo). */
  group: string[];
  found: Set<string>;
  solo: boolean;
  timer: unknown;
}

export interface SubOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: SubGame) => void;
}

/** Submarine Squad: the whole class boosts a submarine away from an anglerfish, then dives deeper. */
export class SubGame {
  readonly kind = "sub";
  readonly quizId: string;
  readonly title: string;
  readonly questionCount: number;
  readonly roster = new Roster<SubPlayer>();
  readonly startedAt = new Date();
  phase: SubPhase = "countdown";
  level = 1;
  levelsCleared = 0;
  diveMeters = 0;
  boosts = 0;
  required = BOOSTS_BASE + 1;
  lastBoost: { seq: number; nickname: string; avatar: AvatarChoice } | null = null;
  instructors: Instructor[] = [];

  private gapValue = GAP_START;
  private gapAt = 0;
  private boostPower = BOOST_POWER;
  private boostSeq = 0;
  private phaseEndsAt = 0;
  private timer: unknown = null;
  private catchTimer: unknown = null;
  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: SubGame) => void;

  constructor(quiz: Quiz, opts: SubOptions & { shuffleAnswers?: boolean } = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questionCount = quiz.questions.length;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, !!opts.shuffleAnswers, this.rng, this.clock);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  static fromLobby(lobby: Game, opts: SubOptions = {}): SubGame {
    const game = new SubGame(lobby.quiz, { ...opts, shuffleAnswers: lobby.shuffle.answers });
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, SubPlayer> {
    return this.roster.players;
  }

  get depth(): number {
    return this.levelsCleared * LEVEL_METERS + this.diveMeters;
  }

  get speed(): number {
    return speedFor(this.level);
  }

  private newPlayer(base: BasePlayer): SubPlayer {
    return { ...base, ...newStreamPlayer(), state: "question", towardBoost: 0, boostReadyAt: 0, boosts: 0, diveHits: 0, instructorRounds: 0, grid: [], lockedUntil: 0 };
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.phase = "countdown";
    this.setPhaseTimer(COUNTDOWN_MS, () => this.startChase());
    this.onChange();
  }

  end(): void {
    this.finish();
  }

  dispose(): void {
    this.clearTimers();
  }

  private setPhaseTimer(ms: number, fn: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    if (this.catchTimer !== null) this.clock.clearTimeout(this.catchTimer);
    for (const i of this.instructors) if (i.timer !== null) this.clock.clearTimeout(i.timer);
    this.timer = this.catchTimer = null;
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.clearTimers();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  private connectedCount(): number {
    return Math.max(1, [...this.players.values()].filter((p) => p.connected).length);
  }

  // ---------- chase ----------

  /** Current distance to the fish in gap-seconds. */
  gap(now = this.clock.now()): number {
    if (this.phase !== "chase") return this.gapValue;
    return Math.max(0, this.gapValue - (this.speed * (now - this.gapAt)) / 1000);
  }

  private startChase(): void {
    const players = this.connectedCount();
    this.phase = "chase";
    this.phaseEndsAt = 0;
    this.instructors = [];
    this.boosts = 0;
    this.required = BOOSTS_BASE + players;
    this.boostPower = BOOST_POWER / players;
    this.gapValue = GAP_START;
    this.gapAt = this.clock.now();
    for (const p of this.players.values()) {
      if (p.state === "waiting") p.state = "question";
      if (!p.current) this.stream.deal(p);
    }
    this.scheduleCatch();
    this.onChange();
  }

  private scheduleCatch(): void {
    if (this.catchTimer !== null) this.clock.clearTimeout(this.catchTimer);
    const ms = Math.ceil((this.gap() / this.speed) * 1000);
    this.catchTimer = this.clock.setTimeout(() => {
      this.catchTimer = null;
      if (this.phase === "chase") this.caught();
    }, ms);
  }

  private caught(): void {
    this.clearTimers();
    this.phase = "caught";
    this.gapValue = 0;
    this.setPhaseTimer(CAUGHT_MS, () => this.finish());
    this.onChange();
  }

  answer(playerId: string, seq: number, option: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "chase" || p.state !== "question") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct && ++p.towardBoost >= CORRECT_PER_BOOST) {
      p.towardBoost = 0;
      p.state = "boost";
      p.boostReadyAt = this.clock.now() + FEEDBACK_MS;
    }
    this.onActivity(p.id);
    return true;
  }

  /** The phone's charge bar filled up: push the sub away from the fish. */
  boost(playerId: string): boolean {
    const p = this.players.get(playerId);
    const now = this.clock.now();
    if (!p || this.phase !== "chase" || p.state !== "boost" || now - p.boostReadyAt < BOOST_MIN_HOLD_MS) return false;
    this.gapValue = Math.min(GAP_MAX, this.gap(now) + this.boostPower);
    this.gapAt = now;
    this.boosts++;
    p.boosts++;
    p.state = "question";
    this.lastBoost = { seq: ++this.boostSeq, nickname: p.nickname, avatar: p.avatar };
    if (this.boosts >= this.required) {
      this.escaped();
    } else {
      this.scheduleCatch();
      this.onActivity(p.id);
    }
    return true;
  }

  private escaped(): void {
    if (this.catchTimer !== null) this.clock.clearTimeout(this.catchTimer);
    this.catchTimer = null;
    this.gapValue = this.gap();
    this.phase = "escaped";
    this.levelsCleared++;
    this.setPhaseTimer(ESCAPED_MS, () => this.startDive());
    this.onChange();
  }

  // ---------- dive ----------

  private startDive(): void {
    const divers = shuffle(
      [...this.players.values()].filter((p) => p.connected),
      this.rng,
    );
    if (divers.length === 0) return this.nextLevel();
    const count = divers.length === 1 ? 1 : Math.min(MAX_INSTRUCTORS, Math.max(1, Math.ceil(divers.length / PLAYERS_PER_INSTRUCTOR)), divers.length - 1);
    const leads = divers.slice(0, count);
    const rest = divers.slice(count);
    this.instructors = leads.map((lead, i) => {
      lead.instructorRounds++;
      const solo = divers.length === 1;
      return {
        playerId: lead.id,
        symbols: shuffle(ALL_SYMBOLS, this.rng).slice(0, DIVE_SYMBOLS),
        index: 0,
        group: solo ? [lead.id] : rest.filter((_, k) => k % count === i).map((p) => p.id),
        found: new Set<string>(),
        solo,
        timer: null,
      };
    });
    for (const p of this.players.values()) p.lockedUntil = 0;
    this.phase = "dive";
    this.setPhaseTimer(DIVE_MAX_MS, () => this.nextLevel());
    for (const ins of this.instructors) this.beginSymbol(ins);
    this.onChange();
  }

  private beginSymbol(ins: Instructor): void {
    ins.found.clear();
    const target = ins.symbols[ins.index]!;
    for (const id of ins.group) {
      const p = this.players.get(id);
      if (p) p.grid = this.makeGrid(target);
    }
    if (ins.timer !== null) this.clock.clearTimeout(ins.timer);
    ins.timer = this.clock.setTimeout(() => {
      ins.timer = null;
      this.advance(ins);
    }, DIVE_SYMBOL_TIMEOUT_MS);
  }

  /** The target plus look-alikes (same shape or same color), so players have to listen. */
  makeGrid(target: string): string[] {
    const t = parseSymbol(target)!;
    const sameShape = SEA_COLORS.filter((c) => c.id !== t.color).map((c) => symbolId(c.id, t.shape));
    const sameColor = SEA_SHAPES.filter((s) => s !== t.shape).map((s) => symbolId(t.color, s));
    const picks = [...shuffle(sameShape, this.rng).slice(0, 2), ...shuffle(sameColor, this.rng).slice(0, 2)];
    const others = shuffle(ALL_SYMBOLS.filter((s) => s !== target && !picks.includes(s)), this.rng);
    return shuffle([target, ...picks, ...others].slice(0, GRID_SIZE), this.rng);
  }

  private instructorOf(playerId: string): Instructor | null {
    return this.instructors.find((i) => i.group.includes(playerId)) ?? null;
  }

  /** A diver taps a symbol. Returns true if it was the one being described. */
  tap(playerId: string, symbol: string): boolean | null {
    const p = this.players.get(playerId);
    const ins = this.instructorOf(playerId);
    const now = this.clock.now();
    if (!p || !ins || this.phase !== "dive" || ins.index >= DIVE_SYMBOLS) return null;
    if (ins.found.has(playerId) || now < p.lockedUntil || !p.grid.includes(symbol)) return null;
    if (symbol !== ins.symbols[ins.index]) {
      p.lockedUntil = now + DIVE_WRONG_LOCK_MS;
      this.onActivity(p.id);
      return false;
    }
    ins.found.add(playerId);
    p.diveHits++;
    this.diveMeters += DIVE_METERS_PER_HIT;
    if (ins.found.size >= Math.ceil(ins.group.length * DIVE_ADVANCE_FRACTION)) this.advance(ins);
    else this.onActivity(p.id);
    return true;
  }

  private advance(ins: Instructor): void {
    if (this.phase !== "dive" || ins.index >= DIVE_SYMBOLS) return;
    if (ins.timer !== null) this.clock.clearTimeout(ins.timer);
    ins.timer = null;
    ins.index++;
    if (ins.index < DIVE_SYMBOLS) this.beginSymbol(ins);
    if (this.instructors.every((i) => i.index >= DIVE_SYMBOLS)) return this.nextLevel();
    this.onChange();
  }

  private nextLevel(): void {
    for (const i of this.instructors) if (i.timer !== null) this.clock.clearTimeout(i.timer);
    this.level++;
    this.startChase();
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SubPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const p = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    // Joining mid-dive: wait for the next level (like Kahoot).
    if (this.phase === "dive") p.state = "waiting";
    else if (this.phase === "chase") this.stream.deal(p);
    this.onChange();
    return p;
  }

  byToken(token: unknown): SubPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
  }

  kick(playerId: string): SubPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    for (const ins of this.instructors) {
      ins.group = ins.group.filter((id) => id !== playerId);
      ins.found.delete(playerId);
      // An instructor who leaves (or loses their whole group) is done.
      if (ins.playerId === playerId || ins.group.length === 0) ins.index = DIVE_SYMBOLS;
    }
    if (this.phase === "dive" && this.instructors.every((i) => i.index >= DIVE_SYMBOLS)) this.nextLevel();
    else this.onChange();
    return p;
  }

  // ---------- results + views ----------

  awards(): SubAwards {
    const players = [...this.players.values()];
    const best = (value: (p: SubPlayer) => number): SubAward | null => {
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { topBooster: best((p) => p.boosts), sharpestEyes: best((p) => p.diveHits), mostCorrect: best((p) => p.correct) };
  }

  private phaseRemainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  hostView(): HostSubState {
    return {
      kind: "sub",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questionCount },
      level: this.level,
      depth: this.depth,
      phaseRemainingMs: this.phaseRemainingMs(),
      gap: this.gap(),
      speed: this.speed,
      maxGap: GAP_MAX,
      boosts: this.boosts,
      required: this.required,
      lastBoost: this.lastBoost,
      dive:
        this.phase === "dive"
          ? {
              instructors: this.instructors.map((i) => ({
                nickname: this.players.get(i.playerId)?.nickname ?? "?",
                index: Math.min(i.index, DIVE_SYMBOLS - 1),
                total: DIVE_SYMBOLS,
                found: i.found.size,
                groupSize: i.group.length,
                done: i.index >= DIVE_SYMBOLS,
              })),
            }
          : null,
      players: [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected, state: p.state })),
      playerCount: this.players.size,
      awards: this.phase === "podium" ? this.awards() : null,
      hasResults: this.phase === "podium",
    };
  }

  private diveView(p: SubPlayer): PlayerSubView["dive"] {
    if (this.phase !== "dive") return null;
    const lead = this.instructors.find((i) => i.playerId === p.id && !i.solo);
    if (lead) {
      return { role: "instructor", symbol: lead.symbols[Math.min(lead.index, DIVE_SYMBOLS - 1)]!, index: lead.index, total: DIVE_SYMBOLS, found: lead.found.size, groupSize: lead.group.length };
    }
    const ins = this.instructorOf(p.id);
    if (!ins) return { role: "waiting" };
    return {
      role: "diver",
      grid: p.grid,
      index: ins.index,
      total: DIVE_SYMBOLS,
      lockedMs: Math.max(0, p.lockedUntil - this.clock.now()),
      done: ins.index >= DIVE_SYMBOLS || ins.found.has(p.id),
      hint: ins.solo ? (ins.symbols[ins.index] ?? null) : null,
    };
  }

  playerView(playerId: string): PlayerSubView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    let result: PlayerSubView["result"] = null;
    if (this.phase === "podium") {
      const a = this.awards();
      const won = (x: SubAward | null, label: string) => (x?.nicknames.includes(p.nickname) ? [label] : []);
      result = {
        depth: this.depth,
        level: this.level,
        awards: [...won(a.topBooster, "Top booster"), ...won(a.sharpestEyes, "Sharpest eyes"), ...won(a.mostCorrect, "Most correct answers")],
      };
    }
    return {
      kind: "sub",
      phase: this.phase,
      title: this.title,
      level: this.level,
      depth: this.depth,
      phaseRemainingMs: this.phaseRemainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, boosts: p.boosts, diveHits: p.diveHits },
      state: p.state,
      towardBoost: p.towardBoost,
      question: this.phase === "chase" && p.state === "question" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      dive: this.diveView(p),
      result,
    };
  }
}

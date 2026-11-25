import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { CHRISTMAS_GLYPHS, glyphId, parseGlyph, variantsOf } from "../../shared/glyphs.ts";
import type { HostSubState, PlayerSubView, SubAwardKey, SubPhase } from "../../shared/modes/submarine.ts";
import { CORRECT_PER_BOOST, submarineShared } from "../../shared/modes/submarine.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, shuffle } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { most } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

export const COUNTDOWN_MS = 3000;
const SUB_AWARD_VALUES: Record<SubAwardKey, (p: SubPlayer) => number> = {
  topBooster: (p) => p.boosts,
  sharpestEyes: (p) => p.diveHits,
  mostCorrect: (p) => p.correct,
};
export const ESCAPED_MS = 3500;
export const CAUGHT_MS = 4000;
/** Distance to the fish, in seconds of fish travel. */
export const GAP_START = 30;
export const GAP_MAX = 45;
/** The fish closes 1 gap-second per second on level 1, +25% per level. */
const SPEED_STEP = 0.25;
/** A full squad's boosts are worth this many gap-seconds per player-boost-cycle; divided by players. */
export const BOOST_POWER = 35;
/** Boosts to clear a level = BOOSTS_BASE + players. */
export const BOOSTS_BASE = 3;
/** The boost can't fire sooner than this after it became available (the phone needs ~2 s of holding). */
export const BOOST_MIN_HOLD_MS = 1500;
export const DIVE_SYMBOLS = 5;
const DIVE_ADVANCE_FRACTION = 0.7;
/** Time to find each symbol before the instructor moves on to the next one. */
export const DIVE_SYMBOL_TIMEOUT_MS = 8000;
const DIVE_MAX_MS = 100_000;
export const DIVE_WRONG_LOCK_MS = 1000;
export const DIVE_METERS_PER_HIT = 2;
export const LEVEL_METERS = 100;
const GRID_SIZE = 6;
/** Grid entries from the same Christmas picture family as the target. */
export const LOOKALIKES = 3;
const PLAYERS_PER_INSTRUCTOR = 6;
const MAX_INSTRUCTORS = 4;

export const speedFor = (level: number) => 1 + SPEED_STEP * (level - 1);

export interface SubPlayer extends BasePlayer, AnswerTotals {
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
  endsAt: number;
}

interface SubOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: SubGame) => void;
}

/** Sled Squad: the whole class boosts a submarine away from an anglerfish, then dives deeper. */
export class SubGame {
  readonly runningMode = "submarine" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questionCount: number;
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
  private readonly session: StreamedSession<SubPlayer, SubPhase, Podium<SubPlayer, SubPlayer, SubAwardKey>>;

  constructor(quiz: Quiz, opts: SubOptions & { shuffleAnswers?: boolean; protect?: boolean } = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questionCount = quiz.questions.length;
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: !!opts.shuffleAnswers,
      protect: opts.protect,
      clock: opts.clock,
      rng: opts.rng,
      canAnswer: (p) => this.phase === "chase" && p.state === "question",
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(submarineShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
  }

  static fromLobby(lobby: LobbyFacts<"submarine">, opts: SubOptions = {}): SubGame {
    const game = new SubGame(lobby.quiz, { ...opts, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect });
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base));
    return game;
  }

  private get clock(): Clock {
    return this.session.clock;
  }

  private get rng(): () => number {
    return this.session.rng;
  }

  private get stream() {
    return this.session.stream;
  }

  private get phases() {
    return this.session.phases;
  }

  /** The lobby's choices, handed back when the game closes ("Play again"). */
  get choices(): LobbyChoices {
    return this.session.choices;
  }

  get players(): Map<string, SubPlayer> {
    return this.session.players;
  }

  get depth(): number {
    return this.levelsCleared * LEVEL_METERS + this.diveMeters;
  }

  get speed(): number {
    return speedFor(this.level);
  }

  private newPlayer(base: BasePlayer): Omit<SubPlayer, keyof AnswerTotals> {
    return {
      ...base,
      state: "question",
      towardBoost: 0,
      boostReadyAt: 0,
      boosts: 0,
      diveHits: 0,
      instructorRounds: 0,
      grid: [],
      lockedUntil: 0,
    };
  }

  start(): void {
    this.session.start(COUNTDOWN_MS, () => this.startChase());
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  /** An instructor's symbol timeout has its own slot on the phase timer. */
  private symbolSlot(ins: Instructor): string {
    return `symbol:${ins.playerId}`;
  }

  private connectedCount(): number {
    return Math.max(1, [...this.players.values()].filter((p) => p.connected).length);
  }

  get phase(): SubPhase {
    return this.session.phase;
  }

  /** Current distance to the fish in gap-seconds. */
  gap(now = this.clock.now()): number {
    if (this.phase !== "chase") return this.gapValue;
    return Math.max(0, this.gapValue - (this.speed * (now - this.gapAt)) / 1000);
  }

  /** After a dive the fish starts as far back as a boost can push it. */
  private startChase(gap = GAP_START): void {
    const players = this.connectedCount();
    this.phases.enter("chase");
    this.instructors = [];
    this.boosts = 0;
    this.required = BOOSTS_BASE + players;
    this.boostPower = BOOST_POWER / players;
    this.gapValue = gap;
    this.gapAt = this.clock.now();
    for (const p of this.players.values()) {
      if (p.state === "waiting") p.state = "question";
      this.stream.open(p);
    }
    this.scheduleCatch();
    this.session.changed();
  }

  private scheduleCatch(): void {
    const ms = Math.ceil((this.gap() / this.speed) * 1000);
    this.phases.after("catch", ms, () => {
      if (this.phase === "chase") this.caught();
    });
  }

  private caught(): void {
    this.phases.dispose();
    this.gapValue = 0;
    this.phases.set("caught", CAUGHT_MS, () => this.end());
    this.session.changed();
  }

  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, option);
    if (!answered) return false;
    const { player: p, correct } = answered;
    if (correct && ++p.towardBoost >= CORRECT_PER_BOOST) {
      p.towardBoost = 0;
      p.state = "boost";
      p.boostReadyAt = this.stream.feedbackEndsAt(p);
    }
    this.session.activity(p.id);
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
      this.session.activity(p.id);
    }
    return true;
  }

  private escaped(): void {
    this.phases.cancel("catch");
    this.gapValue = this.gap();
    this.levelsCleared++;
    this.phases.set("escaped", ESCAPED_MS, () => this.startDive());
    this.session.changed();
  }

  private startDive(): void {
    const divers = shuffle(
      [...this.players.values()].filter((p) => p.connected),
      this.rng,
    );
    if (divers.length === 0) return this.nextLevel();
    const count = divers.length === 1 ? 1 : Math.min(MAX_INSTRUCTORS, Math.max(1, Math.ceil(divers.length / PLAYERS_PER_INSTRUCTOR)), divers.length - 1);
    const leads = divers.slice(0, count);
    // Every symbol in this dive is different, across all instructors.
    const symbols = shuffle(CHRISTMAS_GLYPHS.map(glyphId), this.rng);
    const freshSymbols = () => symbols.splice(0, DIVE_SYMBOLS);
    const rest = divers.slice(count);
    this.instructors = leads.map((lead, i) => {
      lead.instructorRounds++;
      const solo = divers.length === 1;
      return {
        playerId: lead.id,
        symbols: freshSymbols(),
        index: 0,
        group: solo ? [lead.id] : rest.filter((_, k) => k % count === i).map((p) => p.id),
        found: new Set<string>(),
        solo,
        endsAt: 0,
      };
    });
    for (const p of this.players.values()) p.lockedUntil = 0;
    this.phases.set("dive", DIVE_MAX_MS, () => this.nextLevel());
    for (const ins of this.instructors) this.beginSymbol(ins);
    this.session.changed();
  }

  private beginSymbol(ins: Instructor): void {
    ins.found.clear();
    const target = ins.symbols[ins.index]!;
    for (const id of ins.group) {
      const p = this.players.get(id);
      if (p) p.grid = this.makeGrid(target);
    }
    ins.endsAt = this.clock.now() + DIVE_SYMBOL_TIMEOUT_MS;
    this.phases.after(this.symbolSlot(ins), DIVE_SYMBOL_TIMEOUT_MS, () => {
      // Nobody left to describe the symbols, or nobody left to find them: skip to the last symbol,
      // so this advance ends the group's dive instead of sitting out every remaining symbol.
      if (!this.players.get(ins.playerId)?.connected || this.liveDivers(ins) === 0) ins.index = DIVE_SYMBOLS - 1;
      this.advance(ins);
    });
  }

  /** Divers in the group whose phones are connected: only they can find the symbol. */
  private liveDivers(ins: Instructor): number {
    return ins.group.filter((id) => this.players.get(id)?.connected).length;
  }

  /** Enough of the group's connected divers have found the symbol to move on. */
  private enoughFound(ins: Instructor): boolean {
    return ins.found.size > 0 && ins.found.size >= Math.ceil(this.liveDivers(ins) * DIVE_ADVANCE_FRACTION);
  }

  /**
   * The target, 3 Christmas look-alikes (same family, different design) and random
   * fillers, so divers have to listen for the details.
   */
  makeGrid(target: string): string[] {
    const t = parseGlyph(target)!;
    const near = shuffle(variantsOf(t).map(glyphId), this.rng).slice(0, LOOKALIKES);
    const grid = [target, ...near];
    // Other families fill the remaining slots, keeping exactly three close matches.
    const fillers = shuffle(CHRISTMAS_GLYPHS.filter((g) => g.family !== t.family).map(glyphId), this.rng);
    grid.push(...fillers.slice(0, GRID_SIZE - grid.length));
    return shuffle(grid, this.rng);
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
      this.session.activity(p.id);
      return false;
    }
    ins.found.add(playerId);
    p.diveHits++;
    this.diveMeters += DIVE_METERS_PER_HIT;
    if (this.enoughFound(ins)) this.advance(ins);
    else this.session.activity(p.id);
    return true;
  }

  private advance(ins: Instructor): void {
    if (this.phase !== "dive" || ins.index >= DIVE_SYMBOLS) return;
    this.phases.cancel(this.symbolSlot(ins));
    ins.index++;
    if (ins.index < DIVE_SYMBOLS) this.beginSymbol(ins);
    if (this.instructors.every((i) => i.index >= DIVE_SYMBOLS)) return this.nextLevel();
    this.session.changed();
  }

  private nextLevel(): void {
    for (const i of this.instructors) this.phases.cancel(this.symbolSlot(i));
    this.level++;
    this.startChase(GAP_MAX);
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SubPlayer {
    // Joining mid-dive: wait for the next level (like Kahoot).
    const diving = this.phase === "dive";
    const p = this.session.join(rawNickname, avatar, (base) => ({ ...this.newPlayer(base), state: diving ? "waiting" : "question" }));
    if (this.phase === "chase") {
      this.stream.open(p);
      this.session.changed();
    }
    return p;
  }

  byToken(token: unknown): SubPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!this.session.roster.setConnected(playerId, connected)) return;
    // A diver whose phone dropped no longer holds the group back.
    const ins = !connected && this.phase === "dive" ? this.instructorOf(playerId) : null;
    if (ins && ins.index < DIVE_SYMBOLS && this.enoughFound(ins)) return this.advance(ins);
    this.session.changed();
  }

  kick(playerId: string): SubPlayer | null {
    const p = this.session.kick(playerId);
    if (!p) return null;
    for (const ins of this.instructors) {
      ins.group = ins.group.filter((id) => id !== playerId);
      ins.found.delete(playerId);
      // An instructor who leaves (or loses their whole group) is done.
      if (ins.playerId === playerId || ins.group.length === 0) ins.index = DIVE_SYMBOLS;
    }
    if (this.phase === "dive" && this.instructors.every((i) => i.index >= DIVE_SYMBOLS)) this.nextLevel();
    return p;
  }

  /** The squad shares one depth, so every player shares one place; the results sheet lists the top boosters first, then the most correct. */
  private buildPodium(): Podium<SubPlayer, SubPlayer, SubAwardKey> {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: [],
      then: [most((p) => p.boosts), most((p) => p.correct)],
      players,
      entryOf: (p) => p,
      awards: { labels: submarineShared.awards, values: SUB_AWARD_VALUES },
    });
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): Podium<SubPlayer, SubPlayer, SubAwardKey> {
    return this.session.podium;
  }

  hostView(): HostSubState {
    return {
      kind: "submarine",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questionCount },
      level: this.level,
      depthMeters: this.depth,
      phaseRemainingMs: this.phases.remainingMs(),
      gapSeconds: this.gap(),
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
      awards: this.phase === "podium" ? this.podium.awards : null,
      errors: this.stream.errorsWhen(this.phase === "podium"),
    };
  }

  private diveView(p: SubPlayer): PlayerSubView["dive"] {
    if (this.phase !== "dive") return null;
    const timer = (i: Instructor) => ({
      symbolRemainingMs: i.index >= DIVE_SYMBOLS ? 0 : Math.max(0, i.endsAt - this.clock.now()),
      symbolDurationMs: DIVE_SYMBOL_TIMEOUT_MS,
    });
    const lead = this.instructors.find((i) => i.playerId === p.id && !i.solo);
    if (lead) {
      return {
        role: "instructor",
        symbol: lead.symbols[Math.min(lead.index, DIVE_SYMBOLS - 1)]!,
        index: lead.index,
        total: DIVE_SYMBOLS,
        found: lead.found.size,
        groupSize: lead.group.length,
        ...timer(lead),
      };
    }
    const ins = this.instructorOf(p.id);
    if (!ins) return { role: "waiting" };
    return {
      role: "diver",
      grid: p.grid,
      index: ins.index,
      total: DIVE_SYMBOLS,
      lockRemainingMs: Math.max(0, p.lockedUntil - this.clock.now()),
      done: ins.index >= DIVE_SYMBOLS || ins.found.has(p.id),
      hint: ins.solo ? (ins.symbols[ins.index] ?? null) : null,
      ...timer(ins),
    };
  }

  playerView(playerId: string): PlayerSubView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    let result: PlayerSubView["result"] = null;
    if (this.phase === "podium") {
      result = { depth: this.depth, level: this.level, awards: this.podium.result(p.id)?.awards ?? [] };
    }
    return {
      kind: "submarine",
      phase: this.phase,
      title: this.title,
      level: this.level,
      depth: this.depth,
      phaseRemainingMs: this.phases.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, boosts: p.boosts, diveHits: p.diveHits },
      state: p.state,
      towardBoost: p.towardBoost,
      ...this.stream.fragment(p),
      dive: this.diveView(p),
      result,
    };
  }
}

/** Sled Squad: one row per player; the squad's final depth is in every row. */
function subColumns(game: SubGame): Column<SubPlayer>[] {
  return [
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Correct", value: (p) => p.correct },
    { header: "Wrong", value: (p) => p.wrong },
    { header: "Boosts", value: (p) => p.boosts },
    { header: "Dive taps (correct)", value: (p) => p.diveHits },
    { header: "Instructor rounds", value: (p) => p.instructorRounds },
    { header: "Squad depth (m)", value: () => game.depth },
    { header: "Level reached", value: () => game.level },
  ];
}

export function buildSubResults(game: SubGame): ResultsSheet {
  return sheet(
    subColumns(game),
    game.podium.rows.map((r) => r.player),
  );
}

export const subMode: ModeEntry<"submarine"> = {
  ...submarineShared,
  defaultSettings: {},
  readSettings: () => ({}),
  start(lobby, ctx) {
    const game = SubGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s)` };
  },
  pacing: null,
  teams: () => null,
  results: buildSubResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "sub.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "sub.boost":
        return game.boost(playerId) ? undefined : "resend";
      case "sub.tap":
        return game.tap(playerId, String(msg.symbol)) === null ? "resend" : undefined;
      default:
        return unhandled(msg);
    }
  },
};

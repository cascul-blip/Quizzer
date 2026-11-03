import type { AnswerValue } from "../../shared/answer-match.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import {
  SLEIGH_COUNTDOWN_MS,
  SLEIGH_DEFAULT_ROUNDS,
  SLEIGH_DRIVE_CAP_MS,
  SLEIGH_DRIVE_HOLD_MS,
  SLEIGH_INTRO_MS,
  SLEIGH_MS_PER_POINT,
  SLEIGH_QUIZ_MS,
  SLEIGH_TICK_MS,
  gridSlot,
  sleighColor,
  lapsOf,
  launch,
  stepCar,
  type Car,
} from "../../shared/sleigh-rules.ts";
import type { HostSleighState, SleighAwards, SleighPhase, SleighStanding, PlayerSleighView } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export interface SleighPlayer extends BasePlayer, StreamPlayer {
  car: Car;
  color: string;
  /** Steering wheel, −1 (full left) … 1 (full right). */
  wheel: number;
  /** Correct answers this round: driving time for the next drive. */
  points: number;
  /** Driving time left this drive (as of the last tick), ms. */
  fuelMs: number;
  /** Driving time this drive started with, ms. */
  fuelStartMs: number;
  /** Server time the driving time runs out (0 when the car has none). */
  fuelEndsAt: number;
  /** Still moving this drive (has fuel or is coasting to a stop). */
  moving: boolean;
  /** Wall hits over the whole game. */
  hits: number;
  /** Time actually spent driving with fuel, over the whole game, ms. */
  drivenMs: number;
}

interface SleighOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  /** Every drive tick: only for pushing the host's view (cars move). */
  onTick?: () => void;
  onFinish?: (game: SleighGame) => void;
}

interface SleighGameSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
  rounds: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Santa's Sleigh Run: answer questions for driving time, then steer round the oval. Most distance after the last round wins. */
export class SleighGame {
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly rounds: number;
  readonly roster = new Roster<SleighPlayer>();
  phase: SleighPhase = "countdown";
  round = 0;
  phaseEndsAt = 0;
  phaseDurationMs = SLEIGH_COUNTDOWN_MS;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private tickTimer: unknown = null;
  private lastTickAt = 0;
  /** Cars placed on the grid so far (also picks the paint). */
  private gridCount = 0;
  /** Grid size the lobby's players were placed for. */
  private gridTotal = 0;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onTick: () => void;
  private readonly onFinish: (game: SleighGame) => void;

  constructor(quiz: Quiz, settings: SleighGameSettings, opts: SleighOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.rounds = Number.isFinite(settings.rounds) && settings.rounds >= 1 ? Math.floor(settings.rounds) : SLEIGH_DEFAULT_ROUNDS;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onTick = opts.onTick ?? (() => {});
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), lined up on the grid in join order. */
  static fromLobby(lobby: Game, opts: SleighOptions = {}): SleighGame {
    const game = new SleighGame(lobby.quiz, { shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect, rounds: lobby.sleigh.rounds }, opts);
    game.gridTotal = lobby.players.size;
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, SleighPlayer> {
    return this.roster.players;
  }

  private newPlayer(base: BasePlayer): SleighPlayer {
    const i = this.gridCount++;
    return {
      ...base,
      ...newStreamPlayer(),
      car: gridSlot(i, Math.max(this.gridTotal, i + 1)),
      color: sleighColor(i),
      wheel: 0,
      points: 0,
      fuelMs: 0,
      fuelStartMs: 0,
      fuelEndsAt: 0,
      moving: false,
      hits: 0,
      drivenMs: 0,
    };
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.setPhase("countdown", SLEIGH_COUNTDOWN_MS, () => this.beginRound());
    this.onChange();
  }

  private setPhase(phase: SleighPhase, ms: number, then: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  private beginRound(): void {
    this.round++;
    for (const p of this.players.values()) {
      p.points = 0;
      p.fuelStartMs = 0;
      if (!p.current) this.stream.deal(p);
    }
    this.setPhase("quiz", SLEIGH_QUIZ_MS, () => this.beginIntro());
    this.onChange();
  }

  private beginIntro(): void {
    this.setPhase("intro", SLEIGH_INTRO_MS, () => this.beginDrive());
    this.onChange();
  }

  /** Points become driving time (unspent time is lost), cars with time launch, and the tick loop starts. */
  private beginDrive(): void {
    const now = this.clock.now();
    for (const p of this.players.values()) {
      const fuel = p.points * SLEIGH_MS_PER_POINT;
      p.points = 0;
      p.fuelMs = fuel;
      p.fuelStartMs = fuel;
      p.fuelEndsAt = fuel > 0 ? now + fuel : 0;
      p.car = fuel > 0 ? launch(p.car) : { ...p.car, speed: 0, scraping: false };
      p.moving = fuel > 0;
    }
    this.setPhase("drive", SLEIGH_DRIVE_CAP_MS, () => this.endDrive());
    this.lastTickAt = now;
    if (![...this.players.values()].some((p) => p.moving)) return this.hold();
    this.scheduleTick();
    this.onChange();
  }

  private scheduleTick(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, SLEIGH_TICK_MS);
  }

  private tick(): void {
    if (this.phase !== "drive") return;
    const now = this.clock.now();
    const dt = Math.max(0, now - this.lastTickAt);
    const from = this.lastTickAt;
    this.lastTickAt = now;
    let stopped = false;
    let anyMoving = false;
    for (const p of this.players.values()) {
      if (!p.moving) continue;
      const wheel = p.connected ? p.wheel : 0;
      const fuelLeft = Math.max(0, p.fuelEndsAt - from);
      let car = p.car;
      let hits = 0;
      const step = (fuel: boolean, ms: number) => {
        if (ms <= 0) return;
        const r = stepCar(car, wheel, fuel, ms);
        car = r.car;
        if (r.hit) hits++;
      };
      const driven = Math.min(fuelLeft, dt);
      step(true, driven);
      step(false, dt - driven);
      p.car = car;
      p.hits += hits;
      p.drivenMs += driven;
      p.fuelMs = Math.max(0, p.fuelEndsAt - now);
      p.moving = p.fuelMs > 0 || car.speed > 0;
      if (p.moving) anyMoving = true;
      else stopped = true;
    }
    this.onTick();
    if (!anyMoving) return this.hold();
    this.scheduleTick();
    if (stopped) this.onChange();
  }

  /** Every car has stopped: hold the drive a moment before moving on. */
  private hold(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.setPhase("drive", SLEIGH_DRIVE_HOLD_MS, () => this.endDrive());
    this.onChange();
  }

  private endDrive(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.parkCars();
    if (this.round >= this.rounds) this.finish();
    else this.beginRound();
  }

  /** Cars stop where they are (positions carry over to the next drive). */
  private parkCars(): void {
    for (const p of this.players.values()) {
      p.car = { ...p.car, speed: 0, scraping: false };
      p.fuelMs = 0;
      p.fuelEndsAt = 0;
      p.moving = false;
    }
  }

  /** Host ends the game now; standings are as they are. */
  end(): void {
    this.finish();
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.clearTimers();
    this.parkCars();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.timer = null;
    this.tickTimer = null;
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SleighPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.round > 0) this.stream.deal(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): SleighPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    if (!connected) p.wheel = 0;
    this.onChange();
  }

  kick(playerId: string): SleighPlayer | null {
    const p = this.roster.remove(playerId);
    if (p) this.onChange();
    return p;
  }

  // ---------- actions ----------

  /** Answer during the quiz phase; a correct answer earns a point (a second of driving). */
  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || this.phase !== "quiz") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct) p.points++;
    this.onActivity(p.id);
    return true;
  }

  /** Turn the wheel (drive phase only). Stored for the next tick; nothing is broadcast. */
  steer(playerId: string, wheel: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "drive" || typeof wheel !== "number" || !Number.isFinite(wheel)) return false;
    p.wheel = Math.max(-1, Math.min(1, wheel));
    return true;
  }

  // ---------- results ----------

  /** Most distance first; equal distance (to 0.1) shares a rank, ordered by correct answers. */
  standings(): SleighStanding[] {
    const key = (p: SleighPlayer) => r1(p.car.distance);
    const sorted = [...this.players.values()].sort((a, b) => key(b) - key(a) || b.correct - a.correct);
    let rank = 0;
    let prev: number | null = null;
    return sorted.map((p, i) => {
      if (key(p) !== prev) {
        rank = i + 1;
        prev = key(p);
      }
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        color: p.color,
        rank,
        laps: lapsOf(p.car.distance),
        distance: r1(p.car.distance),
        correct: p.correct,
        hits: p.hits,
      };
    });
  }

  awards(): SleighAwards {
    const players = [...this.players.values()];
    const topCorrect = Math.max(0, ...players.map((p) => p.correct));
    const drivers = players.filter((p) => p.drivenMs > 0);
    const fewest = drivers.length ? Math.min(...drivers.map((p) => p.hits)) : 0;
    return {
      mostCorrect: topCorrect > 0 ? { value: topCorrect, nicknames: players.filter((p) => p.correct === topCorrect).map((p) => p.nickname) } : null,
      smoothest: drivers.length ? { value: fewest, nicknames: drivers.filter((p) => p.hits === fewest).map((p) => p.nickname) } : null,
    };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private fuelLeft(p: SleighPlayer): number {
    return this.phase === "drive" ? Math.max(0, p.fuelEndsAt - this.clock.now()) : 0;
  }

  private ranks(): Map<string, number> {
    return new Map(this.standings().map((s) => [s.id, s.rank]));
  }

  hostView(): HostSleighState {
    const podium = this.phase === "podium";
    const ranks = this.ranks();
    return {
      kind: "sleigh",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      round: this.round,
      rounds: this.rounds,
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      tick: this.clock.now(),
      cars: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.connected,
        color: p.color,
        x: r1(p.car.x),
        y: r1(p.car.y),
        heading: r3(p.car.heading),
        wheel: r3(p.connected ? p.wheel : 0),
        speed: r3(p.car.speed),
        points: p.points,
        fuelMs: this.fuelLeft(p),
        fuelStartMs: p.fuelStartMs,
        moving: this.phase === "drive" && p.moving,
        laps: lapsOf(p.car.distance),
        distance: r1(p.car.distance),
        hits: p.hits,
        rank: ranks.get(p.id) ?? 0,
      })),
      playerCount: this.players.size,
      standings: podium ? this.standings() : null,
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerSleighView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const standings = this.standings();
    const mine = standings.find((s) => s.id === p.id)!;
    let result: PlayerSleighView["result"] = null;
    if (this.phase === "podium") {
      const aw = this.awards();
      result = {
        rank: mine.rank,
        playerCount: standings.length,
        laps: mine.laps,
        distance: mine.distance,
        awards: [
          ...(aw.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
          ...(aw.smoothest?.nicknames.includes(p.nickname) ? ["Smoothest driver"] : []),
        ],
      };
    }
    return {
      kind: "sleigh",
      phase: this.phase,
      title: this.title,
      round: this.round,
      rounds: this.rounds,
      phaseRemainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, color: p.color, points: p.points, correct: p.correct, laps: mine.laps, rank: mine.rank },
      playerCount: this.players.size,
      question: this.phase === "quiz" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      fuelMs: this.fuelLeft(p),
      fuelStartMs: this.phase === "drive" ? p.fuelStartMs : 0,
      result,
    };
  }
}

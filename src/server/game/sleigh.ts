import type { AnswerValue } from "../../shared/answer-match.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import {
  SLEIGH_COUNTDOWN_MS,
  SLEIGH_DEFAULT_HOUSES,
  SLEIGH_DRIVE_CAP_MS,
  SLEIGH_DRIVE_HOLD_MS,
  SLEIGH_FINALE_MS,
  SLEIGH_INTRO_MS,
  SLEIGH_MAX_HOUSES,
  SLEIGH_MIN_HOUSES,
  SLEIGH_MS_PER_POINT,
  SLEIGH_QUIZ_MS,
  SLEIGH_TICK_MS,
  hitsHouse,
  houseDistance,
  launch,
  launchSlot,
  pickHouses,
  sleighColor,
  stepSleigh,
  type Sleigh,
} from "../../shared/sleigh-rules.ts";
import type { HostSleighState, PlayerSleighView, SleighAwards, SleighDelivery, SleighHouse, SleighPhase, SleighStanding } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, newStreamPlayer, type StreamPlayer } from "./stream.ts";

export { FEEDBACK_MS } from "./stream.ts";

export interface SleighPlayer extends BasePlayer, StreamPlayer {
  sleigh: Sleigh;
  color: string;
  /** Steering wheel, −1 (full left) … 1 (full right). */
  wheel: number;
  /** Correct answers this round: flying time for the next flight. */
  points: number;
  /** Flying time left this flight (as of the last tick), ms. */
  fuelMs: number;
  /** Flying time this flight started with, ms. */
  fuelStartMs: number;
  /** Server time the flying time runs out (0 when the sleigh has none). */
  fuelEndsAt: number;
  /** Still moving this flight (has fuel or is gliding to a stop). */
  moving: boolean;
  /** Presents delivered over the whole game. */
  presents: number;
  /** Seq of this player's latest delivery, or null. */
  lastDelivery: number | null;
  /** Bumps into the city wall over the whole game. */
  bumps: number;
  /** Time actually spent flying with fuel, over the whole game, ms. */
  flownMs: number;
}

interface SleighOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  /** Every flight tick: only for pushing the host's view (sleighs move). */
  onTick?: () => void;
  onFinish?: (game: SleighGame) => void;
}

interface SleighGameSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
  /** Houses waiting for a present (SLEIGH_HOUSE_CHOICES). */
  houses: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Santa's Sleigh Run: answer questions for flying time, then steer over the city delivering
 * presents (fly over a house that still needs one). Rounds repeat until every present is
 * delivered; most presents wins.
 */
export class SleighGame {
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  /** Every house in the city (placed once, when the game is created). */
  readonly houses: SleighHouse[];
  readonly roster = new Roster<SleighPlayer>();
  phase: SleighPhase = "countdown";
  round = 0;
  phaseEndsAt = 0;
  phaseDurationMs = SLEIGH_COUNTDOWN_MS;
  /** Every present has been delivered (the finale plays, then the podium). */
  finished = false;
  lastDelivery: SleighDelivery | null = null;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private tickTimer: unknown = null;
  private lastTickAt = 0;
  private deliverySeq = 0;
  /** Sleighs placed on the launch pad so far (also picks the paint). */
  private slotCount = 0;
  /** Launch pad size the lobby's players were placed for. */
  private slotTotal = 0;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onTick: () => void;
  private readonly onFinish: (game: SleighGame) => void;

  constructor(quiz: Quiz, settings: SleighGameSettings, opts: SleighOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    const n = Number.isFinite(settings.houses) ? Math.min(SLEIGH_MAX_HOUSES, Math.max(SLEIGH_MIN_HOUSES, Math.floor(settings.houses))) : SLEIGH_DEFAULT_HOUSES;
    this.houses = pickHouses(n, this.rng).map((h) => ({ ...h, deliveredBy: null }));
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onTick = opts.onTick ?? (() => {});
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), fanned out round the launch pad in join order. */
  static fromLobby(lobby: Game, opts: SleighOptions = {}): SleighGame {
    const game = new SleighGame(lobby.quiz, { shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect, houses: lobby.sleigh.houses }, opts);
    game.slotTotal = lobby.players.size;
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, SleighPlayer> {
    return this.roster.players;
  }

  get delivered(): number {
    return this.houses.filter((h) => h.deliveredBy !== null).length;
  }

  private newPlayer(base: BasePlayer): SleighPlayer {
    const i = this.slotCount++;
    return {
      ...base,
      ...newStreamPlayer(),
      sleigh: launchSlot(i, Math.max(this.slotTotal, i + 1)),
      color: sleighColor(i),
      wheel: 0,
      points: 0,
      fuelMs: 0,
      fuelStartMs: 0,
      fuelEndsAt: 0,
      moving: false,
      presents: 0,
      lastDelivery: null,
      bumps: 0,
      flownMs: 0,
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
    this.setPhase("intro", SLEIGH_INTRO_MS, () => this.beginFlight());
    this.onChange();
  }

  /** Points become flying time (unspent time is lost), sleighs with time launch, and the tick loop starts. */
  private beginFlight(): void {
    const now = this.clock.now();
    for (const p of this.players.values()) {
      const fuel = p.points * SLEIGH_MS_PER_POINT;
      p.points = 0;
      p.fuelMs = fuel;
      p.fuelStartMs = fuel;
      p.fuelEndsAt = fuel > 0 ? now + fuel : 0;
      p.sleigh = fuel > 0 ? launch(p.sleigh) : { ...p.sleigh, speed: 0, scraping: false };
      p.moving = fuel > 0;
    }
    this.setPhase("flight", SLEIGH_DRIVE_CAP_MS, () => this.endFlight());
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
    if (this.phase !== "flight" || this.finished) return;
    const now = this.clock.now();
    const dt = Math.max(0, now - this.lastTickAt);
    const from = this.lastTickAt;
    this.lastTickAt = now;
    let stopped = false;
    let anyMoving = false;
    const flew: SleighPlayer[] = [];
    for (const p of this.players.values()) {
      if (!p.moving) continue;
      const wheel = p.connected ? p.wheel : 0;
      const fuelLeft = Math.max(0, p.fuelEndsAt - from);
      let sleigh = p.sleigh;
      let bumps = 0;
      const step = (fuel: boolean, ms: number) => {
        if (ms <= 0) return;
        const r = stepSleigh(sleigh, wheel, fuel, ms);
        sleigh = r.sleigh;
        if (r.bump) bumps++;
      };
      const flown = Math.min(fuelLeft, dt);
      step(true, flown);
      step(false, dt - flown);
      p.sleigh = sleigh;
      p.bumps += bumps;
      p.flownMs += flown;
      p.fuelMs = Math.max(0, p.fuelEndsAt - now);
      p.moving = p.fuelMs > 0 || sleigh.speed > 0;
      flew.push(p);
      if (p.moving) anyMoving = true;
      else stopped = true;
    }
    const delivered = this.deliver(flew);
    this.onTick();
    if (this.houses.every((h) => h.deliveredBy !== null)) return this.beginFinale();
    if (!anyMoving) return this.hold();
    this.scheduleTick();
    if (stopped || delivered) this.onChange();
  }

  /**
   * Sleighs over a house that still needs its present deliver it. If several reach the same
   * house in the same tick, the one nearest its centre wins (then the earliest joiner).
   */
  private deliver(flew: SleighPlayer[]): boolean {
    let any = false;
    for (const h of this.houses) {
      if (h.deliveredBy !== null) continue;
      let best: SleighPlayer | null = null;
      let bestDist = Infinity;
      for (const p of flew) {
        if (!hitsHouse(p.sleigh, h)) continue;
        const d = houseDistance(p.sleigh, h);
        if (d < bestDist) {
          best = p;
          bestDist = d;
        }
      }
      if (!best) continue;
      h.deliveredBy = best.id;
      best.presents++;
      const seq = ++this.deliverySeq;
      best.lastDelivery = seq;
      this.lastDelivery = { seq, house: h.id, playerId: best.id };
      any = true;
    }
    return any;
  }

  /** The last present is down a chimney: everyone stops, a moment of celebration, then the podium. */
  private beginFinale(): void {
    this.finished = true;
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.parkSleighs();
    this.setPhase("flight", SLEIGH_FINALE_MS, () => this.finish());
    this.onChange();
  }

  /** Every sleigh has stopped: hold the flight a moment before moving on. */
  private hold(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.setPhase("flight", SLEIGH_DRIVE_HOLD_MS, () => this.endFlight());
    this.onChange();
  }

  /** The flight is over: sleighs stay where they are and the next round starts (no round limit). */
  private endFlight(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.parkSleighs();
    this.beginRound();
  }

  /** Sleighs stop where they are (positions carry over to the next flight). */
  private parkSleighs(): void {
    for (const p of this.players.values()) {
      p.sleigh = { ...p.sleigh, speed: 0, scraping: false };
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
    this.parkSleighs();
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

  /** Answer during the quiz phase; a correct answer earns a point (SLEIGH_MS_PER_POINT of flying). */
  answer(playerId: string, seq: number, option: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.current || this.phase !== "quiz") return false;
    const correct = this.stream.answer(p, seq, option);
    if (correct === null) return false;
    if (correct) p.points++;
    this.onActivity(p.id);
    return true;
  }

  /** Turn the wheel (flight phase only, not during the finale). Stored for the next tick; nothing is broadcast. */
  steer(playerId: string, wheel: number): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "flight" || this.finished || typeof wheel !== "number" || !Number.isFinite(wheel)) return false;
    p.wheel = Math.max(-1, Math.min(1, wheel));
    return true;
  }

  // ---------- results ----------

  /** Most presents first, then most distance (to 0.1); equal on both shares a rank, ordered by correct answers. */
  standings(): SleighStanding[] {
    const dist = (p: SleighPlayer) => r1(p.sleigh.distance);
    const sorted = [...this.players.values()].sort((a, b) => b.presents - a.presents || dist(b) - dist(a) || b.correct - a.correct);
    let rank = 0;
    let prev: SleighPlayer | null = null;
    return sorted.map((p, i) => {
      if (!prev || prev.presents !== p.presents || dist(prev) !== dist(p)) {
        rank = i + 1;
        prev = p;
      }
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        color: p.color,
        rank,
        presents: p.presents,
        distance: dist(p),
        correct: p.correct,
        bumps: p.bumps,
      };
    });
  }

  awards(): SleighAwards {
    const players = [...this.players.values()];
    const topCorrect = Math.max(0, ...players.map((p) => p.correct));
    const flyers = players.filter((p) => p.flownMs > 0);
    const fewest = flyers.length ? Math.min(...flyers.map((p) => p.bumps)) : 0;
    const furthest = Math.max(0, ...players.map((p) => r1(p.sleigh.distance)));
    return {
      mostCorrect: topCorrect > 0 ? { value: topCorrect, nicknames: players.filter((p) => p.correct === topCorrect).map((p) => p.nickname) } : null,
      smoothest: flyers.length ? { value: fewest, nicknames: flyers.filter((p) => p.bumps === fewest).map((p) => p.nickname) } : null,
      furthest: furthest > 0 ? { value: furthest, nicknames: players.filter((p) => r1(p.sleigh.distance) === furthest).map((p) => p.nickname) } : null,
    };
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private fuelLeft(p: SleighPlayer): number {
    return this.phase === "flight" && !this.finished ? Math.max(0, p.fuelEndsAt - this.clock.now()) : 0;
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
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      tick: this.clock.now(),
      houses: this.houses.map((h) => ({ ...h, poly: h.poly.map(([x, y]) => [x, y] as [number, number]), chimney: { ...h.chimney } })),
      delivered: this.delivered,
      total: this.houses.length,
      lastDelivery: this.lastDelivery,
      finished: this.finished,
      sleighs: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.connected,
        color: p.color,
        x: r1(p.sleigh.x),
        y: r1(p.sleigh.y),
        heading: r3(p.sleigh.heading),
        wheel: r3(p.connected ? p.wheel : 0),
        speed: r3(p.sleigh.speed),
        points: p.points,
        fuelMs: this.fuelLeft(p),
        fuelStartMs: p.fuelStartMs,
        moving: this.phase === "flight" && p.moving,
        presents: p.presents,
        distance: r1(p.sleigh.distance),
        bumps: p.bumps,
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
        presents: mine.presents,
        distance: mine.distance,
        awards: [
          ...(aw.mostCorrect?.nicknames.includes(p.nickname) ? ["Most correct answers"] : []),
          ...(aw.smoothest?.nicknames.includes(p.nickname) ? ["Smoothest flyer"] : []),
          ...(aw.furthest?.nicknames.includes(p.nickname) ? ["Furthest flown"] : []),
        ],
      };
    }
    return {
      kind: "sleigh",
      phase: this.phase,
      title: this.title,
      round: this.round,
      phaseRemainingMs: this.remainingMs(),
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, color: p.color, points: p.points, correct: p.correct, presents: p.presents, rank: mine.rank },
      playerCount: this.players.size,
      delivered: this.delivered,
      total: this.houses.length,
      finished: this.finished,
      lastDelivery: p.lastDelivery,
      question: this.phase === "quiz" ? this.stream.questionView(p) : null,
      feedback: this.stream.feedbackView(p),
      fuelMs: this.fuelLeft(p),
      fuelStartMs: this.phase === "flight" ? p.fuelStartMs : 0,
      result,
    };
  }
}

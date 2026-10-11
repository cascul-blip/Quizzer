import type {
  HostRacerState,
  Pacing,
  PlayerRacerView,
  QuestionError,
  QuestionView,
  RacerAwards,
  RacerDriver,
  RacerPhase,
  RacerResult,
  RacerTurn,
  ShuffleOptions,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { RACER_CONFIDENCE_LEVELS, applyRacerTurn, newRacerCar, type RacerCar, type RacerConfidence } from "../../shared/racer-rules.ts";
import { GameError, realClock, shuffle, topErrors, type Clock } from "./common.ts";
import { AUTO_REVEAL_MS, GRACE_MS, preparePlayOrder, type Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";

export { AUTO_REVEAL_MS, GRACE_MS } from "./game.ts";

/** A turn without a driver shows the question this long before the options. */
export const INTRO_MS = 3000;
/** The driver has this long to set the lever; then it is locked where it is. */
export const CONFIDENCE_MS = 20_000;

export const AWARD_MOST_CORRECT = "Most correct answers";
export const AWARD_BEST_DRIVER = "Best driver";

export interface RacerAnswer {
  option: number;
  correct: boolean;
}

export interface RacerPlayer extends BasePlayer {
  /** By question index (play order). */
  answers: (RacerAnswer | undefined)[];
  /** Counted when a question closes, so the numbers give nothing away while it is open. */
  correct: number;
  /** Answered wrong; a question left unanswered is not counted. */
  wrong: number;
  turnsDriven: number;
  /** Mph gained on the turns this player drove. */
  mphGained: number;
  /** Fail points on the turns this player drove. */
  failsAsDriver: number;
}

export interface RacerOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  /** One player answered: they need their own view at once, everyone else can wait a moment. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: RacerGame) => void;
}

export interface RacerGameSettings {
  shuffle: ShuffleOptions;
  pacing?: Pacing;
}

/**
 * Racer: the class shares one car. Each turn a driver bets on how well everyone will answer
 * (confidence → open → reveal); a crashed car has no driver until the class repairs it (intro → open → reveal).
 * Every question is asked once, then the podium.
 */
export class RacerGame {
  readonly kind = "racer";
  readonly quizId: string;
  readonly title: string;
  /** Play order, shuffled if the lobby asked for it. */
  readonly questions: Question[];
  readonly roster = new Roster<RacerPlayer>();
  readonly startedAt = new Date();
  phase: RacerPhase = "intro";
  qIndex = -1;
  pacing: Pacing;
  car: RacerCar = newRacerCar();
  /** This turn's driver, as they were when the turn started. */
  driver: RacerDriver | null = null;
  /** Where the lever is; null on a turn without a driver. */
  lever: RacerConfidence | null = null;
  /** The locked lever, once the question is open. */
  confidence: RacerConfidence | null = null;
  lastTurn: RacerTurn | null = null;
  /** Turns played to the end. */
  turns = 0;
  /** When the current phase's countdown ends; 0 when it has none. */
  phaseEndsAt = 0;
  phaseDurationMs = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  /** Player ids still to drive in this round of the bag. */
  private bag: string[] = [];
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: RacerGame) => void;

  constructor(quiz: Quiz, settings: RacerGameSettings, opts: RacerOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.questions = preparePlayOrder(quiz.questions, settings.shuffle, this.rng);
    this.pacing = settings.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), its shuffle choices and its pacing. */
  static fromLobby(lobby: Game, opts: RacerOptions = {}): RacerGame {
    const game = new RacerGame(lobby.quiz, { shuffle: lobby.shuffle, pacing: lobby.pacing }, opts);
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, RacerPlayer> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  private newPlayer(base: BasePlayer): RacerPlayer {
    return { ...base, answers: [], correct: 0, wrong: 0, turnsDriven: 0, mphGained: 0, failsAsDriver: 0 };
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): RacerPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    // Late joiners get their turn at the wheel in this round of the bag.
    this.bag.splice(Math.floor(this.rng() * (this.bag.length + 1)), 0, player.id);
    this.onChange();
    return player;
  }

  byToken(token: unknown): RacerPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.afterPlayerLeft(playerId);
  }

  kick(playerId: string): RacerPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.bag = this.bag.filter((id) => id !== playerId);
    this.onChange();
    this.afterPlayerLeft(playerId);
    return p;
  }

  /** A driver who leaves while choosing is taken at their word so far; otherwise the question may be complete now. */
  private afterPlayerLeft(playerId: string): void {
    if (this.phase === "confidence" && this.driver?.id === playerId) this.lockIn();
    else this.maybeCloseEarly();
  }

  /**
   * The next driver: a connected player from the shuffled bag, so everyone drives once before anyone drives again.
   * Players who are away keep their place in the bag; once nobody in it is connected, it is refilled with everyone.
   */
  private pickDriver(): RacerPlayer | null {
    const connected = (id: string) => !!this.players.get(id)?.connected;
    let i = this.bag.findIndex(connected);
    if (i < 0) {
      this.bag = shuffle([...this.players.keys()], this.rng);
      i = this.bag.findIndex(connected);
      if (i < 0) return null;
    }
    return this.players.get(this.bag.splice(i, 1)[0]!)!;
  }

  // ---------- player actions ----------

  /** The driver moves the lever. Returns whether it was accepted. */
  setLever(playerId: string, level: RacerConfidence): boolean {
    if (this.phase !== "confidence" || this.driver?.id !== playerId || !this.players.has(playerId)) return false;
    if (!RACER_CONFIDENCE_LEVELS.includes(level)) return false;
    if (this.lever !== level) {
      this.lever = level;
      this.onChange();
    }
    return true;
  }

  /** The driver locks the lever in and opens the question. Returns whether it was accepted. */
  go(playerId: string): boolean {
    if (this.phase !== "confidence" || this.driver?.id !== playerId || !this.players.has(playerId)) return false;
    this.lockIn();
    return true;
  }

  /** One answer per player per question, the driver included. Returns whether it was accepted. */
  answer(playerId: string, qIndex: number, option: number): boolean {
    const p = this.players.get(playerId);
    const q = this.currentQuestion;
    if (!p || !q || this.phase !== "open" || qIndex !== this.qIndex) return false;
    if (p.answers[qIndex]) return false;
    if (!Number.isInteger(option) || option < 0 || option >= q.options.length) return false;
    if (this.clock.now() > this.phaseEndsAt + GRACE_MS) return false;
    p.answers[qIndex] = { option, correct: q.correct.includes(option) };
    if (!this.maybeCloseEarly()) this.onActivity(p.id);
    return true;
  }

  // ---------- host controls ----------

  start(pacing?: Pacing): void {
    if (this.qIndex >= 0) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.pacing = pacing;
    this.beginTurn(0);
  }

  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal") {
      this.clearTimer();
      this.scheduleAuto();
    }
    this.onChange();
  }

  /** Advance to whatever comes next from the current phase. */
  next(): void {
    switch (this.phase) {
      case "intro":
        return this.openQuestion();
      case "confidence":
        return this.lockIn();
      case "open":
        return this.closeQuestion();
      case "reveal":
        return this.afterReveal();
      case "podium":
        return;
    }
  }

  /** Cut the current countdown short: straight to the options, lock the lever where it is, or close the question. */
  skip(): void {
    if (this.phase === "intro") this.openQuestion();
    else if (this.phase === "confidence") this.lockIn();
    else if (this.phase === "open") this.closeQuestion();
  }

  /** Host ends the game now. An open question is settled first; a turn that hadn't opened yet is dropped. */
  end(): void {
    if (this.phase === "podium") return;
    if (this.phase === "open") this.closeQuestion();
    this.finish();
  }

  dispose(): void {
    this.clearTimer();
  }

  // ---------- state machine ----------

  private setPhase(phase: RacerPhase, ms: number, then: (() => void) | null, graceMs = 0): void {
    this.clearTimer();
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = ms > 0 ? this.clock.now() + ms : 0;
    if (then) {
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        then();
      }, ms + graceMs);
    }
  }

  private beginTurn(index: number): void {
    this.qIndex = index;
    this.lever = null;
    this.confidence = null;
    const driver = this.car.crashed ? null : this.pickDriver();
    this.driver = driver && { id: driver.id, nickname: driver.nickname, avatar: driver.avatar };
    if (driver) {
      this.lever = RACER_CONFIDENCE_LEVELS[0]!;
      this.setPhase("confidence", CONFIDENCE_MS, () => this.lockIn());
    } else {
      this.setPhase("intro", INTRO_MS, () => this.openQuestion());
    }
    this.onChange();
  }

  private lockIn(): void {
    if (this.phase !== "confidence") return;
    this.confidence = this.lever;
    this.openQuestion();
  }

  private openQuestion(): void {
    const q = this.currentQuestion;
    if ((this.phase !== "intro" && this.phase !== "confidence") || !q) return;
    this.setPhase("open", q.timeLimitSec * 1000, () => this.closeQuestion(), GRACE_MS);
    this.onChange();
  }

  /** Close as soon as every connected player has answered. Returns whether it closed. */
  private maybeCloseEarly(): boolean {
    if (this.phase !== "open") return false;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length === 0 || !connected.every((p) => p.answers[this.qIndex])) return false;
    this.closeQuestion();
    return true;
  }

  private closeQuestion(): void {
    if (this.phase !== "open") return;
    const players = [...this.players.values()];
    let correct = 0;
    let total = 0;
    for (const p of players) {
      const ans = p.answers[this.qIndex];
      // Everyone here counts, and so does anyone who answered before dropping out; no answer is a wrong answer.
      if (p.connected || ans) total++;
      if (!ans) continue;
      if (ans.correct) {
        correct++;
        p.correct++;
      } else {
        p.wrong++;
      }
    }
    const { car, summary } = applyRacerTurn(this.car, { confidence: this.confidence, correct, total });
    this.car = car;
    const driver = this.driver ? this.players.get(this.driver.id) : undefined;
    if (driver) {
      driver.turnsDriven++;
      driver.mphGained += summary.gain;
      driver.failsAsDriver += summary.fails;
    }
    this.lastTurn = { index: this.qIndex, driver: this.driver, ...summary };
    this.turns++;
    this.phase = "reveal";
    this.scheduleAuto();
    this.onChange();
  }

  private afterReveal(): void {
    if (this.phase !== "reveal") return;
    if (this.qIndex >= this.questions.length - 1) return this.finish();
    this.beginTurn(this.qIndex + 1);
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.setPhase("podium", 0, null);
    this.driver = null;
    this.lever = null;
    this.confidence = null;
    this.onFinish(this);
    this.onChange();
  }

  /** The reveal waits for the host, or moves on by itself with auto pacing. */
  private scheduleAuto(): void {
    if (this.phase !== "reveal") return;
    if (this.pacing === "auto") this.setPhase("reveal", AUTO_REVEAL_MS, () => this.afterReveal());
    else this.setPhase("reveal", 0, null);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- results ----------

  result(): RacerResult {
    return { distance: this.car.distance, topSpeed: this.car.topSpeed, crashes: this.car.crashes, turns: this.turns };
  }

  awards(): RacerAwards {
    const best = (value: (p: RacerPlayer) => number) => {
      const players = [...this.players.values()];
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { mostCorrect: best((p) => p.correct), bestDriver: best((p) => p.mphGained) };
  }

  /** The most-missed questions: wrong answers only, a question left unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private questionView(): QuestionView | null {
    const q = this.currentQuestion;
    if (!q || this.phase === "podium") return null;
    return {
      index: this.qIndex,
      total: this.questions.length,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      timeLimitSec: q.timeLimitSec,
      options: this.phase === "intro" || this.phase === "confidence" ? [] : q.options,
      remainingMs: this.phase === "reveal" ? 0 : this.remainingMs(),
    };
  }

  hostView(): HostRacerState {
    const q = this.currentQuestion;
    const podium = this.phase === "podium";
    const revealed = this.phase === "reveal" && !!q;
    const answering = this.phase === "open" || this.phase === "reveal";
    const answered = answering ? [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is RacerAnswer => !!a) : [];
    return {
      kind: "racer",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      question: this.questionView(),
      driver: this.driver,
      lever: this.lever,
      confidence: this.confidence,
      answeredCount: answered.length,
      playerCount: this.players.size,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        connected: p.connected,
        answered: answering && !!p.answers[this.qIndex],
        correct: p.correct,
        wrong: p.wrong,
        turnsDriven: p.turnsDriven,
        mphGained: p.mphGained,
        failsAsDriver: p.failsAsDriver,
      })),
      correct: revealed ? q!.correct : null,
      answerCounts: revealed ? q!.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      car: { ...this.car },
      lastTurn: this.lastTurn,
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      result: podium ? this.result() : null,
      awards: podium ? this.awards() : null,
      errors: podium ? this.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerRacerView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const q = this.currentQuestion;
    const ans = this.phase === "open" || this.phase === "reveal" ? p.answers[this.qIndex] : undefined;
    let result: PlayerRacerView["result"] = null;
    if (this.phase === "podium") {
      const aw = this.awards();
      result = {
        ...this.result(),
        awards: [
          ...(aw.mostCorrect?.nicknames.includes(p.nickname) ? [AWARD_MOST_CORRECT] : []),
          ...(aw.bestDriver?.nicknames.includes(p.nickname) ? [AWARD_BEST_DRIVER] : []),
        ],
      };
    }
    return {
      kind: "racer",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, wrong: p.wrong, turnsDriven: p.turnsDriven, mphGained: p.mphGained, failsAsDriver: p.failsAsDriver },
      playerCount: this.players.size,
      question: this.questionView(),
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      isDriver: this.driver?.id === p.id,
      driver: this.driver,
      lever: this.lever,
      confidence: this.confidence,
      myChoice: ans?.option ?? null,
      reveal: this.phase === "reveal" && q ? { choice: ans?.option ?? null, correct: q.correct, wasCorrect: !!ans?.correct } : null,
      car: { ...this.car },
      lastTurn: this.lastTurn,
      result,
    };
  }
}

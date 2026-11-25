import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { Pacing, QuestionError, QuestionView } from "../../shared/mode-views.ts";
import type { HostRacerState, PlayerRacerView, RacerAwardKey, RacerDriver, RacerPhase, RacerResult, RacerTurn } from "../../shared/modes/racer.ts";
import { racerShared } from "../../shared/modes/racer.ts";
import type { ShuffleOptions } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { RacerCar, RacerConfidence } from "../../shared/racer-rules.ts";
import { applyRacerTurn, newRacerCar, RACER_CONFIDENCE_LEVELS } from "../../shared/racer-rules.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import type { Clock } from "./common.ts";
import { GameError, preparePlayOrder, realClock, shuffle, topErrors } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import { INTRO_MS, PacedRound } from "./paced-round.ts";
import { GameFinish } from "./phase-timer.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import { most } from "./standings.ts";

export { AUTO_REVEAL_MS, GRACE_MS } from "./common.ts";

/** A turn without a driver shows the question this long before the options (INTRO_MS). */
export { INTRO_MS };
/** The driver has this long to set the lever; then it is locked where it is. */
export const CONFIDENCE_MS = 20_000;

const RACER_AWARD_VALUES: Record<RacerAwardKey, (p: RacerPlayer) => number> = { mostCorrect: (p) => p.correct, bestDriver: (p) => p.mphGained };

export interface RacerAnswer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  text?: string;
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
  failsAsDriver: number;
}

interface RacerOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  /** One player answered: they need their own view at once, everyone else can wait a moment. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: RacerGame) => void;
}

interface RacerGameSettings {
  theme?: SeasonTheme;
  shuffle: ShuffleOptions;
  pacing?: Pacing;
}

/**
 * Racer: the class shares one car. Each turn a driver bets on how well everyone will answer
 * (confidence → open → reveal); a crashed car has no driver until the class repairs it (intro → open → reveal).
 * Every question is asked once, then the podium.
 */
export class RacerGame {
  readonly runningMode = "racer" as const;
  readonly theme: SeasonTheme;
  readonly quizId: string;
  readonly title: string;
  /** Play order, shuffled if the lobby asked for it. */
  readonly questions: Question[];
  readonly roster = new Roster<RacerPlayer>();
  car: RacerCar = newRacerCar();
  /** This turn's driver, as they were when the turn started. */
  driver: RacerDriver | null = null;
  /** Where the lever is; null on a turn without a driver. */
  lever: RacerConfidence | null = null;
  /** The locked lever, once the question is open. */
  confidence: RacerConfidence | null = null;
  lastTurn: RacerTurn | null = null;
  /** Who got the latest closed question wrong (or didn't answer it): they fall out of the car on the reveal. */
  ejected: { id: string; nickname: string; avatar: AvatarChoice }[] = [];
  /** Turns played to the end. */
  turns = 0;

  private readonly clock: Clock;
  private readonly rng: () => number;
  /** Player ids still to drive in this round of the bag. */
  private bag: string[] = [];
  private readonly paced: PacedRound<"confidence" | "podium">;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: RacerGame) => void;
  private readonly gameFinish: GameFinish<RacerGame["phase"], Podium<RacerPlayer, RacerPlayer, RacerAwardKey>>;

  constructor(quiz: Quiz, settings: RacerGameSettings, opts: RacerOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.theme = modeTheme("racer", settings.theme);
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.clock = opts.clock ?? realClock;
    this.paced = new PacedRound<"confidence" | "podium">(this.clock, {
      initial: "intro",
      pacing: settings.pacing ?? "manual",
      questions: () => this.questions,
      asked: () => this.players.values(),
      opensFrom: ["confidence"],
      settle: () => this.settleQuestion(),
      advance: () => this.afterReveal(),
      onChange: () => this.onChange(),
    });
    this.rng = opts.rng ?? Math.random;
    this.questions = preparePlayOrder(quiz.questions, settings.shuffle, this.rng);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
    this.gameFinish = new GameFinish(this.paced.phases, "podium", {
      cleanup: () => {
        this.driver = null;
        this.lever = null;
        this.confidence = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(racerShared.awards) },
      onFinish: () => this.onFinish(this),
      onChange: () => this.onChange(),
    });
  }

  private setup!: LobbyChoices;

  /** The lobby's choices with the pacing as the host left it; the next lobby opens with them. */
  get choices(): LobbyChoices {
    return { ...this.setup, pacing: this.pacing };
  }

  /** Take over a lobby's players (same ids and tokens), its shuffle choices and its pacing. */
  static fromLobby(lobby: LobbyFacts<"racer">, opts: RacerOptions = {}): RacerGame {
    const game = new RacerGame(lobby.quiz, { shuffle: lobby.shuffle, pacing: lobby.pacing, theme: lobby.settings.theme }, opts);
    game.setup = lobby.choices;
    game.roster.adoptFrom(lobby.players, (base) => game.newPlayer(base));
    return game;
  }

  get phase(): RacerPhase {
    return this.paced.phase;
  }

  get qIndex(): number {
    return this.paced.qIndex;
  }

  get pacing(): Pacing {
    return this.paced.pacing;
  }

  /** When the current phase's countdown ends; 0 when it has none. */
  get phaseEndsAt(): number {
    return this.paced.phases.endsAt;
  }

  get phaseDurationMs(): number {
    return this.paced.phases.durationMs;
  }

  get players(): Map<string, RacerPlayer> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.paced.currentQuestion;
  }

  private newPlayer(base: BasePlayer): RacerPlayer {
    return { ...base, answers: [], correct: 0, wrong: 0, turnsDriven: 0, mphGained: 0, failsAsDriver: 0 };
  }

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
    if (!this.roster.setConnected(playerId, connected)) return;
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
    else this.paced.closeIfAllAnswered();
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
  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const taken = this.paced.take(this.players.get(playerId), qIndex, answer, ({ msSinceOpen: _ms, ...a }): RacerAnswer => a);
    if (!taken) return false;
    if (!this.paced.closeIfAllAnswered()) this.onActivity(playerId);
    return true;
  }

  start(pacing?: Pacing): void {
    if (this.qIndex >= 0) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.paced.pacing = pacing;
    this.beginTurn(0);
  }

  setPacing(pacing: Pacing): void {
    this.paced.setPacing(pacing);
    this.onChange();
  }

  next(): void {
    switch (this.phase) {
      case "confidence":
        return this.lockIn();
      case "intro":
      case "open":
      case "reveal":
        return this.paced.next();
      case "podium":
        return;
    }
  }

  /** Cut the current countdown short: straight to the options, lock the lever where it is, or close the question. */
  skip(): void {
    if (this.phase === "confidence") this.lockIn();
    else this.paced.skip();
  }

  /** Host ends the game now. An open question is settled first; a turn that hadn't opened yet is dropped. */
  end(): void {
    if (this.gameFinish.finished) return;
    if (this.phase === "open") this.paced.close();
    this.gameFinish.finish();
  }

  dispose(): void {
    this.paced.phases.dispose();
  }

  private beginTurn(index: number): void {
    this.paced.begin(index);
    this.lever = null;
    this.confidence = null;
    const driver = this.car.crashed ? null : this.pickDriver();
    this.driver = driver && { id: driver.id, nickname: driver.nickname, avatar: driver.avatar };
    if (driver) {
      this.lever = RACER_CONFIDENCE_LEVELS[0]!;
      this.paced.phases.set("confidence", CONFIDENCE_MS, () => this.lockIn());
      this.onChange();
    } else {
      this.paced.intro(index);
    }
  }

  private lockIn(): void {
    if (this.phase !== "confidence") return;
    this.confidence = this.lever;
    this.paced.open();
  }

  /** Apply the turn to the shared car and tally the question that just closed. */
  private settleQuestion(): void {
    const players = [...this.players.values()];
    let correct = 0;
    let total = 0;
    this.ejected = [];
    for (const p of players) {
      const ans = p.answers[this.qIndex];
      const participated = p.connected || !!ans;
      // No answer counts as wrong, so idle players can't ride out a question.
      const failed = participated && !ans?.correct;
      if (participated) total++;
      if (failed) this.ejected.push({ id: p.id, nickname: p.nickname, avatar: p.avatar });
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
      driver.mphGained += summary.gainMph;
      driver.failsAsDriver += summary.fails;
    }
    this.lastTurn = { index: this.qIndex, driver: this.driver, ...summary };
    this.turns++;
  }

  private afterReveal(): void {
    if (this.phase !== "reveal") return;
    if (this.qIndex >= this.questions.length - 1) return this.gameFinish.finish();
    this.beginTurn(this.qIndex + 1);
  }

  result(): RacerResult {
    return { distanceMiles: this.car.distanceMiles, topSpeedMph: this.car.topSpeedMph, crashes: this.car.crashes, turns: this.turns };
  }

  /** The class shares one result, so every player shares one place; the results sheet lists the most correct first, then the best driver. */
  private buildPodium(): Podium<RacerPlayer, RacerPlayer, RacerAwardKey> {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: [],
      then: [most((p) => p.correct), most((p) => p.mphGained)],
      players,
      entryOf: (p) => p,
      awards: { labels: racerShared.awards, values: RACER_AWARD_VALUES },
    });
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): Podium<RacerPlayer, RacerPlayer, RacerAwardKey> {
    return this.gameFinish.podium;
  }

  /** The most-missed questions: wrong answers only, a question left unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
  }

  private questionView(): QuestionView | null {
    return this.phase === "podium" ? null : this.paced.view();
  }

  hostView(): HostRacerState {
    const q = this.currentQuestion;
    const podium = this.phase === "podium";
    const revealed = this.phase === "reveal" && !!q;
    const answering = this.phase === "open" || this.phase === "reveal";
    const answered = answering ? [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is RacerAnswer => !!a) : [];
    return {
      kind: "racer",
      theme: this.theme,
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
      ejected: revealed ? this.ejected : null,
      phaseRemainingMs: this.paced.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      result: podium ? this.result() : null,
      awards: podium ? this.podium.awards : null,
      errors: podium ? this.errors() : null,
    };
  }

  playerView(playerId: string): PlayerRacerView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const q = this.currentQuestion;
    const ans = this.paced.shownAnswer(p);
    let result: PlayerRacerView["result"] = null;
    if (this.phase === "podium") {
      result = { ...this.result(), awards: this.podium.result(p.id)!.awards };
    }
    return {
      kind: "racer",
      theme: this.theme,
      phase: this.phase,
      title: this.title,
      me: {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        correct: p.correct,
        wrong: p.wrong,
        turnsDriven: p.turnsDriven,
        mphGained: p.mphGained,
        failsAsDriver: p.failsAsDriver,
      },
      playerCount: this.players.size,
      question: this.questionView(),
      phaseRemainingMs: this.paced.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      isDriver: this.driver?.id === p.id,
      driver: this.driver,
      lever: this.lever,
      confidence: this.confidence,
      myChoice: ans && ans.option >= 0 ? ans.option : null,
      myText: ans?.text ?? null,
      reveal: this.phase === "reveal" && q ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q.correct, wasCorrect: !!ans?.correct } : null,
      car: { ...this.car },
      lastTurn: this.lastTurn,
      result,
    };
  }
}

/** Racer: one row per player; the class's shared distance, top speed and crashes are in every row. */
function racerColumns(game: RacerGame): Column<RacerPlayer>[] {
  const round = (v: number) => Math.round(v * 100) / 100;
  return [
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Correct", value: (p) => p.correct },
    { header: "Wrong", value: (p) => p.wrong },
    { header: "Accuracy %", value: (p) => accuracy(p) },
    { header: "Turns driven", value: (p) => p.turnsDriven },
    { header: "Mph gained", value: (p) => p.mphGained },
    { header: "Fail points as driver", value: (p) => p.failsAsDriver },
    { header: "Class distance (miles)", value: () => round(game.car.distanceMiles) },
    { header: "Top speed (mph)", value: () => round(game.car.topSpeedMph) },
    { header: "Crashes", value: () => game.car.crashes },
  ];
}

export function buildRacerResults(game: RacerGame): ResultsSheet {
  return sheet(
    racerColumns(game),
    game.podium.rows.map((r) => r.player),
  );
}

export const racerMode: ModeEntry<"racer"> = {
  ...racerShared,
  defaultSettings: { theme: THEMED_MODES.racer.default },
  readSettings: (raw, current) => ({ theme: pickTheme(raw.theme, modeTheme("racer", current.theme), "racer") }),
  start(lobby, ctx) {
    const game = RacerGame.fromLobby(lobby, handoffOptions(ctx));
    return { game, log: `${this.name} started with ${game.players.size} player(s), ${game.questions.length} question(s)` };
  },
  pacing: (game) => game,
  teams: () => null,
  results: buildRacerResults,
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "racer.lever":
        return game.setLever(playerId, msg.level) ? undefined : "resend";
      case "racer.go":
        return game.go(playerId) ? undefined : "resend";
      case "racer.answer":
        return game.answer(playerId, Number(msg.index), answerOf(msg)) ? undefined : "resend";
      default:
        return unhandled(msg);
    }
  },
};

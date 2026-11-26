import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
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
import { GameError, preparePlayOrder, shuffle, topErrors } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import type { PacedAnswer } from "./paced-round.ts";
import { INTRO_MS } from "./paced-round.ts";
import { PacedSession } from "./paced-session.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { most } from "./standings.ts";

export { AUTO_REVEAL_MS, GRACE_MS } from "./common.ts";

export { INTRO_MS };
export const CONFIDENCE_MS = 20_000;

const RACER_AWARD_VALUES: Record<RacerAwardKey, (p: RacerPlayer) => number> = { mostCorrect: (p) => p.correct, mostMphGained: (p) => p.mphGained };

export type RacerAnswer = Pick<PacedAnswer, "option" | "text" | "correct">;

export interface RacerPlayer extends BasePlayer {
  answers: (RacerAnswer | undefined)[];
  /** why: counted when a question closes, so the numbers give nothing away while it is open. */
  correct: number;
  wrong: number;
  turnsDriven: number;
  mphGained: number;
  failsAsDriver: number;
}

interface RacerOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: RacerGame) => void;
}

interface RacerGameSettings {
  theme?: SeasonTheme;
  shuffle: ShuffleOptions;
  pacing?: Pacing;
}

/** why: a crashed car has no driver until the class repairs it, so that turn runs intro → open → reveal. */
export class RacerGame {
  readonly runningMode = "racer" as const;
  readonly theme: SeasonTheme;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  car: RacerCar = newRacerCar();
  driver: RacerDriver | null = null;
  lever: RacerConfidence | null = null;
  confidence: RacerConfidence | null = null;
  lastTurn: RacerTurn | null = null;
  ejected: { id: string; nickname: string; avatar: AvatarChoice }[] = [];
  turns = 0;

  private bag: string[] = [];
  private readonly session: PacedSession<RacerPlayer, "confidence", Podium<RacerPlayer, RacerPlayer, RacerAwardKey>, RacerGame>;

  constructor(quiz: Quiz, settings: RacerGameSettings, opts: RacerOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.theme = modeTheme("racer", settings.theme);
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.session = new PacedSession<RacerPlayer, "confidence", Podium<RacerPlayer, RacerPlayer, RacerAwardKey>, RacerGame>({
      game: this,
      clock: opts.clock,
      rng: opts.rng,
      initial: "intro",
      pacing: settings.pacing ?? "manual",
      questions: () => this.questions,
      opensFrom: ["confidence"],
      settle: () => this.settleQuestion(),
      advance: () => this.afterReveal(),
      cleanup: () => {
        this.driver = null;
        this.lever = null;
        this.confidence = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(racerShared.awards) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: opts.onFinish },
    });
    this.questions = preparePlayOrder(quiz.questions, settings.shuffle, this.session.rng);
  }

  private setup!: LobbyChoices;

  get choices(): LobbyChoices {
    return { ...this.setup, pacing: this.pacing };
  }

  static fromLobby(lobby: LobbyFacts<"racer">, opts: RacerOptions = {}): RacerGame {
    const game = new RacerGame(lobby.quiz, { shuffle: lobby.shuffle, pacing: lobby.pacing, theme: lobby.settings.theme }, opts);
    game.setup = lobby.choices;
    game.session.adoptPlayers(lobby.players, (base) => game.newPlayer(base));
    return game;
  }

  get phase(): RacerPhase {
    return this.session.paced.phase;
  }

  get qIndex(): number {
    return this.session.paced.qIndex;
  }

  get pacing(): Pacing {
    return this.session.paced.pacing;
  }

  get phaseEndsAt(): number {
    return this.session.paced.phases.endsAt;
  }

  get phaseDurationMs(): number {
    return this.session.paced.phases.durationMs;
  }

  get players(): Map<string, RacerPlayer> {
    return this.session.players;
  }

  get currentQuestion(): Question | null {
    return this.session.paced.currentQuestion;
  }

  private newPlayer(base: BasePlayer): RacerPlayer {
    return { ...base, answers: [], correct: 0, wrong: 0, turnsDriven: 0, mphGained: 0, failsAsDriver: 0 };
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): RacerPlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base));
    // why: late joiners get their turn at the wheel in this round of the bag.
    this.bag.splice(Math.floor(this.session.rng() * (this.bag.length + 1)), 0, player.id);
    this.session.changed();
    return player;
  }

  byToken(token: unknown): RacerPlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!connected && this.isChoosing(playerId)) {
      if (this.session.markDisconnectedQuietly(playerId)) this.lockIn();
    } else {
      this.session.setConnected(playerId, connected);
    }
  }

  kick(playerId: string): RacerPlayer | null {
    const choosing = this.isChoosing(playerId);
    const p = this.session.removePlayer(playerId);
    if (!p) return null;
    this.bag = this.bag.filter((id) => id !== playerId);
    if (choosing) this.lockIn();
    else this.session.playerLeft();
    return p;
  }

  private isChoosing(playerId: string): boolean {
    return this.phase === "confidence" && this.driver?.id === playerId;
  }

  /** why: take connected players from the bag without removing absent players who may return before the next refill. */
  private pickDriver(): RacerPlayer | null {
    const connected = (id: string) => !!this.players.get(id)?.connected;
    let i = this.bag.findIndex(connected);
    if (i < 0) {
      this.bag = shuffle([...this.players.keys()], this.session.rng);
      i = this.bag.findIndex(connected);
      if (i < 0) return null;
    }
    return this.players.get(this.bag.splice(i, 1)[0]!)!;
  }

  setLever(playerId: string, level: RacerConfidence): boolean {
    if (this.phase !== "confidence" || this.driver?.id !== playerId || !this.players.has(playerId)) return false;
    if (!RACER_CONFIDENCE_LEVELS.includes(level)) return false;
    if (this.lever !== level) {
      this.lever = level;
      this.session.changed();
    }
    return true;
  }

  go(playerId: string): boolean {
    if (this.phase !== "confidence" || this.driver?.id !== playerId || !this.players.has(playerId)) return false;
    this.lockIn();
    return true;
  }

  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const taken = this.session.paced.take(this.players.get(playerId), qIndex, answer, ({ msSinceOpen: _ms, ...a }): RacerAnswer => a);
    if (!taken) return false;
    this.session.answered(playerId);
    return true;
  }

  start(pacing?: Pacing): void {
    this.session.start(() => {
      if (pacing) this.session.paced.pacing = pacing;
      this.beginTurn(0);
    });
  }

  setPacing(pacing: Pacing): void {
    this.session.setPacing(pacing);
  }

  next(): void {
    switch (this.phase) {
      case "confidence":
        return this.lockIn();
      case "intro":
      case "open":
      case "reveal":
        return this.session.paced.next();
      case "podium":
        return;
    }
  }

  skip(): void {
    if (this.phase === "confidence") this.lockIn();
    else this.session.paced.skip();
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  private beginTurn(index: number): void {
    this.session.paced.begin(index);
    this.lever = null;
    this.confidence = null;
    const driver = this.car.crashed ? null : this.pickDriver();
    this.driver = driver && { id: driver.id, nickname: driver.nickname, avatar: driver.avatar };
    if (driver) {
      this.lever = RACER_CONFIDENCE_LEVELS[0]!;
      this.session.paced.phases.set("confidence", CONFIDENCE_MS, () => this.lockIn());
      this.session.changed();
    } else {
      this.session.paced.intro(index);
    }
  }

  // why: this also settles a departing driver's choice using the last position they sent.
  private lockIn(): void {
    if (this.phase !== "confidence") return;
    this.confidence = this.lever;
    this.session.paced.open();
  }

  private settleQuestion(): void {
    const players = [...this.players.values()];
    let correct = 0;
    let total = 0;
    this.ejected = [];
    for (const p of players) {
      const ans = p.answers[this.qIndex];
      const participated = p.connected || !!ans;
      // why: a connected player who skips the question is ejected without adding a wrong answer to their record.
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
    if (this.qIndex >= this.questions.length - 1) return this.session.end();
    this.beginTurn(this.qIndex + 1);
  }

  result(): RacerResult {
    return { distanceMiles: this.car.distanceMiles, topSpeedMph: this.car.topSpeedMph, crashes: this.car.crashes, turns: this.turns };
  }

  /** why: the class shares one result, so every player shares one place. */
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

  get podium(): Podium<RacerPlayer, RacerPlayer, RacerAwardKey> {
    return this.session.podium;
  }

  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
  }

  private questionView(): QuestionView | null {
    return this.phase === "podium" ? null : this.session.paced.view();
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
      phaseRemainingMs: this.session.paced.phases.remainingMs(),
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
    const ans = this.session.paced.shownAnswer(p);
    let result: PlayerRacerView["result"] = null;
    if (this.phase === "podium") {
      result = { ...this.result(), awards: this.podium.result(p.id)?.awards ?? [] };
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
      phaseRemainingMs: this.session.paced.phases.remainingMs(),
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

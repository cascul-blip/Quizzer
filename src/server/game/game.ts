import {
  MAX_TEAMS,
  TOWER_MINUTES,
  type GameMode,
  type HostGameState,
  type Pacing,
  type Phase,
  type PlayerView,
  type QuestionView,
  type RankedEntry,
  type ShuffleOptions,
  type TowerSettings,
} from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, assignTeams, realClock, shuffle, shuffleOptions, teamInfo, type Clock } from "./common.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { rankScores, scoreAnswer } from "./scoring.ts";

export { GameError, MAX_NICKNAME, MAX_PLAYERS, cleanNickname, realClock, type Clock } from "./common.ts";

export const INTRO_MS = 3000;
export const AUTO_REVEAL_MS = 5000;
export const AUTO_LEADERBOARD_MS = 5000;
/** Answers sent just before the deadline may arrive slightly after it. */
export const GRACE_MS = 500;
const LEADERBOARD_SIZE = 10;
export const DEFAULT_TOWER: TowerSettings = { teams: 2, minutes: 5, monster: true };

export interface Answer {
  option: number;
  correct: boolean;
  points: number;
  ms: number;
}

export interface Player extends BasePlayer {
  score: number;
  /** Points gained on the most recently closed question. */
  lastDelta: number;
  /** Consecutive correct answers up to the most recently closed question. */
  streak: number;
  answers: (Answer | undefined)[];
}

/** Shuffle once per game (same order for everyone); correct indices are remapped. */
export function preparePlayOrder(source: Question[], opts: ShuffleOptions, rng: () => number = Math.random): Question[] {
  let questions = source.map((q) => ({ ...q, options: [...q.options], correct: [...q.correct] }));
  if (opts.questions) questions = shuffle(questions, rng);
  if (opts.answers) questions = questions.map((q) => shuffleOptions(q, rng));
  return questions;
}

export interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  onFinish?: (game: Game) => void;
  /** Initial lobby choices (e.g. carried over from the previous game). */
  mode?: GameMode;
  tower?: TowerSettings;
}

/**
 * A Classic game: lobby → (intro → open → reveal → leaderboard)* → podium.
 * It also serves as the lobby for every mode; in Tallest Tower mode the hub
 * hands its players to a TowerGame on start.
 */
export class Game {
  readonly kind = "classic";
  readonly quiz: Quiz;
  readonly quizId: string;
  readonly title: string;
  /** Play order; fixed (and shuffled if chosen) when the game starts. */
  questions: Question[];
  phase: Phase = "lobby";
  qIndex = -1;
  pacing: Pacing;
  shuffle: ShuffleOptions;
  mode: GameMode;
  tower: TowerSettings;
  /** When the current phase's countdown ends (intro/open), for views. */
  phaseEndsAt = 0;
  openedAt = 0;
  readonly roster = new Roster<Player>();
  readonly startedAt = new Date();

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly source: Question[];
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onFinish: (game: Game) => void;

  constructor(quiz: Quiz, opts: GameOptions = {}) {
    this.quiz = quiz;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.source = quiz.questions;
    this.questions = preparePlayOrder(quiz.questions, { questions: false, answers: false });
    this.shuffle = { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
    this.rng = opts.rng ?? Math.random;
    this.clock = opts.clock ?? realClock;
    this.pacing = opts.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onFinish = opts.onFinish ?? (() => {});
    this.mode = opts.mode ?? "classic";
    this.tower = { ...(opts.tower ?? DEFAULT_TOWER) };
  }

  get players(): Map<string, Player> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  // ---------- players ----------

  join(rawNickname: unknown): Player {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, (base) => ({ ...base, score: 0, lastDelta: 0, streak: 0, answers: [] }));
    this.onChange();
    return player;
  }

  byToken(token: unknown): Player | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.maybeCloseEarly();
  }

  kick(playerId: string): Player | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.onChange();
    this.maybeCloseEarly();
    return p;
  }

  answer(playerId: string, qIndex: number, option: number): boolean {
    const p = this.players.get(playerId);
    const q = this.currentQuestion;
    if (!p || !q || this.phase !== "open" || qIndex !== this.qIndex) return false;
    if (p.answers[qIndex]) return false;
    if (!Number.isInteger(option) || option < 0 || option >= q.options.length) return false;
    const now = this.clock.now();
    if (now > this.phaseEndsAt + GRACE_MS) return false;
    const ms = Math.max(0, now - this.openedAt);
    const correct = q.correct.includes(option);
    p.answers[qIndex] = { option, correct, points: scoreAnswer(correct, ms, q.timeLimitSec), ms };
    this.onChange();
    this.maybeCloseEarly();
    return true;
  }

  // ---------- host controls ----------

  start(pacing?: Pacing): void {
    if (this.phase !== "lobby") throw new GameError("The game has already started");
    if (this.questions.length === 0) throw new GameError("This quiz has no questions");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.pacing = pacing;
    this.questions = preparePlayOrder(this.source, this.shuffle, this.rng);
    this.enterIntro(0);
  }

  setShuffle(opts: ShuffleOptions): void {
    if (this.phase !== "lobby") throw new GameError("Shuffle can only be changed before the game starts");
    this.shuffle = { questions: !!opts.questions, answers: !!opts.answers };
    this.onChange();
  }

  setMode(mode: GameMode): void {
    if (this.phase !== "lobby") throw new GameError("The game mode can only be changed before the game starts");
    if (mode !== "classic" && mode !== "tower" && mode !== "submarine") throw new GameError("Unknown game mode");
    this.mode = mode;
    this.onChange();
  }

  setTower(settings: Omit<TowerSettings, "monster"> & { monster?: boolean }): void {
    if (this.phase !== "lobby") throw new GameError("Tower settings can only be changed before the game starts");
    const teams = Math.trunc(Number(settings.teams));
    const minutes = Number(settings.minutes);
    if (!(teams >= 1 && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between 1 and ${MAX_TEAMS}`);
    if (!(TOWER_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    this.tower = { teams, minutes, monster: settings.monster === undefined ? this.tower.monster : !!settings.monster };
    this.onChange();
  }

  /** Team index per player (join order) for the Tallest Tower preview. */
  private teamPreview(): Map<string, number> {
    const ids = [...this.players.keys()];
    const teams = assignTeams(ids.length, this.tower.teams);
    return new Map(ids.map((id, i) => [id, teams[i]!]));
  }

  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal" || this.phase === "leaderboard") {
      this.clearTimer();
      this.scheduleAuto();
    }
    this.onChange();
  }

  /** Advance to whatever comes next from the current phase. */
  next(): void {
    switch (this.phase) {
      case "lobby":
        return this.start();
      case "intro":
        return this.openQuestion();
      case "open":
        return this.closeQuestion();
      case "reveal":
        return this.afterReveal();
      case "leaderboard":
        return this.enterIntro(this.qIndex + 1);
      case "podium":
        return;
    }
  }

  skip(): void {
    if (this.phase === "intro") this.openQuestion();
    if (this.phase === "open") this.closeQuestion();
  }

  end(): void {
    if (this.phase === "podium") return;
    if (this.phase === "open") this.closeQuestion();
    this.finish();
  }

  dispose(): void {
    this.clearTimer();
  }

  // ---------- state machine ----------

  private enterIntro(index: number): void {
    this.clearTimer();
    this.phase = "intro";
    this.qIndex = index;
    this.phaseEndsAt = this.clock.now() + INTRO_MS;
    this.timer = this.clock.setTimeout(() => this.openQuestion(), INTRO_MS);
    this.onChange();
  }

  private openQuestion(): void {
    const q = this.currentQuestion;
    if (this.phase !== "intro" || !q) return;
    this.clearTimer();
    this.phase = "open";
    this.openedAt = this.clock.now();
    this.phaseEndsAt = this.openedAt + q.timeLimitSec * 1000;
    this.timer = this.clock.setTimeout(() => this.closeQuestion(), q.timeLimitSec * 1000 + GRACE_MS);
    this.onChange();
  }

  private maybeCloseEarly(): void {
    if (this.phase !== "open") return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.answers[this.qIndex])) this.closeQuestion();
  }

  private closeQuestion(): void {
    if (this.phase !== "open") return;
    this.clearTimer();
    for (const p of this.players.values()) {
      const ans = p.answers[this.qIndex];
      p.score += ans?.points ?? 0;
      p.lastDelta = ans?.points ?? 0;
      p.streak = ans?.correct ? p.streak + 1 : 0;
    }
    this.phase = "reveal";
    this.phaseEndsAt = 0;
    this.scheduleAuto();
    this.onChange();
  }

  private afterReveal(): void {
    this.clearTimer();
    if (this.qIndex >= this.questions.length - 1) return this.finish();
    this.phase = "leaderboard";
    this.scheduleAuto();
    this.onChange();
  }

  private finish(): void {
    this.clearTimer();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  private scheduleAuto(): void {
    if (this.pacing !== "auto") return;
    if (this.phase === "reveal") this.timer = this.clock.setTimeout(() => this.afterReveal(), AUTO_REVEAL_MS);
    else if (this.phase === "leaderboard") this.timer = this.clock.setTimeout(() => this.enterIntro(this.qIndex + 1), AUTO_LEADERBOARD_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- views ----------

  ranked(): (Player & { rank: number })[] {
    return rankScores([...this.players.values()]);
  }

  leaderboard(limit = LEADERBOARD_SIZE): RankedEntry[] {
    return this.ranked()
      .slice(0, limit)
      .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score, rank: p.rank, delta: p.lastDelta, streak: p.streak }));
  }

  private questionView(): QuestionView | null {
    const q = this.currentQuestion;
    if (!q || this.phase === "lobby" || this.phase === "podium") return null;
    return {
      index: this.qIndex,
      total: this.questions.length,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      timeLimitSec: q.timeLimitSec,
      options: this.phase === "intro" ? [] : q.options,
      remainingMs: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0,
    };
  }

  private get revealed(): boolean {
    return this.phase === "reveal" || this.phase === "leaderboard";
  }

  hostView(): HostGameState {
    const q = this.currentQuestion;
    const answered = [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is Answer => !!a);
    const hostPlayer = (p: Player) => ({ id: p.id, nickname: p.nickname, score: p.score, connected: p.connected });
    let teams: HostGameState["teams"] = null;
    if (this.phase === "lobby" && this.mode === "tower") {
      const preview = this.teamPreview();
      teams = Array.from({ length: this.tower.teams }, (_, i) => ({
        ...teamInfo(i),
        members: [...this.players.values()].filter((p) => preview.get(p.id) === i).map(hostPlayer),
      }));
    }
    return {
      kind: "classic",
      phase: this.phase,
      mode: this.mode,
      tower: this.tower,
      teams,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      shuffle: this.shuffle,
      players: [...this.players.values()].map(hostPlayer),
      question: this.questionView(),
      correct: this.revealed && q ? q.correct : null,
      answeredCount: this.phase === "lobby" ? 0 : answered.length,
      answerCounts: this.revealed && q ? q.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      leaderboard: this.phase === "lobby" ? [] : this.leaderboard(),
      hasResults: this.phase === "podium",
    };
  }

  playerView(playerId: string): PlayerView {
    const p = this.players.get(playerId);
    if (!p) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const q = this.currentQuestion;
    const me = this.ranked().find((r) => r.id === p.id)!;
    const ans = this.qIndex >= 0 ? p.answers[this.qIndex] : undefined;
    return {
      kind: "player",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, score: p.score, rank: me.rank, streak: p.streak },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: this.phase === "open" || this.revealed ? (ans?.option ?? null) : null,
      result:
        this.revealed && q
          ? { choice: ans?.option ?? null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? this.leaderboard(5) : null,
      team: this.phase === "lobby" && this.mode === "tower" ? teamInfo(this.teamPreview().get(p.id) ?? 0) : null,
    };
  }
}

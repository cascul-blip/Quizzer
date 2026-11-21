import {
  type HostGameState,
  type Pacing,
  type Phase,
  type PlayerView,
  type QuestionError,
  type QuestionView,
  type RankedEntry,
  type ShuffleOptions,
} from "../../shared/protocol.ts";
import { cleanAvatar, randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { MAX_TYPED_ANSWER, checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { AUTO_REVEAL_MS, GRACE_MS, GameError, preparePlayOrder, realClock, topErrors, type Clock } from "./common.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { rankScores, scoreAnswer } from "./scoring.ts";

export { AUTO_REVEAL_MS, GRACE_MS, GameError, preparePlayOrder, type Clock } from "./common.ts";

export const INTRO_MS = 3000;
export const AUTO_LEADERBOARD_MS = 5000;
const LEADERBOARD_SIZE = 10;

interface Answer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  /** What the player typed, for a typed question. */
  text?: string;
  correct: boolean;
  points: number;
  ms: number;
}

interface Player extends BasePlayer {
  score: number;
  /** Points gained on the most recently closed question. */
  lastDelta: number;
  /** Consecutive correct answers up to the most recently closed question. */
  streak: number;
  answers: (Answer | undefined)[];
}

interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  /** A player answered: the hub updates that phone at once and everyone else a moment later. Defaults to onChange. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: Game) => void;
  shuffle?: ShuffleOptions;
}

/** Classic gameplay, from the first question through the podium. */
export class Game {
  readonly quiz: Quiz;
  readonly quizId: string;
  readonly title: string;
  /** Play order; fixed (and shuffled if chosen) when the game starts. */
  questions: Question[];
  phase: Phase = "lobby";
  qIndex = -1;
  pacing: Pacing;
  shuffle: ShuffleOptions;
  readonly runningMode = "classic" as const;
  /** When the current phase's countdown ends (intro/open), for views. */
  phaseEndsAt = 0;
  openedAt = 0;
  readonly roster = new Roster<Player>();

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly source: Question[];
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: Game) => void;
  /** Set while views are built in a batch: what every phone's view shares, computed once. */
  private batch: { ranked?: (Player & { rank: number })[]; rankById?: Map<string, number>; podium?: RankedEntry[] } | null = null;

  constructor(
    quiz: Quiz,
    private readonly lobbyChoices: Pick<HostGameState, "mode" | "settings" | "protect">,
    opts: GameOptions = {},
  ) {
    this.quiz = quiz;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.source = quiz.questions;
    this.questions = preparePlayOrder(quiz.questions, { questions: false, answers: false });
    this.shuffle = opts.shuffle ?? { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
    this.rng = opts.rng ?? Math.random;
    this.clock = opts.clock ?? realClock;
    this.pacing = opts.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  get players(): Map<string, Player> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  // ---------- players ----------

  /** `avatar` is the player's previous pick (if any); otherwise they get a random one to change in the lobby. */
  join(rawNickname: unknown, avatar?: AvatarChoice | null): Player {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), newPlayer);
    this.onChange();
    return player;
  }

  adoptPlayers(players: Iterable<BasePlayer>): void {
    this.roster.adoptFrom(players, newPlayer);
  }

  byToken(token: unknown): Player | null {
    return this.roster.byToken(token);
  }

  /** Change a player's character/accessory; only while waiting in the lobby. */
  setAvatar(playerId: string, avatar: unknown, accessory: unknown): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.phase !== "lobby") throw new GameError("The game has already started");
    const choice = cleanAvatar(avatar, accessory);
    if (!choice) throw new GameError("Unknown avatar");
    p.avatar = choice;
    this.onChange();
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!this.roster.setConnected(playerId, connected)) return;
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

  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const p = this.players.get(playerId);
    const q = this.currentQuestion;
    if (!p || !q || this.phase !== "open" || qIndex !== this.qIndex) return false;
    if (p.answers[qIndex]) return false;
    const correct = checkAnswer(q, answer);
    if (correct === null) return false;
    const now = this.clock.now();
    if (now > this.phaseEndsAt + GRACE_MS) return false;
    const ms = Math.max(0, now - this.openedAt);
    const choice = typeof answer === "string" ? { option: -1, text: answer.slice(0, MAX_TYPED_ANSWER) } : { option: answer };
    p.answers[qIndex] = { ...choice, correct, points: scoreAnswer(correct, ms, q.timeLimitSec), ms };
    this.onActivity(playerId);
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
    else if (this.phase === "open") this.closeQuestion();
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

  /** Per option, who picked it on the current question (fastest first). */
  private answerAvatars(optionCount: number): HostGameState["answerAvatars"] {
    const picks = [...this.players.values()]
      .map((p) => ({ p, a: p.answers[this.qIndex] }))
      .filter((x): x is { p: Player; a: Answer } => !!x.a)
      .sort((x, y) => x.a.ms - y.a.ms);
    return Array.from({ length: optionCount }, (_, i) => picks.filter((x) => x.a.option === i).map((x) => x.p.avatar));
  }

  leaderboard(limit = LEADERBOARD_SIZE): RankedEntry[] {
    return this.rankedNow()
      .slice(0, limit)
      .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: p.rank, delta: p.lastDelta, streak: p.streak }));
  }

  /** The most-missed questions: wrong answers only, a question left unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
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
      // A typed question's accepted answers stay hidden until the reveal.
      options: this.phase === "intro" || (q.type === "text" && !this.revealed) ? [] : q.options,
      ...(q.spots && this.phase !== "intro" ? { spots: q.spots } : {}),
      remainingMs: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0,
    };
  }

  private get revealed(): boolean {
    return this.phase === "reveal" || this.phase === "leaderboard";
  }

  hostView(): HostGameState {
    const q = this.currentQuestion;
    const answered = [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is Answer => !!a);
    const hostPlayer = (p: Player) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected });
    return {
      kind: "classic",
      phase: this.phase,
      ...this.lobbyChoices,
      teams: null,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      shuffle: this.shuffle,
      players: [...this.players.values()].map(hostPlayer),
      question: this.questionView(),
      correct: this.revealed && q ? q.correct : null,
      answeredCount: this.phase === "lobby" ? 0 : answered.length,
      answerCounts: this.revealed && q ? q.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      answerAvatars: this.revealed && q ? this.answerAvatars(q.options.length) : null,
      leaderboard: this.phase === "lobby" ? [] : this.leaderboard(),
      errors: this.phase === "podium" ? this.errors() : null,
    };
  }

  /**
   * Build many views in one go (a broadcast). Nothing changes in between, so the ranking,
   * and the podium are worked out once instead of once per phone.
   */
  viewBatch<T>(build: () => T): T {
    if (this.batch) return build();
    this.batch = {};
    try {
      return build();
    } finally {
      this.batch = null;
    }
  }

  /** ranked(), shared by every view in a batch. */
  private rankedNow(): (Player & { rank: number })[] {
    return this.batch ? (this.batch.ranked ??= this.ranked()) : this.ranked();
  }

  private rankOf(playerId: string): number {
    if (!this.batch) return this.ranked().find((r) => r.id === playerId)!.rank;
    this.batch.rankById ??= new Map(this.rankedNow().map((r) => [r.id, r.rank]));
    return this.batch.rankById.get(playerId)!;
  }

  playerView(playerId: string): PlayerView {
    const p = this.players.get(playerId);
    if (!p) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const q = this.currentQuestion;
    const ans = this.qIndex >= 0 ? p.answers[this.qIndex] : undefined;
    return {
      kind: "classic",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: this.rankOf(p.id), streak: p.streak },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: this.phase === "open" || this.revealed ? (ans && ans.option >= 0 ? ans.option : null) : null,
      myText: this.phase === "open" || this.revealed ? (ans?.text ?? null) : null,
      result:
        this.revealed && q
          ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? (this.batch ? (this.batch.podium ??= this.leaderboard(5)) : this.leaderboard(5)) : null,
      team: null,
    };
  }
}

function newPlayer(base: BasePlayer): Player {
  return { ...base, score: 0, lastDelta: 0, streak: 0, answers: [] };
}

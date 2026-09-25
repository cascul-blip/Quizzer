import type { HostGameState, Pacing, Phase, PlayerView, QuestionView, RankedEntry } from "../../shared/protocol.ts";
import { newId, type Question, type Quiz } from "../../shared/quiz-schema.ts";
import { rankScores, scoreAnswer } from "./scoring.ts";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const INTRO_MS = 3000;
export const AUTO_REVEAL_MS = 5000;
export const AUTO_LEADERBOARD_MS = 5000;
/** Answers sent just before the deadline may arrive slightly after it. */
export const GRACE_MS = 500;
export const MAX_PLAYERS = 200;
export const MAX_NICKNAME = 20;
const LEADERBOARD_SIZE = 10;

export class GameError extends Error {}

export interface Answer {
  option: number;
  correct: boolean;
  points: number;
  ms: number;
}

export interface Player {
  id: string;
  nickname: string;
  token: string;
  score: number;
  /** Points gained on the most recently closed question. */
  lastDelta: number;
  answers: (Answer | undefined)[];
  connected: boolean;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Apply the quiz's shuffle settings once per game; correct indices are remapped. */
export function preparePlayOrder(quiz: Quiz, rng: () => number = Math.random): Question[] {
  let questions = quiz.questions.map((q) => ({ ...q, options: [...q.options], correct: [...q.correct] }));
  if (quiz.settings.shuffleQuestions) questions = shuffle(questions, rng);
  if (quiz.settings.shuffleAnswers) {
    questions = questions.map((q) => {
      if (q.type === "true_false") return q; // keep True/False in the familiar order
      const order = shuffle(q.options.map((_, i) => i), rng);
      return { ...q, options: order.map((i) => q.options[i]!), correct: q.correct.map((c) => order.indexOf(c)).sort((a, b) => a - b) };
    });
  }
  return questions;
}

export function cleanNickname(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("Please enter a nickname");
  const name = raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim();
  if (!name) throw new GameError("Please enter a nickname");
  if ([...name].length > MAX_NICKNAME) throw new GameError(`Nickname must be at most ${MAX_NICKNAME} characters`);
  return name;
}

export interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  onFinish?: (game: Game) => void;
}

/** A single live game: lobby → (intro → open → reveal → leaderboard)* → podium. */
export class Game {
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  phase: Phase = "lobby";
  qIndex = -1;
  pacing: Pacing;
  /** When the current phase's countdown ends (intro/open), for views. */
  phaseEndsAt = 0;
  openedAt = 0;
  readonly players = new Map<string, Player>();
  readonly startedAt = new Date();

  private readonly clock: Clock;
  private readonly tokens = new Map<string, string>();
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onFinish: (game: Game) => void;

  constructor(quiz: Quiz, opts: GameOptions = {}) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = preparePlayOrder(quiz, opts.rng);
    this.clock = opts.clock ?? realClock;
    this.pacing = opts.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onFinish = opts.onFinish ?? (() => {});
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  // ---------- players ----------

  join(rawNickname: unknown): Player {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const nickname = cleanNickname(rawNickname);
    const key = nickname.toLocaleLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLocaleLowerCase() === key) throw new GameError("That nickname is taken, pick another");
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError("This game is full");
    const player: Player = { id: "p" + newId(8), nickname, token: crypto.randomUUID(), score: 0, lastDelta: 0, answers: [], connected: true };
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    this.onChange();
    return player;
  }

  byToken(token: unknown): Player | null {
    if (typeof token !== "string") return null;
    const id = this.tokens.get(token);
    return id ? (this.players.get(id) ?? null) : null;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.maybeCloseEarly();
  }

  kick(playerId: string): Player | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    this.players.delete(playerId);
    this.tokens.delete(p.token);
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
    this.enterIntro(0);
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
      const pts = p.answers[this.qIndex]?.points ?? 0;
      p.score += pts;
      p.lastDelta = pts;
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
      .map((p) => ({ id: p.id, nickname: p.nickname, score: p.score, rank: p.rank, delta: p.lastDelta }));
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
    return {
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      players: [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, score: p.score, connected: p.connected })),
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
      me: { id: p.id, nickname: p.nickname, score: p.score, rank: me.rank },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: this.phase === "open" || this.revealed ? (ans?.option ?? null) : null,
      result:
        this.revealed && q
          ? { choice: ans?.option ?? null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? this.leaderboard(5) : null,
    };
  }
}

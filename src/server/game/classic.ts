import type { AnswerValue } from "../../shared/answer-match.ts";
import { checkAnswer, MAX_TYPED_ANSWER } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { cleanAvatar, randomAvatar } from "../../shared/avatars.ts";
import type { Pacing, QuestionError, QuestionView } from "../../shared/mode-views.ts";
import type { ClassicPhase, HostClassicState, RankedEntry } from "../../shared/modes/classic.ts";
import type { PlayerView, ShuffleOptions } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, preparePlayOrder, realClock, topErrors } from "./common.ts";
import type { LobbyChoices } from "./lobby-facts.ts";
import { INTRO_MS, PacedRound } from "./paced-round.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import { scoreAnswer } from "./scoring.ts";
import { most, rankBy } from "./standings.ts";

export { AUTO_REVEAL_MS, type Clock, GameError, GRACE_MS, preparePlayOrder } from "./common.ts";

export { INTRO_MS };
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
  onFinish?: (game: ClassicGame) => void;
  shuffle?: ShuffleOptions;
}

/** Classic gameplay, from the first question through the podium. */
export class ClassicGame {
  readonly quiz: Quiz;
  readonly quizId: string;
  readonly title: string;
  /** Play order; fixed (and shuffled if chosen) when the game starts. */
  questions: Question[];
  shuffle: ShuffleOptions;
  readonly runningMode = "classic" as const;
  readonly roster = new Roster<Player>();

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly source: Question[];
  private readonly paced: PacedRound<"lobby" | "leaderboard" | "podium">;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: ClassicGame) => void;
  /** Set while views are built in a batch: what every phone's view shares, computed once. */
  private batch: { ranked?: (Player & { rank: number })[]; rankById?: Map<string, number>; podium?: RankedEntry[] } | null = null;

  constructor(quiz: Quiz, opts: GameOptions = {}) {
    this.quiz = quiz;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.source = quiz.questions;
    this.questions = preparePlayOrder(quiz.questions, { questions: false, answers: false });
    this.shuffle = opts.shuffle ?? { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
    this.rng = opts.rng ?? Math.random;
    this.clock = opts.clock ?? realClock;
    this.paced = new PacedRound<"lobby" | "leaderboard" | "podium">(this.clock, {
      initial: "lobby",
      pacing: opts.pacing ?? "manual",
      questions: () => this.questions,
      afterReveal: ["leaderboard"],
      hideAutoCountdown: true,
      settle: () => this.settleQuestion(),
      advance: () => this.afterReveal(),
      onChange: () => this.onChange(),
    });
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  get phase(): ClassicPhase | "lobby" {
    return this.paced.phase;
  }

  get qIndex(): number {
    return this.paced.qIndex;
  }

  get pacing(): Pacing {
    return this.paced.pacing;
  }

  /** What the lobby chose at Start; set by the Classic mode entry. */
  setup!: LobbyChoices;

  /** The lobby's choices with the pacing as the host left it; the next lobby opens with them. */
  get choices(): LobbyChoices {
    return { ...this.setup, pacing: this.pacing };
  }

  get openedAt(): number {
    return this.paced.openedAt;
  }

  /** When the current phase's countdown ends (intro/open), for views; 0 when it has none. */
  get phaseEndsAt(): number {
    return this.paced.phases.endsAt;
  }

  get players(): Map<string, Player> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.paced.currentQuestion;
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
    if (!p || !q || !this.paced.accepts(qIndex)) return false;
    if (p.answers[qIndex]) return false;
    const correct = checkAnswer(q, answer);
    if (correct === null) return false;
    const ms = this.paced.elapsedMs();
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
    if (pacing) this.paced.pacing = pacing;
    this.questions = preparePlayOrder(this.source, this.shuffle, this.rng);
    this.enterIntro(0);
  }

  setShuffle(opts: ShuffleOptions): void {
    if (this.phase !== "lobby") throw new GameError("Shuffle can only be changed before the game starts");
    this.shuffle = { questions: !!opts.questions, answers: !!opts.answers };
    this.onChange();
  }

  setPacing(pacing: Pacing): void {
    this.paced.setPacing(pacing);
    if (this.phase === "leaderboard") {
      this.paced.phases.cancelPhase();
      this.scheduleLeaderboardAuto();
    }
    this.onChange();
  }

  /** Advance to whatever comes next from the current phase. */
  next(): void {
    switch (this.phase) {
      case "lobby":
        return this.start();
      case "intro":
      case "open":
      case "reveal":
        return this.paced.next();
      case "leaderboard":
        return this.enterIntro(this.qIndex + 1);
      case "podium":
        return;
    }
  }

  skip(): void {
    this.paced.skip();
  }

  end(): void {
    if (this.phase === "podium") return;
    if (this.phase === "open") this.paced.close();
    this.finish();
  }

  dispose(): void {
    this.paced.phases.dispose();
  }

  // ---------- state machine ----------

  private enterIntro(index: number): void {
    this.paced.intro(index);
  }

  private maybeCloseEarly(): void {
    if (this.phase !== "open") return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.answers[this.qIndex])) this.paced.close();
  }

  /** Score the question that just closed. */
  private settleQuestion(): void {
    for (const p of this.players.values()) {
      const ans = p.answers[this.qIndex];
      p.score += ans?.points ?? 0;
      p.lastDelta = ans?.points ?? 0;
      p.streak = ans?.correct ? p.streak + 1 : 0;
    }
  }

  private afterReveal(): void {
    if (this.qIndex >= this.questions.length - 1) return this.finish();
    this.paced.phases.enter("leaderboard");
    this.scheduleLeaderboardAuto();
    this.onChange();
  }

  private finish(): void {
    this.paced.phases.enter("podium");
    this.onFinish(this);
    this.onChange();
  }

  private scheduleLeaderboardAuto(): void {
    // The timer runs behind the scenes: views show no countdown for an auto-paced leaderboard.
    if (this.pacing === "auto" && this.phase === "leaderboard") {
      this.paced.phases.set("leaderboard", AUTO_LEADERBOARD_MS, () => this.enterIntro(this.qIndex + 1), { hidden: true });
    }
  }

  // ---------- views ----------

  ranked(): (Player & { rank: number })[] {
    return rankBy([...this.players.values()], [most((p) => p.score)]);
  }

  /** Per option, who picked it on the current question (fastest first). */
  private answerAvatars(optionCount: number): HostClassicState["answerAvatars"] {
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
    return this.phase === "lobby" || this.phase === "podium" ? null : this.paced.view();
  }

  private get revealed(): boolean {
    return this.paced.revealed;
  }

  hostView(): HostClassicState {
    if (this.phase === "lobby") throw new GameError("The game has not started");
    const q = this.currentQuestion;
    const answered = [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is Answer => !!a);
    const hostPlayer = (p: Player) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected });
    return {
      kind: "classic",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      players: [...this.players.values()].map(hostPlayer),
      question: this.questionView(),
      correct: this.revealed && q ? q.correct : null,
      answeredCount: answered.length,
      answerCounts: this.revealed && q ? q.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      answerAvatars: this.revealed && q ? this.answerAvatars(q.options.length) : null,
      leaderboard: this.leaderboard(),
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
    if (this.phase === "lobby") throw new GameError("The game has not started");
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
    };
  }
}

function newPlayer(base: BasePlayer): Player {
  return { ...base, score: 0, lastDelta: 0, streak: 0, answers: [] };
}

type ClassicPlayer = ReturnType<ClassicGame["ranked"]>[number];

/** One row per player (by rank) with per-question answer, correctness, points and time. */
function classicColumns(game: ClassicGame): Column<ClassicPlayer>[] {
  const columns: Column<ClassicPlayer>[] = [
    { header: "Rank", value: (p) => p.rank },
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Score", value: (p) => p.score },
    { header: "Correct answers", value: (p) => p.answers.filter((a) => a?.correct).length },
  ];
  game.questions.forEach((q, i) => {
    const n = i + 1;
    columns.push(
      {
        header: `Q${n} answer (${q.text})`,
        value: (p) => {
          const a = p.answers[i];
          return a ? ((q.type === "text" ? a.text : q.options[a.option]) ?? "") : "";
        },
      },
      {
        header: `Q${n} correct`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.correct ? "yes" : "no") : "no answer";
        },
      },
      { header: `Q${n} points`, value: (p) => p.answers[i]?.points ?? 0 },
      {
        header: `Q${n} time (s)`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.ms / 1000).toFixed(2) : "";
        },
      },
    );
  });
  return columns;
}

export function buildClassicResults(game: ClassicGame): ResultsSheet {
  return sheet(classicColumns(game), game.ranked());
}
